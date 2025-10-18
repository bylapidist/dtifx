import path from 'node:path';

import type { FileGlobSourceConfig } from '../../config/index.js';
import type { BuildRunOptions, BuildRunResult } from '../build-runtime.js';
import { executeBuild } from '../build-runtime.js';
import type {
  RuntimeEnvironment,
  RuntimeEnvironmentFactory,
  RuntimeEnvironmentFactoryRequest,
} from '../environments/runtime-environment.js';
import type { TaskSchedulerPort } from '../../domain/ports/scheduler.js';
import type { WatchSubscription, WatcherPort } from '../../domain/ports/watchers.js';
import type { DomainEventSubscription } from '../../domain/ports/event-bus.js';
import { createBuildStageTelemetryEventSubscriber } from '../../telemetry/build-event-subscriber.js';
import type { TelemetrySpan } from '@dtifx/core/telemetry';

/**
 * Provides contextual metadata that reporters receive when a watch-triggered build completes.
 */
export interface WatchBuildReportContext {
  /**
   * The build output including formatter metadata, metrics, and artifact listings.
   */
  readonly result: BuildRunResult;
  /**
   * A mapping of formatter identifiers to the absolute artifact paths emitted during the build.
   */
  readonly writtenArtifacts: ReadonlyMap<string, readonly string[]>;
  /**
   * A short description of the event that triggered the build iteration.
   */
  readonly reason: string;
}

/**
 * Notification surface that the watch pipeline uses to communicate status updates to the CLI.
 */
export interface WatchPipelineReporter {
  /**
   * Indicates that a build completed successfully.
   */
  buildSuccess(context: WatchBuildReportContext): void;
  /**
   * Indicates that the build failed due to an unexpected error.
   */
  buildFailure(error: unknown, context: { reason: string }): void;
  /**
   * Emits an informational message related to the watch lifecycle.
   */
  watchInfo(message: string): void;
  /**
   * Emits a watch-specific error that did not originate from the build itself.
   */
  watchError(message: string, error: unknown): void;
}

/**
 * Configuration for establishing a watch pipeline session.
 */
export interface WatchPipelineOptions {
  /**
   * Absolute path to the configuration file that should be loaded for each build.
   */
  readonly configPath: string;
  /**
   * Watcher implementation that will observe configuration and token sources.
   */
  readonly watcher: WatcherPort;
  /**
   * Task scheduler that will serialise build executions triggered by watch events.
   */
  readonly scheduler: TaskSchedulerPort;
  /**
   * Factory responsible for constructing runtime environments for each session.
   */
  readonly environmentFactory: RuntimeEnvironmentFactory;
  /**
   * Produces a reporter instance bound to the active runtime environment.
   */
  readonly createReporter: (environment: RuntimeEnvironment) => WatchPipelineReporter;
  /**
   * Optional initial reason reported for the first build iteration.
   */
  readonly initialReason?: string;
  /**
   * Overrides default build options supplied to `executeBuild`.
   */
  readonly buildOptions?: Omit<BuildRunOptions, 'parentSpan'>;
  /**
   * Dependency injection seam for the build executor, primarily used by tests.
   */
  readonly executeBuildImpl?: typeof executeBuild;
}

/**
 * Disposable handle returned by {@link startWatchPipeline} for shutting down the session.
 */
export interface WatchPipelineHandle {
  close(): Promise<void>;
}

/**
 * Creates a long-lived pipeline that watches DTIF sources and rebuilds as changes occur.
 * @param {WatchPipelineOptions} options - Runtime dependencies required for the pipeline session.
 * @returns {Promise<WatchPipelineHandle>} A handle that can be used to dispose of the watch pipeline.
 */
export async function startWatchPipeline(
  options: WatchPipelineOptions,
): Promise<WatchPipelineHandle> {
  const runBuild = options.executeBuildImpl ?? executeBuild;
  const scheduler = options.scheduler;
  const watcher = options.watcher;

  let environment = await options.environmentFactory({ configPath: options.configPath });
  let reporter = options.createReporter(environment);
  let currentSpan: TelemetrySpan | undefined;
  let telemetrySubscription = subscribeTelemetry(environment, () => currentSpan);
  let subscriptions = await createWatchers(
    environment,
    watcher,
    reporter,
    scheduleBuild,
    reloadEnvironment,
  );

  let pendingReason: string | undefined;
  let scheduled = false;

  const buildOptions = options.buildOptions ?? {};

  /**
   * Executes a single build iteration triggered by a watch event.
   * @param {string} reason - Description of the change that triggered the build.
   * @returns {Promise<void>} Resolves when the iteration completes.
   */
  async function runIteration(reason: string): Promise<void> {
    const iterationSpan = environment.telemetry.tracer.startSpan('dtifx.cli.watch.iteration', {
      attributes: { reason },
    });
    currentSpan = iterationSpan;
    try {
      const result = await runBuild(
        environment.services,
        environment.loaded.config,
        environment.telemetry.tracer,
        {
          ...buildOptions,
          parentSpan: iterationSpan,
        },
      );
      const written = result.writtenArtifacts;
      const artifactCount = [...written.values()].reduce(
        (total, entries) => total + entries.length,
        0,
      );
      iterationSpan.addEvent('dtifx.cli.watch.artifacts', {
        formatterCount: written.size,
        artifactCount,
      });
      reporter.buildSuccess({ result, writtenArtifacts: written, reason });
      iterationSpan.end({
        attributes: {
          tokenCount: result.metrics.totalCount,
          typedTokenCount: result.metrics.typedCount,
          unreferencedTokenCount: result.metrics.references.unreferencedCount,
          formatterCount: result.formatters.length,
          artifactCount,
        },
      });
    } catch (error) {
      iterationSpan.end({ status: 'error' });
      reporter.buildFailure(error, { reason });
    } finally {
      currentSpan = undefined;
      await environment.telemetry.exportSpans();
    }
  }

  /**
   * Queues a build execution if one is not already scheduled.
   * @param {string} reason - Change description to associate with the build.
   * @returns {void}
   */
  function scheduleBuild(reason: string): void {
    pendingReason = reason;
    if (scheduled) {
      return;
    }
    scheduled = true;
    void scheduler.schedule({
      id: `watch-build-${Date.now().toString(36)}`,
      run: async () => {
        try {
          while (pendingReason) {
            const nextReason = pendingReason;
            pendingReason = undefined;
            await runIteration(nextReason);
          }
        } finally {
          scheduled = false;
          if (pendingReason) {
            const nextReason = pendingReason;
            pendingReason = undefined;
            scheduleBuild(nextReason);
          }
        }
      },
    });
  }

  /**
   * Reloads the runtime environment when configuration changes are detected.
   * @returns {Promise<void>} Resolves when the environment is reinitialised.
   */
  async function reloadEnvironment(): Promise<void> {
    reporter.watchInfo('Configuration changed. Reloading pipeline.');
    await closeWatchers(subscriptions, reporter);
    await environment.telemetry.exportSpans();
    telemetrySubscription.unsubscribe();
    environment.dispose();
    currentSpan = undefined;

    const request: RuntimeEnvironmentFactoryRequest = {
      configPath: environment.loaded.path,
      documentCache: environment.documentCache,
      tokenCache: environment.tokenCache,
    } satisfies RuntimeEnvironmentFactoryRequest;
    environment = await options.environmentFactory(request);
    reporter = options.createReporter(environment);
    telemetrySubscription = subscribeTelemetry(environment, () => currentSpan);
    subscriptions = await createWatchers(
      environment,
      watcher,
      reporter,
      scheduleBuild,
      reloadEnvironment,
    );
    scheduleBuild('configuration update');
  }

  scheduleBuild(options.initialReason ?? 'initial build');

  return {
    async close() {
      await closeWatchers(subscriptions, reporter);
      telemetrySubscription.unsubscribe();
      await environment.telemetry.exportSpans();
      environment.dispose();
      await scheduler.shutdown();
    },
  } satisfies WatchPipelineHandle;
}

/**
 * Registers file and configuration watchers for the given environment.
 * @param {RuntimeEnvironment} environment - Active runtime environment used to resolve configuration data.
 * @param {WatcherPort} watcher - Port used to register file system watchers.
 * @param {WatchPipelineReporter} reporter - Reporter used for watch lifecycle messages.
 * @param {(reason: string) => void} onChange - Callback invoked when a tracked source file changes.
 * @param {() => Promise<void>} onConfigChange - Callback invoked when the configuration file changes.
 * @returns {Promise<WatchSubscription[]>} Subscriptions that should be disposed when closing the pipeline.
 */
async function createWatchers(
  environment: RuntimeEnvironment,
  watcher: WatcherPort,
  reporter: WatchPipelineReporter,
  onChange: (reason: string) => void,
  onConfigChange: () => Promise<void>,
): Promise<WatchSubscription[]> {
  const subscriptions: WatchSubscription[] = [];
  const config = environment.loaded.config;
  const fileSources = config.sources.filter(
    (source): source is FileGlobSourceConfig => source.kind === 'file',
  );

  for (const source of fileSources) {
    const request = {
      id: `source:${source.id}`,
      paths: [...source.patterns],
      options: {
        cwd: source.rootDir ?? environment.loaded.directory,
        ...(source.ignore ? { ignored: [...source.ignore] } : {}),
      },
    } satisfies Parameters<WatcherPort['watch']>[0];
    const subscription = await Promise.resolve(
      watcher.watch(request, {
        onEvent: (event) => {
          const absolute = path.resolve(source.rootDir ?? environment.loaded.directory, event.path);
          onChange(`${source.id}:${event.type}:${absolute}`);
        },
        onError: (issue) => {
          reporter.watchError(`Watcher error for source ${source.id}`, issue.error);
        },
      }),
    );
    subscriptions.push(subscription);
  }

  const configSubscription = await Promise.resolve(
    watcher.watch(
      { id: 'config', paths: environment.loaded.path },
      {
        onEvent: () => {
          void onConfigChange();
        },
        onError: (issue) => {
          reporter.watchError('Watcher error for configuration file', issue.error);
        },
      },
    ),
  );
  subscriptions.push(configSubscription);

  reporter.watchInfo('Watching DTIF sources for changes.');

  return subscriptions;
}

/**
 * Gracefully shuts down active watcher subscriptions, reporting any cleanup errors.
 * @param {readonly WatchSubscription[]} subscriptions - Collection of active watch subscriptions to close.
 * @param {WatchPipelineReporter} reporter - Reporter used to surface cleanup issues.
 * @returns {Promise<void>} A promise that resolves when all watchers close.
 */
async function closeWatchers(
  subscriptions: readonly WatchSubscription[],
  reporter: WatchPipelineReporter,
): Promise<void> {
  try {
    await Promise.all(
      subscriptions.map(async (subscription) => {
        await subscription.close();
      }),
    );
  } catch (error) {
    reporter.watchError('Error while closing watchers', error);
  }
}

/**
 * Subscribes the runtime telemetry span forwarder to the event bus.
 * @param {RuntimeEnvironment} environment - Runtime environment that exposes the event bus.
 * @param {() => TelemetrySpan | undefined} getSpan - Accessor returning the span that should receive build events.
 * @returns {DomainEventSubscription} A subscription that must be disposed when the session ends.
 */
function subscribeTelemetry(
  environment: RuntimeEnvironment,
  getSpan: () => TelemetrySpan | undefined,
): DomainEventSubscription {
  return environment.services.eventBus.subscribe(
    createBuildStageTelemetryEventSubscriber({ getSpan }),
  );
}

import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  InMemoryDocumentCache,
  InMemoryTokenCache,
  type DocumentCache,
  type TokenCache,
} from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import {
  startWatchPipeline,
  type WatchBuildReportContext,
  type WatchPipelineReporter,
} from '../src/application/pipelines/watch-pipeline.js';
import { createPolicyConfiguration } from '@dtifx/core/policy/configuration';
import type {
  RuntimeEnvironment,
  RuntimeEnvironmentFactory,
  RuntimeEnvironmentFactoryRequest,
} from '../src/application/environments/runtime-environment.js';
import { createBuildRuntime } from '../src/application/build-runtime.js';
import type { BuildConfig } from '../src/config/index.js';
import { pointerTemplate } from '../src/config/index.js';
import type {
  WatchCallbacks,
  WatchEvent,
  WatchSubscription,
  WatcherPort,
} from '../src/domain/ports/watchers.js';
import type { TaskSchedulerPort } from '../src/domain/ports/scheduler.js';
import { noopLogger } from '@dtifx/core/logging';
import { noopTelemetryTracer } from '@dtifx/core/telemetry';

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 10_000,
  intervalMs = 10,
): Promise<void> {
  const timeoutAt = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() >= timeoutAt) {
      throw new Error('Timed out waiting for expected watch pipeline state.');
    }
    await delay(intervalMs);
  }
}

/**
 * Provides a minimal file-based build configuration for watch pipeline tests.
 * @returns {BuildConfig} Synthetic configuration describing a single file source.
 */
function createTestConfig(): BuildConfig {
  return {
    layers: [{ name: 'base' }],
    sources: [
      {
        kind: 'file',
        id: 'design-tokens',
        layer: 'base',
        pointerTemplate: pointerTemplate('tokens'),
        patterns: ['tokens/**/*.json'],
      },
    ],
  } satisfies BuildConfig;
}

/**
 * Creates a watch pipeline result object populated with baseline metrics.
 * @returns {WatchBuildReportContext['result']} Placeholder build result used for reporter tests.
 */
function createBuildResult(): WatchBuildReportContext['result'] {
  const now = new Date();
  return {
    plan: { entries: [], createdAt: now },
    resolved: { entries: [], diagnostics: [], resolvedAt: now },
    tokens: [],
    transforms: [],
    formatters: [],
    timings: {
      planMs: 0,
      parseMs: 0,
      resolveMs: 0,
      transformMs: 0,
      formatMs: 0,
      dependencyMs: 0,
      totalMs: 0,
    },
    metrics: {
      totalCount: 0,
      typedCount: 0,
      untypedCount: 0,
      typeCounts: {},
      aliasDepth: { average: 0, max: 0, histogram: {} },
      references: {
        referencedCount: 0,
        unreferencedCount: 0,
        unreferencedSamples: [],
      },
    },
    transformCache: { hits: 0, misses: 0, skipped: 0 },
    dependencyChanges: undefined,
    writtenArtifacts: new Map(),
  } satisfies WatchBuildReportContext['result'];
}

/**
 * Task scheduler stub that executes tasks immediately for deterministic testing.
 */
class ImmediateScheduler implements TaskSchedulerPort {
  running = false;

  /**
   * Executes the scheduled task synchronously and records the running state.
   * @template T
   * @param {{ id: string; run(): Promise<T> | T }} task - Task request to execute.
   * @param {string} task.id - Identifier for the scheduled task.
   * @param {() => Promise<T> | T} task.run - Handler that produces the task result.
   * @returns {Promise<{ id: string; value: T }>} Result of the executed task.
   */
  async schedule<T>(task: { id: string; run(): Promise<T> | T }): Promise<{
    id: string;
    value: T;
  }> {
    this.running = true;
    try {
      const value = await task.run();
      return { id: task.id, value };
    } finally {
      this.running = false;
    }
  }

  async shutdown(): Promise<void> {
    // nothing pending
  }
}

/**
 * Watcher stub that records registrations and allows manual event emission.
 */
class TestWatcher implements WatcherPort {
  readonly callbacks = new Map<string, WatchCallbacks>();
  readonly requests: string[] = [];
  readonly closed: string[] = [];

  /**
   * Registers a new watch request and stores callbacks for manual triggering.
   * @param {Parameters<WatcherPort['watch']>[0]} request - Watch request from the pipeline.
   * @param {WatchCallbacks} callbacks - Callbacks invoked when watcher events occur.
   * @returns {Promise<WatchSubscription>} Subscription used to cancel the watch request.
   */
  watch(
    request: Parameters<WatcherPort['watch']>[0],
    callbacks: WatchCallbacks,
  ): Promise<WatchSubscription> {
    this.requests.push(request.id);
    this.callbacks.set(request.id, callbacks);
    return Promise.resolve({
      close: () => {
        this.closed.push(request.id);
        this.callbacks.delete(request.id);
      },
    } satisfies WatchSubscription);
  }

  emit(id: string, event: WatchEvent): void {
    this.callbacks.get(id)?.onEvent(event);
  }

  emitError(id: string, error: unknown): void {
    this.callbacks.get(id)?.onError?.({ requestId: id, error });
  }
}

/**
 * Telemetry runtime stub that counts the number of export attempts.
 */
class TestTelemetryRuntime {
  readonly tracer = noopTelemetryTracer;
  exportCount = 0;

  /**
   * Increments the export count to simulate telemetry delivery.
   */
  async exportSpans(): Promise<void> {
    this.exportCount += 1;
  }
}

/**
 * Creates a reporter stub that records pipeline lifecycle events.
 * @param {string[]} events - Collection that captures reporter event messages.
 * @returns {WatchPipelineReporter} Reporter implementation for use in tests.
 */
function createReporter(events: string[]): WatchPipelineReporter {
  return {
    buildSuccess(context) {
      events.push(`success:${context.reason}`);
    },
    buildFailure(_error, context) {
      events.push(`failure:${context.reason}`);
    },
    watchInfo(message) {
      events.push(`info:${message}`);
    },
    watchError(message) {
      events.push(`error:${message}`);
    },
  } satisfies WatchPipelineReporter;
}

interface EnvironmentFactoryOptions {
  readonly config: BuildConfig;
  readonly configPath: string;
  readonly telemetryRuntimes: TestTelemetryRuntime[];
  readonly documentCaches?: DocumentCache[];
  readonly tokenCaches?: TokenCache[];
  readonly factoryRequests?: RuntimeEnvironmentFactoryRequest[];
  readonly reuseCaches?: boolean;
  readonly onDispose?: () => void;
}

function createTestEnvironmentFactory({
  config,
  configPath,
  telemetryRuntimes,
  documentCaches,
  tokenCaches,
  factoryRequests,
  reuseCaches = false,
  onDispose,
}: EnvironmentFactoryOptions): RuntimeEnvironmentFactory {
  let cachedDocumentCache: DocumentCache | undefined;
  let cachedTokenCache: TokenCache | undefined;

  return async (request: RuntimeEnvironmentFactoryRequest) => {
    factoryRequests?.push(request);

    const documentCache =
      request.documentCache ??
      (reuseCaches && cachedDocumentCache ? cachedDocumentCache : new InMemoryDocumentCache());

    const tokenCache =
      request.tokenCache ??
      (reuseCaches && cachedTokenCache ? cachedTokenCache : new InMemoryTokenCache());

    documentCaches?.push(documentCache);
    tokenCaches?.push(tokenCache);

    if (reuseCaches) {
      cachedDocumentCache = documentCache;
      cachedTokenCache = tokenCache;
    }

    const telemetry = new TestTelemetryRuntime();
    telemetryRuntimes.push(telemetry);

    const services = createBuildRuntime(config, {
      documentCache,
      tokenCache,
      logger: noopLogger,
    });

    const policyConfiguration = createPolicyConfiguration(config);

    const activeConfigPath = request.configPath ?? configPath;
    const directory = path.dirname(activeConfigPath);

    const environment: RuntimeEnvironment = {
      loaded: {
        path: activeConfigPath,
        directory,
        config,
      },
      logger: noopLogger,
      telemetry,
      documentCache,
      tokenCache,
      services,
      policyConfiguration,
      dispose() {
        onDispose?.();
      },
    } satisfies RuntimeEnvironment;

    return environment;
  };
}

class ErrorOnCloseWatcher extends TestWatcher {
  async watch(request: Parameters<WatcherPort['watch']>[0], callbacks: WatchCallbacks) {
    const subscription = await super.watch(request, callbacks);
    if (request.id !== 'config') {
      return subscription;
    }
    return {
      close: async () => {
        await Promise.resolve(subscription.close());
        throw new Error('close failure');
      },
    } satisfies WatchSubscription;
  }
}

describe('startWatchPipeline', () => {
  it('schedules builds, reloads configuration, and reuses caches', async () => {
    const config = createTestConfig();
    const watcher = new TestWatcher();
    const scheduler = new ImmediateScheduler();
    const reporterEvents: string[] = [];
    const telemetryRuntimes: TestTelemetryRuntime[] = [];
    const documentCaches: DocumentCache[] = [];
    const tokenCaches: TokenCache[] = [];
    const factoryRequests: RuntimeEnvironmentFactoryRequest[] = [];
    const result = createBuildResult();
    let disposeCount = 0;

    const configPath = path.join(process.cwd(), 'virtual-watch', 'dtifx.config.mjs');
    const environmentFactory = createTestEnvironmentFactory({
      config,
      configPath,
      telemetryRuntimes,
      documentCaches,
      tokenCaches,
      factoryRequests,
      reuseCaches: true,
      onDispose: () => {
        disposeCount += 1;
      },
    });

    const pipeline = await startWatchPipeline({
      configPath,
      watcher,
      scheduler,
      environmentFactory,
      initialReason: 'initial build',
      createReporter: () => createReporter(reporterEvents),
      executeBuildImpl: async () => result,
    });

    expect(reporterEvents).toEqual([
      'info:Watching DTIF sources for changes.',
      'success:initial build',
    ]);
    const initialTelemetry = telemetryRuntimes[0];
    expect(initialTelemetry?.exportCount).toBe(1);
    expect(factoryRequests).toHaveLength(1);

    watcher.emit('source:design-tokens', {
      requestId: 'source:design-tokens',
      type: 'updated',
      path: 'tokens.json',
    });
    await waitForCondition(() => reporterEvents.length >= 3);

    const latestEvent = reporterEvents.at(-1);
    const absoluteTokenPath = path.join(process.cwd(), 'virtual-watch', 'tokens.json');
    expect(latestEvent).toBe(`success:design-tokens:updated:${absoluteTokenPath}`);
    expect(initialTelemetry?.exportCount).toBe(2);

    watcher.emit('config', {
      requestId: 'config',
      type: 'updated',
      path: 'dtifx.config.mjs',
    });
    await waitForCondition(() => factoryRequests.length >= 2);

    expect(factoryRequests).toHaveLength(2);
    expect(documentCaches[0]).toBe(documentCaches[1]);
    expect(tokenCaches[0]).toBe(tokenCaches[1]);
    expect(reporterEvents.slice(-3)).toEqual([
      'info:Configuration changed. Reloading pipeline.',
      'info:Watching DTIF sources for changes.',
      'success:configuration update',
    ]);
    const latestTelemetry = telemetryRuntimes.at(-1);
    expect(latestTelemetry?.exportCount).toBe(1);

    await pipeline.close();
    const finalTelemetry = telemetryRuntimes.at(-1);
    expect(finalTelemetry?.exportCount).toBe(2);
    expect(disposeCount).toBe(2);
    expect(watcher.closed).toContain('config');
    expect(watcher.closed).toContain('source:design-tokens');
  });

  it('reports build failures and recovers on subsequent changes', async () => {
    const config = createTestConfig();
    const watcher = new TestWatcher();
    const scheduler = new ImmediateScheduler();
    const reporterEvents: string[] = [];
    const telemetryRuntimes: TestTelemetryRuntime[] = [];
    const result = createBuildResult();
    let disposeCount = 0;
    let callCount = 0;

    const configPath = path.join(process.cwd(), 'failure-watch', 'dtifx.config.mjs');
    const environmentFactory = createTestEnvironmentFactory({
      config,
      configPath,
      telemetryRuntimes,
      onDispose: () => {
        disposeCount += 1;
      },
    });

    const pipeline = await startWatchPipeline({
      configPath,
      watcher,
      scheduler,
      environmentFactory,
      initialReason: 'initial build',
      createReporter: () => createReporter(reporterEvents),
      executeBuildImpl: async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('boom');
        }
        return result;
      },
    });

    await waitForCondition(() => reporterEvents.length >= 2);

    expect(reporterEvents.slice(0, 2)).toEqual([
      'info:Watching DTIF sources for changes.',
      'failure:initial build',
    ]);

    const telemetry = telemetryRuntimes[0];
    expect(telemetry?.exportCount).toBe(1);

    watcher.emit('source:design-tokens', {
      requestId: 'source:design-tokens',
      type: 'updated',
      path: 'tokens.json',
    });

    await waitForCondition(() => reporterEvents.some((event) => event.startsWith('success:')));

    const directory = path.dirname(configPath);
    expect(reporterEvents.at(-1)).toBe(
      `success:design-tokens:updated:${path.join(directory, 'tokens.json')}`,
    );
    expect(telemetry?.exportCount).toBe(2);

    await pipeline.close();
    expect(telemetry?.exportCount).toBe(3);
    expect(disposeCount).toBe(1);
    expect(watcher.closed).toContain('config');
    expect(watcher.closed).toContain('source:design-tokens');
  });

  it('surfaces watcher errors emitted by the watcher port', async () => {
    const config = createTestConfig();
    const watcher = new TestWatcher();
    const scheduler = new ImmediateScheduler();
    const reporterEvents: string[] = [];
    const telemetryRuntimes: TestTelemetryRuntime[] = [];

    const configPath = path.join(process.cwd(), 'watcher-error', 'dtifx.config.mjs');
    const environmentFactory = createTestEnvironmentFactory({
      config,
      configPath,
      telemetryRuntimes,
    });

    const pipeline = await startWatchPipeline({
      configPath,
      watcher,
      scheduler,
      environmentFactory,
      createReporter: () => createReporter(reporterEvents),
      executeBuildImpl: async () => createBuildResult(),
    });

    await waitForCondition(() => reporterEvents.length >= 2);

    watcher.emitError('source:design-tokens', new Error('source failure'));
    watcher.emitError('config', new Error('config failure'));

    expect(reporterEvents).toContain('error:Watcher error for source design-tokens');
    expect(reporterEvents).toContain('error:Watcher error for configuration file');

    await pipeline.close();
    const telemetry = telemetryRuntimes[0];
    expect(telemetry?.exportCount).toBeGreaterThanOrEqual(2);
  });

  it('reports watcher cleanup errors when closing the pipeline', async () => {
    const config = createTestConfig();
    const watcher = new ErrorOnCloseWatcher();
    const scheduler = new ImmediateScheduler();
    const reporterEvents: string[] = [];
    const telemetryRuntimes: TestTelemetryRuntime[] = [];

    const configPath = path.join(process.cwd(), 'watcher-cleanup', 'dtifx.config.mjs');
    const environmentFactory = createTestEnvironmentFactory({
      config,
      configPath,
      telemetryRuntimes,
    });

    const pipeline = await startWatchPipeline({
      configPath,
      watcher,
      scheduler,
      environmentFactory,
      createReporter: () => createReporter(reporterEvents),
      executeBuildImpl: async () => createBuildResult(),
    });

    await waitForCondition(() => reporterEvents.length >= 2);

    await expect(pipeline.close()).resolves.toBeUndefined();
    expect(reporterEvents).toContain('error:Error while closing watchers');
    expect(watcher.closed).toContain('config');
    expect(watcher.closed).toContain('source:design-tokens');
    const telemetry = telemetryRuntimes[0];
    expect(telemetry?.exportCount).toBeGreaterThanOrEqual(2);
  });
});

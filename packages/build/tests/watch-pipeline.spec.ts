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

    const environmentFactory: RuntimeEnvironmentFactory = async (request) => {
      factoryRequests.push(request);
      const documentCache = request.documentCache ?? new InMemoryDocumentCache();
      const tokenCache = request.tokenCache ?? new InMemoryTokenCache();
      documentCaches.push(documentCache);
      tokenCaches.push(tokenCache);

      const telemetry = new TestTelemetryRuntime();
      telemetryRuntimes.push(telemetry);

      const services = createBuildRuntime(config, {
        documentCache,
        tokenCache,
        logger: noopLogger,
      });

      const policyConfiguration = createPolicyConfiguration(config);

      const directory = path.join(process.cwd(), 'virtual-watch');
      const environment: RuntimeEnvironment = {
        loaded: {
          path: path.join(directory, 'dtifx.config.mjs'),
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
          disposeCount += 1;
        },
      } satisfies RuntimeEnvironment;

      return environment;
    };

    const pipeline = await startWatchPipeline({
      configPath: path.join(process.cwd(), 'virtual-watch', 'dtifx.config.mjs'),
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
    await delay(0);

    const latestEvent = reporterEvents.at(-1);
    const absoluteTokenPath = path.join(process.cwd(), 'virtual-watch', 'tokens.json');
    expect(latestEvent).toBe(`success:design-tokens:updated:${absoluteTokenPath}`);
    expect(initialTelemetry?.exportCount).toBe(2);

    watcher.emit('config', {
      requestId: 'config',
      type: 'updated',
      path: 'dtifx.config.mjs',
    });
    await delay(0);

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
});

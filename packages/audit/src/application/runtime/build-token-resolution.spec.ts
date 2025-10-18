import { describe, expect, it, vi } from 'vitest';

import type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';

import type { AuditTelemetryRuntime, AuditTelemetrySpan } from './audit-runtime.js';
import { createBuildTokenResolutionEnvironment } from './build-token-resolution.js';

const createSpanStub = (name = 'root'): AuditTelemetrySpan & { end: ReturnType<typeof vi.fn> } => {
  const end = vi.fn();
  const span: AuditTelemetrySpan & { end: ReturnType<typeof vi.fn> } = {
    name,
    spanId: `${name}-span`,
    traceId: 'trace-id',
    startChild: vi.fn((childName: string) => createSpanStub(childName)),
    addEvent: vi.fn(),
    setAttribute: vi.fn(),
    end,
  };
  return span;
};

describe('createBuildTokenResolutionEnvironment', () => {
  it('creates a token resolver that executes the build pipeline', async () => {
    const loggingSubscriber = Symbol('logging-subscriber');
    const telemetrySubscriber = Symbol('telemetry-subscriber');
    const unsubscribeLogging = vi.fn();
    const unsubscribeTelemetry = vi.fn();
    const eventBusSubscribe = vi
      .fn()
      .mockReturnValueOnce({ unsubscribe: unsubscribeLogging })
      .mockReturnValueOnce({ unsubscribe: unsubscribeTelemetry });
    const services = { eventBus: { subscribe: eventBusSubscribe } } as const;
    const policyConfiguration = {
      rules: [],
      engine: { run: vi.fn(async () => []) },
    } as const;
    const createDefaultBuildEnvironment = vi.fn(() => ({
      services,
      policyConfiguration,
    }));
    const createBuildStageLoggingSubscriber = vi.fn(() => loggingSubscriber);
    const createBuildStageTelemetryEventSubscriber = vi.fn(() => telemetrySubscriber);
    const executeBuild = vi.fn(async () => ({
      tokens: [{ id: 'token' }] as const,
      metrics: { totalCount: 1, typedCount: 1, references: { unreferencedCount: 0 } },
      timings: {
        planMs: 1,
        parseMs: 2,
        resolveMs: 3,
        transformMs: 4,
        formatMs: 5,
        dependencyMs: 6,
        totalMs: 7,
      },
      runContext: { kind: 'manual' },
    }));

    const build = {
      createDefaultBuildEnvironment,
      createBuildStageLoggingSubscriber,
      createBuildStageTelemetryEventSubscriber,
      executeBuild,
    };

    const tracer = { startSpan: vi.fn(() => createSpanStub()) };
    const telemetry: AuditTelemetryRuntime = {
      tracer,
      exportSpans: vi.fn(async () => {}),
    };

    const logger = { log: vi.fn() };

    const documentCache = { kind: 'document-cache' } as unknown as DocumentCache;
    const tokenCache = { kind: 'token-cache' } as unknown as TokenCache;
    const configuration = {
      path: '/root/dtifx.config.mjs',
      directory: '/root',
      config: { name: 'config' } as const,
    } as const;

    const environment = await createBuildTokenResolutionEnvironment({
      build,
      telemetry,
      logger,
      configuration,
      defaultOutDir: './dist',
      documentCache,
      tokenCache,
    });

    expect(createDefaultBuildEnvironment).toHaveBeenCalledWith(
      {
        config: configuration.config,
        configDirectory: configuration.directory,
        configPath: configuration.path,
      },
      expect.objectContaining({
        logger,
        defaultOutDir: './dist',
        documentCache,
        tokenCache,
        runtime: { flatten: true, includeGraphs: true },
      }),
    );
    expect(createBuildStageLoggingSubscriber).toHaveBeenCalledWith(logger);
    expect(eventBusSubscribe).toHaveBeenCalledWith(loggingSubscriber);

    const span = createSpanStub('parent-span');
    const result = await environment.tokens.resolve({ span });

    expect(createBuildStageTelemetryEventSubscriber).toHaveBeenCalledWith({
      getSpan: expect.any(Function),
    });
    const getSpan = createBuildStageTelemetryEventSubscriber.mock.calls[0][0].getSpan;
    expect(getSpan()).toBe(span);
    expect(eventBusSubscribe).toHaveBeenLastCalledWith(telemetrySubscriber);

    const buildSpan = span.startChild.mock.results[0].value;
    expect(executeBuild).toHaveBeenCalledWith(services, configuration.config, telemetry.tracer, {
      includeFormatters: false,
      parentSpan: buildSpan,
    });
    expect(buildSpan.end).toHaveBeenCalledWith({
      attributes: {
        tokenCount: 1,
        typedTokenCount: 1,
        unreferencedTokenCount: 0,
      },
    });
    expect(result).toEqual({
      snapshots: [{ id: 'token' }],
      metrics: { totalCount: 1, typedCount: 1, unreferencedCount: 0 },
      timings: {
        planMs: 1,
        parseMs: 2,
        resolveMs: 3,
        transformMs: 4,
        formatMs: 5,
        dependencyMs: 6,
        totalMs: 7,
      },
      metadata: { runContext: { kind: 'manual' } },
    });
    expect(environment.policyConfiguration).toBe(policyConfiguration);
    expect(unsubscribeTelemetry).toHaveBeenCalled();

    environment.dispose();
    expect(unsubscribeLogging).toHaveBeenCalled();
  });

  it('propagates build failures and closes spans', async () => {
    const buildSpan = createSpanStub('build');
    const span = createSpanStub('parent');
    span.startChild.mockReturnValue(buildSpan);

    const executeError = new Error('build failed');

    const configuration = {
      path: '/config',
      directory: '/',
      config: {},
    } as const;

    const build = {
      createDefaultBuildEnvironment: vi.fn(() => ({
        services: { eventBus: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) } },
        policyConfiguration: {
          rules: [],
          engine: { run: vi.fn(async () => []) },
        },
      })),
      createBuildStageLoggingSubscriber: vi.fn(() => ({})),
      createBuildStageTelemetryEventSubscriber: vi.fn(() => ({})),
      executeBuild: vi.fn(async () => {
        throw executeError;
      }),
    };

    const telemetry: AuditTelemetryRuntime = {
      tracer: { startSpan: vi.fn(() => createSpanStub('root')) },
      exportSpans: vi.fn(async () => {}),
    };

    const environment = await createBuildTokenResolutionEnvironment({
      build,
      telemetry,
      logger: { log: vi.fn() },
      configuration,
    });

    await expect(environment.tokens.resolve({ span })).rejects.toBe(executeError);
    expect(buildSpan.end).toHaveBeenCalledWith({ status: 'error' });
  });
});

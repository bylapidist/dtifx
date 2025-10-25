import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTelemetryRuntime } from './runtime.js';

const telemetryMocks = vi.hoisted(() => {
  const getTracerMock = vi.fn(() => ({ startSpan: vi.fn() }));
  const setGlobalTracerProviderMock = vi.fn();

  return {
    apiMock: {
      trace: {
        getTracer: getTracerMock,
        setGlobalTracerProvider: setGlobalTracerProviderMock,
      },
      context: {
        active: vi.fn(() => ({ scope: 'active' })),
      },
      SpanStatusCode: { OK: 'ok', ERROR: 'error' },
    },
    getTracerMock,
    setGlobalTracerProviderMock,
    reset() {
      getTracerMock.mockClear();
      setGlobalTracerProviderMock.mockClear();
    },
  };
});

const runtimeMocks = vi.hoisted(() => {
  const providerGetTracerMock = vi.fn(() => ({ startSpan: vi.fn() }));
  const forceFlushMock = vi.fn(async () => {});
  const simpleSpanProcessors: { exporter: any }[] = [];

  return {
    providerGetTracerMock,
    forceFlushMock,
    simpleSpanProcessors,
    reset() {
      providerGetTracerMock.mockClear();
      forceFlushMock.mockClear();
      simpleSpanProcessors.length = 0;
    },
  };
});

vi.mock('@opentelemetry/api', () => telemetryMocks.apiMock);
vi.mock('@opentelemetry/core', () => ({
  ExportResultCode: { SUCCESS: 'success', FAILED: 'failed' },
}));
vi.mock('@opentelemetry/sdk-trace-base', () => ({
  BasicTracerProvider: class {
    constructor(config: { spanProcessors: unknown[] }) {
      for (const processor of config.spanProcessors) {
        runtimeMocks.simpleSpanProcessors.push(processor as { exporter: any });
      }
    }

    getTracer = runtimeMocks.providerGetTracerMock;
    forceFlush = runtimeMocks.forceFlushMock;
  },
  SimpleSpanProcessor: class {
    readonly exporter: any;
    constructor(exporter: any) {
      this.exporter = exporter;
    }
  },
}));

beforeEach(() => {
  telemetryMocks.reset();
  runtimeMocks.reset();
});

describe('createTelemetryRuntime', () => {
  it('returns a noop runtime when telemetry is disabled', async () => {
    const runtime = createTelemetryRuntime('none');

    expect(runtime.tracer.startSpan('noop').traceId).toBe('noop-trace');
    await expect(runtime.exportSpans()).resolves.toBeUndefined();
  });

  it('configures a stdout exporter and forces flushes', async () => {
    const logger = { log: vi.fn() };
    const runtime = createTelemetryRuntime('stdout', { logger });

    expect(telemetryMocks.setGlobalTracerProviderMock).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.providerGetTracerMock).toHaveBeenCalledWith('dtifx.core.runtime');

    await runtime.exportSpans();
    expect(runtimeMocks.forceFlushMock).toHaveBeenCalledTimes(1);

    const exporterInstance = runtimeMocks.simpleSpanProcessors[0]?.exporter;
    expect(exporterInstance).toBeDefined();

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const span = {
      name: 'build',
      kind: 'INTERNAL',
      spanContext: () => ({ traceId: 'trace-id', spanId: 'span-id' }),
      parentSpanContext: { spanId: 'parent-id' },
      startTime: [1, 2],
      endTime: [3, 4],
      attributes: { stage: 'planning' },
      status: { code: 'ok' },
      events: [
        {
          name: 'event',
          attributes: { key: 'value' },
          time: [5, 6],
        },
      ],
      resource: { attributes: { service: 'core' } },
      instrumentationScope: { name: 'scope', version: '1.0.0', schemaUrl: 'schema' },
    };
    const callback = vi.fn();

    exporterInstance.export([span], callback);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeSpy.mock.calls[0][0].trim());
    expect(payload).toMatchObject({
      traceId: 'trace-id',
      spanId: 'span-id',
      parentSpanId: 'parent-id',
      name: 'build',
      kind: 'INTERNAL',
      attributes: { stage: 'planning' },
      instrumentationScope: { name: 'scope', version: '1.0.0', schemaUrl: 'schema' },
    });
    expect(callback).toHaveBeenCalledWith({ code: 'success' });

    writeSpy.mockRestore();
  });

  it('logs and swallows export failures', async () => {
    const logger = { log: vi.fn() };
    const runtime = createTelemetryRuntime('stdout', { logger });

    runtimeMocks.forceFlushMock.mockRejectedValueOnce(new Error('flush failed'));
    await runtime.exportSpans();

    expect(logger.log).toHaveBeenCalledWith({
      level: 'error',
      name: 'telemetry',
      event: 'export_failed',
      data: { message: 'flush failed' },
    });
  });

  it('logs when the tracer provider cannot be registered', () => {
    const logger = { log: vi.fn() };
    telemetryMocks.setGlobalTracerProviderMock.mockImplementationOnce(() => {
      throw new Error('registration failed');
    });

    createTelemetryRuntime('stdout', { logger });

    expect(logger.log).toHaveBeenCalledWith({
      level: 'error',
      name: 'telemetry',
      event: 'runtime_start_failed',
      data: { message: 'registration failed' },
    });
  });

  it('propagates exporter errors through the callback', () => {
    createTelemetryRuntime('stdout');

    const exporterInstance = runtimeMocks.simpleSpanProcessors[0]?.exporter;
    const callback = vi.fn();
    const error = new Error('write failed');

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {
      throw error;
    });

    exporterInstance.export(
      [
        {
          name: 'build',
          kind: 'INTERNAL',
          spanContext: () => ({ traceId: 'trace-id', spanId: 'span-id' }),
          parentSpanContext: undefined,
          startTime: [0, 1],
          endTime: [0, 2],
          attributes: {},
          status: { code: 'ok' },
          events: [],
          resource: { attributes: {} },
          instrumentationScope: { name: 'scope' },
        },
      ],
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ code: 'failed', error });
    writeSpy.mockRestore();
  });
});

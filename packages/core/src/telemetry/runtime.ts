import { trace, type HrTime } from '@opentelemetry/api';
import { noopLogger, type StructuredLogger } from '../logging/structured-logger.js';
import { createTelemetryTracer, noopTelemetryTracer, type TelemetryTracer } from './tracer.js';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';

/**
 * Modes supported by the telemetry runtime, describing how collected spans are exported.
 */
export type TelemetryMode = 'none' | 'stdout';

/**
 * Runtime surface for telemetry operations, exposing a tracer and an export hook.
 */
export interface TelemetryRuntime {
  readonly tracer: TelemetryTracer;
  exportSpans(): Promise<void>;
}

/**
 * Optional configuration for the telemetry runtime factory.
 */
interface RuntimeOptions {
  readonly logger?: StructuredLogger;
  readonly traceExporter?: SpanExporter;
}

const RUNTIME_INSTRUMENTATION = { name: 'dtifx.core.runtime' } as const;

/**
 * Creates a telemetry runtime that captures spans and exports them according to the provided mode.
 * @param {TelemetryMode} mode - Determines the exporter implementation to instantiate.
 * @param {RuntimeOptions} options - Optional hooks for logging and transport metadata.
 * @returns {TelemetryRuntime} A runtime that registers OpenTelemetry exporters and exposes export
 * controls.
 */
export function createTelemetryRuntime(
  mode: TelemetryMode,
  options: RuntimeOptions = {},
): TelemetryRuntime {
  if (mode === 'none') {
    return {
      tracer: noopTelemetryTracer,
      async exportSpans() {
        // noop
      },
    } satisfies TelemetryRuntime;
  }

  if (mode !== 'stdout') {
    throw new Error(`Unsupported telemetry mode "${mode}".`);
  }

  const logger = options.logger ?? noopLogger;
  const traceExporter = options.traceExporter ?? new JsonConsoleSpanExporter();
  const spanProcessor = new SimpleSpanProcessor(traceExporter);
  const provider = new BasicTracerProvider({ spanProcessors: [spanProcessor] });

  try {
    trace.setGlobalTracerProvider(provider);
  } catch (error) {
    logger.log({
      level: 'error',
      name: 'telemetry',
      event: 'runtime_start_failed',
      data: { message: toErrorMessage(error) },
    });
  }

  const tracer = createTelemetryTracer({
    instrumentation: RUNTIME_INSTRUMENTATION,
    tracer: provider.getTracer(RUNTIME_INSTRUMENTATION.name),
  });

  return {
    tracer,
    async exportSpans() {
      try {
        await provider.forceFlush();
      } catch (error) {
        logger.log({
          level: 'error',
          name: 'telemetry',
          event: 'export_failed',
          data: { message: toErrorMessage(error) },
        });
      }
    },
  } satisfies TelemetryRuntime;
}

/**
 * Normalises any thrown telemetry export error into a human-readable message.
 * @param {unknown} error - Error or value thrown during export.
 * @returns {string} A descriptive message that can be logged.
 */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'number' || typeof error === 'bigint') {
    return error.toString(10);
  }
  if (typeof error === 'boolean') {
    return error ? 'true' : 'false';
  }
  if (error === undefined) {
    return 'unknown error';
  }
  if (typeof error === 'symbol') {
    return error.description ?? 'unknown error';
  }
  if (typeof error === 'function') {
    return error.name || 'unknown error';
  }
  if (typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return 'unknown error';
    }
  }
  return 'unknown error';
}

class JsonConsoleSpanExporter implements SpanExporter {
  constructor(private readonly writer: typeof process.stdout = process.stdout) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    try {
      for (const span of spans) {
        const payload = serialiseSpan(span);
        this.writer.write(`${JSON.stringify(payload)}\n`);
      }
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      const exportError = error instanceof Error ? error : new Error(toErrorMessage(error));
      resultCallback({ code: ExportResultCode.FAILED, error: exportError });
    }
  }

  async shutdown(): Promise<void> {
    // noop
  }

  async forceFlush(): Promise<void> {
    // noop
  }
}

function serialiseSpan(span: ReadableSpan): Record<string, unknown> {
  const parentContext = span.parentSpanContext;
  const instrumentationScope: Record<string, unknown> = {
    name: span.instrumentationScope.name,
  };
  if (span.instrumentationScope.version) {
    instrumentationScope['version'] = span.instrumentationScope.version;
  }
  if (span.instrumentationScope.schemaUrl) {
    instrumentationScope['schemaUrl'] = span.instrumentationScope.schemaUrl;
  }

  const payload: Record<string, unknown> = {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    name: span.name,
    kind: span.kind,
    startTimeUnixNano: toUnixNanoString(span.startTime),
    endTimeUnixNano: toUnixNanoString(span.endTime),
    attributes: span.attributes,
    status: span.status,
    events: span.events.map((event) => ({
      name: event.name,
      attributes: event.attributes,
      timeUnixNano: toUnixNanoString(event.time),
    })),
    resource: span.resource.attributes,
    instrumentationScope,
  };

  if (parentContext?.spanId) {
    payload['parentSpanId'] = parentContext.spanId;
  }

  return payload;
}

function toUnixNanoString(time: HrTime): string {
  return (BigInt(time[0]) * 1_000_000_000n + BigInt(time[1])).toString(10);
}

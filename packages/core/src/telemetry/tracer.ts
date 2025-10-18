import {
  context,
  trace,
  SpanStatusCode,
  type Span,
  type SpanAttributeValue,
  type SpanAttributes,
  type SpanOptions,
  type Tracer,
} from '@opentelemetry/api';

type AttributeScalar = string | number | boolean;

/**
 * Telemetry attribute values that span primitive scalars or arrays of scalars.
 */
export type TelemetryAttributeValue = SpanAttributeValue | readonly AttributeScalar[];

/**
 * Record of attributes attached to spans, keyed by attribute name.
 */
export type TelemetryAttributes = Readonly<SpanAttributes>;

/**
 * Options supplied when creating a span.
 */
export interface TelemetrySpanOptions {
  readonly attributes?: TelemetryAttributes;
}

/**
 * Additional metadata passed when finalising a span.
 */
export interface TelemetrySpanEndOptions {
  readonly attributes?: TelemetryAttributes;
  readonly status?: TelemetrySpanStatus;
}

/**
 * Status assigned to completed telemetry spans.
 */
export type TelemetrySpanStatus = 'ok' | 'error';

/**
 * Mutable span reference exposed to instrumentation callers.
 */
export interface TelemetrySpan {
  readonly name: string;
  readonly spanId: string;
  readonly traceId: string;
  startChild(name: string, options?: TelemetrySpanOptions): TelemetrySpan;
  addEvent(name: string, attributes?: TelemetryAttributes): void;
  setAttribute(name: string, value: TelemetryAttributeValue): void;
  end(options?: TelemetrySpanEndOptions): void;
}

/**
 * Factory surface used by callers to start telemetry spans.
 */
export interface TelemetryTracer {
  startSpan(name: string, options?: TelemetrySpanOptions): TelemetrySpan;
}

/**
 * Optional configuration accepted when constructing a telemetry tracer wrapper.
 */
export interface TelemetryTracerOptions {
  readonly instrumentation?: {
    readonly name: string;
    readonly version?: string;
  };
  readonly tracer?: Tracer;
}

const DEFAULT_INSTRUMENTATION = 'dtifx.core.telemetry';

/**
 * Creates a tracer that delegates to the global OpenTelemetry tracer provider.
 * @param {TelemetryTracerOptions} [options] - Optional instrumentation metadata or tracer override.
 * @returns {TelemetryTracer} Tracer implementation backed by OpenTelemetry.
 */
export function createTelemetryTracer(options: TelemetryTracerOptions = {}): TelemetryTracer {
  const tracer =
    options.tracer ??
    trace.getTracer(
      options.instrumentation?.name ?? DEFAULT_INSTRUMENTATION,
      options.instrumentation?.version,
    );
  return new OpenTelemetryTracer(tracer);
}

/**
 * Tracer implementation that silently drops all span operations.
 */
export const noopTelemetryTracer: TelemetryTracer = {
  startSpan(name: string): TelemetrySpan {
    return new NoopTelemetrySpan(name);
  },
};

class OpenTelemetryTracer implements TelemetryTracer {
  constructor(private readonly tracer: Tracer) {}

  startSpan(name: string, options?: TelemetrySpanOptions): TelemetrySpan {
    const spanOptions: SpanOptions = {};
    if (options?.attributes) {
      spanOptions.attributes = normaliseAttributes(options.attributes);
    }
    const span = this.tracer.startSpan(name, spanOptions);
    return new OpenTelemetrySpan(this.tracer, span, name);
  }
}

class OpenTelemetrySpan implements TelemetrySpan {
  constructor(
    private readonly tracer: Tracer,
    private readonly span: Span,
    private readonly spanName: string,
  ) {}

  get name(): string {
    return this.spanName;
  }

  get spanId(): string {
    return this.span.spanContext().spanId;
  }

  get traceId(): string {
    return this.span.spanContext().traceId;
  }

  startChild(name: string, options?: TelemetrySpanOptions): TelemetrySpan {
    const spanOptions: SpanOptions = {};
    if (options?.attributes) {
      spanOptions.attributes = normaliseAttributes(options.attributes);
    }
    const ctx = trace.setSpan(context.active(), this.span);
    const child = this.tracer.startSpan(name, spanOptions, ctx);
    return new OpenTelemetrySpan(this.tracer, child, name);
  }

  addEvent(name: string, attributes?: TelemetryAttributes): void {
    this.span.addEvent(name, attributes ? normaliseAttributes(attributes) : undefined);
  }

  setAttribute(name: string, value: TelemetryAttributeValue): void {
    this.span.setAttribute(name, normaliseAttributeValue(value));
  }

  end(options?: TelemetrySpanEndOptions): void {
    if (options?.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        if (value === undefined) {
          continue;
        }
        this.span.setAttribute(key, normaliseAttributeValue(value));
      }
    }
    if (options?.status) {
      this.span.setStatus({
        code: options.status === 'error' ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      });
    }
    this.span.end();
  }
}

function normaliseAttributes(attributes: TelemetryAttributes): SpanAttributes {
  const record: Record<string, SpanAttributeValue> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) {
      continue;
    }
    record[key] = normaliseAttributeValue(value);
  }
  return record;
}

function normaliseAttributeValue(
  value: TelemetryAttributeValue | SpanAttributeValue,
): SpanAttributeValue {
  if (Array.isArray(value)) {
    return [...value] as unknown as SpanAttributeValue;
  }
  return value as SpanAttributeValue;
}

class NoopTelemetrySpan implements TelemetrySpan {
  readonly spanId = 'noop-span';
  readonly traceId = 'noop-trace';

  constructor(readonly name: string) {}

  startChild(): TelemetrySpan {
    return new NoopTelemetrySpan(this.name);
  }

  addEvent(): void {
    // noop
  }

  setAttribute(): void {
    // noop
  }

  end(): void {
    // noop
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTelemetryTracer, noopTelemetryTracer } from './tracer.js';

interface SpanStub {
  readonly id: number;
  readonly spanContext: ReturnType<typeof vi.fn>;
  readonly addEvent: ReturnType<typeof vi.fn>;
  readonly setAttribute: ReturnType<typeof vi.fn>;
  readonly setStatus: ReturnType<typeof vi.fn>;
  readonly end: ReturnType<typeof vi.fn>;
}

const telemetryMocks = vi.hoisted(() => {
  const spanInstances: SpanStub[] = [];
  let spanCounter = 0;

  const startSpanMock = vi.fn((_name: string, _options?: unknown, _context?: unknown): SpanStub => {
    const id = ++spanCounter;
    const span: SpanStub = {
      id,
      spanContext: vi.fn(() => ({ traceId: `trace-${id}`, spanId: `span-${id}` })),
      addEvent: vi.fn(),
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
    };
    spanInstances.push(span);
    return span;
  });

  const getTracerMock = vi.fn(() => ({ startSpan: startSpanMock }));
  const setSpanMock = vi.fn((_ctx: unknown, span: SpanStub) => ({ scope: span.id }));
  const activeContextMock = vi.fn(() => ({ scope: 'active' }));
  const setGlobalTracerProviderMock = vi.fn();

  return {
    spanInstances,
    startSpanMock,
    getTracerMock,
    setSpanMock,
    activeContextMock,
    setGlobalTracerProviderMock,
    apiMock: {
      trace: {
        getTracer: getTracerMock,
        setSpan: setSpanMock,
        setGlobalTracerProvider: setGlobalTracerProviderMock,
      },
      context: {
        active: activeContextMock,
      },
      SpanStatusCode: { OK: 'ok', ERROR: 'error' },
    },
    reset() {
      spanInstances.length = 0;
      spanCounter = 0;
      startSpanMock.mockClear();
      getTracerMock.mockClear();
      setSpanMock.mockClear();
      activeContextMock.mockClear();
      setGlobalTracerProviderMock.mockClear();
    },
  };
});

vi.mock('@opentelemetry/api', () => telemetryMocks.apiMock);

beforeEach(() => {
  telemetryMocks.reset();
});

describe('createTelemetryTracer', () => {
  it('delegates to the OpenTelemetry tracer provider with defaults', () => {
    const tracer = createTelemetryTracer();

    expect(telemetryMocks.getTracerMock).toHaveBeenCalledWith('dtifx.core.telemetry', undefined);

    tracer.startSpan('example');

    expect(telemetryMocks.startSpanMock).toHaveBeenCalledWith('example', {});
  });

  it('normalises attribute payloads and preserves trace identifiers', () => {
    const tracer = createTelemetryTracer({
      instrumentation: { name: 'custom', version: '1.0.0' },
      tracer: { startSpan: telemetryMocks.startSpanMock } as never,
    });

    const numbers = [1, 2, 3];
    const span = tracer.startSpan('parent', {
      attributes: {
        scalar: 'value',
        numbers,
        ignored: undefined,
      },
    });

    const [, options] = telemetryMocks.startSpanMock.mock.calls.at(-1)!;
    expect(options).toEqual({
      attributes: {
        scalar: 'value',
        numbers: [1, 2, 3],
      },
    });
    expect(options.attributes.numbers).not.toBe(numbers);

    expect(span.name).toBe('parent');
    expect(span.traceId).toBe('trace-1');
    expect(span.spanId).toBe('span-1');

    const eventAttributes = ['a', 'b'];
    span.addEvent('event', { list: eventAttributes });
    expect(telemetryMocks.spanInstances[0]?.addEvent).toHaveBeenCalledWith('event', {
      list: ['a', 'b'],
    });
    expect(telemetryMocks.spanInstances[0]?.addEvent.mock.calls[0][1].list).not.toBe(
      eventAttributes,
    );

    const attributeValues = ['x', 'y'];
    span.setAttribute('key', attributeValues);
    expect(telemetryMocks.spanInstances[0]?.setAttribute).toHaveBeenCalledWith('key', ['x', 'y']);
    expect(telemetryMocks.spanInstances[0]?.setAttribute.mock.calls[0][1]).not.toBe(
      attributeValues,
    );

    span.end({
      attributes: { status: 'complete', optional: undefined },
      status: 'error',
    });

    expect(telemetryMocks.spanInstances[0]?.setAttribute).toHaveBeenLastCalledWith(
      'status',
      'complete',
    );
    expect(telemetryMocks.spanInstances[0]?.setStatus).toHaveBeenCalledWith({ code: 'error' });
    expect(telemetryMocks.spanInstances[0]?.end).toHaveBeenCalled();
  });

  it('propagates context when starting child spans', () => {
    const tracer = createTelemetryTracer();
    const parent = tracer.startSpan('parent');

    const child = parent.startChild('child', { attributes: { numbers: [4, 5] } });

    expect(telemetryMocks.activeContextMock).toHaveBeenCalled();
    expect(telemetryMocks.setSpanMock).toHaveBeenCalledWith(
      { scope: 'active' },
      telemetryMocks.spanInstances[0],
    );

    const latestCall = telemetryMocks.startSpanMock.mock.calls.at(-1)!;
    expect(latestCall[2]).toEqual({ scope: 1 });

    child.addEvent('child.event');
    expect(telemetryMocks.spanInstances[1]?.addEvent).toHaveBeenCalledWith(
      'child.event',
      undefined,
    );
  });
});

describe('noopTelemetryTracer', () => {
  it('returns noop spans with stable identifiers', () => {
    const span = noopTelemetryTracer.startSpan('noop');
    expect(span.name).toBe('noop');
    expect(span.traceId).toBe('noop-trace');
    expect(span.spanId).toBe('noop-span');

    const child = span.startChild('child');
    expect(child.name).toBe('noop');
    expect(child.traceId).toBe('noop-trace');
  });
});

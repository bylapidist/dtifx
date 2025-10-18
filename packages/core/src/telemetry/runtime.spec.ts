import { afterEach, describe, expect, it } from 'vitest';
import { trace } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { createTelemetryRuntime } from './runtime.js';

describe('createTelemetryRuntime', () => {
  afterEach(() => {
    trace.disable();
  });

  it('returns a noop runtime when telemetry is disabled', async () => {
    const runtime = createTelemetryRuntime('none');
    const span = runtime.tracer.startSpan('noop-span');
    span.addEvent('ignored');
    span.end();

    await expect(runtime.exportSpans()).resolves.toBeUndefined();
  });

  it('exports completed spans via the configured exporter', async () => {
    const exporter = new CapturingExporter();
    const runtime = createTelemetryRuntime('stdout', { traceExporter: exporter });

    const span = runtime.tracer.startSpan('runtime-spec');
    span.setAttribute('test.attribute', 'value');
    span.end();

    await runtime.exportSpans();

    expect(exporter.exports).toHaveLength(1);
    expect(exporter.exports[0]).toHaveLength(1);
    expect(exporter.exports[0][0].name).toBe('runtime-spec');
  });
});

class CapturingExporter implements SpanExporter {
  private readonly recorded: ReadableSpan[][] = [];

  get exports(): ReadonlyArray<readonly ReadableSpan[]> {
    return this.recorded;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.recorded.push([...spans]);
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  async shutdown(): Promise<void> {
    this.recorded.length = 0;
  }

  async forceFlush(): Promise<void> {
    // noop
  }
}

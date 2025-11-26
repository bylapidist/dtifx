---
title: Telemetry
description: Configure DTIFx telemetry runtimes, exporters, and subscribers.
outline: deep
---

# Telemetry

Telemetry spans give observability into DTIFx pipelines. The runtime factory in `@dtifx/core`
provides consistent exporters that all hosts can share.

## Runtime factory

Use `createTelemetryRuntime(mode, options?)` to obtain a tracer and an `exportSpans()` hook.

```ts
import { createTelemetryRuntime } from '@dtifx/core/telemetry';

const telemetry = createTelemetryRuntime('stdout');

const span = telemetry.tracer.startSpan('example');
// …do work…
span.end();
await telemetry.exportSpans();
```

Modes:

- `none` – returns a no-op tracer; `exportSpans()` resolves immediately.
- `stdout` – streams spans using OpenTelemetry's `ConsoleSpanExporter`. Override the exporter with
  `options.traceExporter` when integrating with alternate transports.

If an exporter throws, the runtime logs a structured error through the supplied `options.logger`
(`JsonLineLogger`, `noopLogger`, or a custom implementation) and suppresses the exception to keep
the host process stable.

## Wiring spans to commands

CLI commands instantiate a telemetry runtime per invocation. Spans are named consistently so traces
remain searchable:

- `dtifx.cli.validate`, `dtifx.cli.generate`, `dtifx.cli.inspect`, and `dtifx.cli.watch.iteration`
  (with `dtifx.cli.watch.artifacts` events) for build workflows.
- `dtifx.cli.audit` for audit runs (with child spans such as `dtifx.cli.audit.build` when audits
  reuse the build runtime).
- Diff commands rely on diagnostics rather than spans. Wrap `runDiffSession` calls in custom spans
  when you need telemetry around comparisons.

Each pipeline stage creates a child span (for example `dtifx.pipeline.plan`,
`dtifx.pipeline.resolve`, `dtifx.pipeline.transform`). Event bus subscribers bridge domain events
into span attributes so the telemetry payload records token counts, formatter counts, duration
metrics, and failure conditions.

Commands call `exportSpans()` before exiting to ensure spans reach the configured sink even when the
process encounters an error. Audit commands also dispose their environments and flush telemetry when
module resolution or environment preparation fails, so spans still export on early exits. When using
`watch`, spans are exported after each cycle so long-running sessions still flush regularly.

## Diagnostics correlation

Telemetry metadata complements structured logging:

- Build and audit commands attach `createBuildStageLoggingSubscriber` or equivalent logging adapters
  so NDJSON entries include elapsed timings and event names.
- Diff commands emit diagnostics through ports exposed by `@dtifx/diff`. When `--json-logs` is set,
  the CLI switches to `JsonLineLogger`, which uses the same structured shape as telemetry exporters
  so traces and logs share identifiers.

## Custom instrumentation

When embedding DTIFx runtimes you can subscribe to the event bus directly or author bespoke
subscribers:

```ts
import * as build from '@dtifx/build';
import { InMemoryDomainEventBus } from '@dtifx/build';

const telemetry = createTelemetryRuntime('stdout');
const bus = new InMemoryDomainEventBus();
bus.subscribe(
  build.createBuildStageTelemetryEventSubscriber({
    getSpan: () => telemetry.tracer.startSpan('run'),
  }),
);
```

For diff sessions, pass a diagnostics port to `runDiffSession` and wrap it with telemetry spans if
you need per-event tracking. All ports accept optional hooks, so custom hosts can instrument without
patching core packages.

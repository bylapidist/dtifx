---
title: Core runtime reference
description: Logging, telemetry, configuration, and token utilities exported by `@dtifx/core`.
outline: deep
---

# Core runtime reference

`@dtifx/core` underpins every DTIFx package. It provides telemetry runtimes, structured logging,
configuration helpers, token source abstractions, and policy orchestration.

## Logging

```ts
import { JsonLineLogger, noopLogger, type StructuredLogger } from '@dtifx/core';
```

- `JsonLineLogger` writes NDJSON events to a writable stream. Use it to align CLI logs with
  automated log shipping systems.
- `noopLogger` satisfies the logger interface without emitting output.
- `StructuredLogger` expects events with `level`, `name`, `event`, `elapsedMs?`, and optional
  `data`.

## Telemetry

```ts
import {
  createTelemetryRuntime,
  createTelemetryTracer,
  noopTelemetryTracer,
  type TelemetryRuntime,
  type TelemetryMode,
  type TelemetryTracerOptions,
} from '@dtifx/core/telemetry';
```

- `createTelemetryRuntime(mode, options?)` returns `{ tracer, exportSpans }`. Modes: `none`,
  `stdout` (console exporter).
- Options include `logger` and `traceExporter` attributes.
- `createTelemetryTracer(options?)` wraps the global OpenTelemetry tracer and accepts
  instrumentation metadata via {@link TelemetryTracerOptions}.
- `noopTelemetryTracer` returns a tracer that drops spans.

## Configuration loading

```ts
import {
  resolveConfigPath,
  loadConfigModule,
  DEFAULT_DTIFX_CONFIG_FILES,
  type ResolveConfigPathOptions,
  type LoadConfigModuleOptions,
} from '@dtifx/core/config';
```

- `resolveConfigPath({ cwd?, configPath? })` searches for `dtifx.config.mjs`, `.js`, `.cjs`, or
  `dtifx.config.json` by default unless you provide custom candidates.
- `loadConfigModule({ path })` imports the module, awaiting promises if necessary, and returns
  `{ config, path, directory }`.
- Both utilities throw descriptive errors when the file is missing or exports unexpected shapes.

## Concurrency helpers

```ts
import {
  detectParallelism,
  normaliseConcurrency,
  runTaskQueue,
  type TaskDefinition,
  type TaskQueueOptions,
  type TaskQueueMetrics,
  type TaskQueueOutcome,
  type TaskResult,
} from '@dtifx/core';
```

- `detectParallelism()` uses `availableParallelism()` when available, falling back to
  `os.cpus().length` and finally `1`.
- `normaliseConcurrency(requested, taskCount)` clamps invalid or over-provisioned values before you
  schedule a queue. Pass the requested concurrency from user configuration; the helper throws if the
  number is non-positive or not finite and returns a value capped by the task count.
- `runTaskQueue(tasks, options)` executes asynchronous tasks with configurable concurrency and
  returns metrics (completed count, failures, elapsed time).
- `TaskDefinition` describes each unit of work with an `id` and a `run()` function.
- `TaskQueueOptions` accepts an optional `concurrency` value that is validated by
  `normaliseConcurrency()`.
- `TaskQueueMetrics` reports the effective concurrency and total tasks processed.
- `TaskQueueOutcome` contains the ordered `results` array alongside queue metrics.
- `TaskResult` preserves the `id`, `index`, and resolved value for every task.

```ts
const tasks: TaskDefinition<number>[] = Array.from({ length: 10 }, (_, index) => ({
  id: `task-${index}`,
  async run() {
    return index * 2;
  },
}));

const requestedWorkers = process.env.TASK_WORKERS;
const concurrency = normaliseConcurrency(
  requestedWorkers ? Number(requestedWorkers) : undefined,
  tasks.length,
);
const outcome = await runTaskQueue(tasks, { concurrency } satisfies TaskQueueOptions);

console.log(outcome.metrics.concurrency); // effective worker count
console.log(outcome.results.map((result) => result.value)); // [0, 2, 4, ...]
```

## Token sources and planning

```ts
import {
  pointerTemplate,
  placeholder,
  planTokenSources,
  type TokenSourcePlanningConfig,
  type TokenSourcePlanningOptions,
  type TokenSourcePlanningResult,
  TokenResolutionService,
  createTokenPointer,
  createTokenSetFromParseResult,
  createTokenPointerFromTarget,
  createDefaultSourceLocation,
  INLINE_SOURCE_URI,
  createInlineResolver,
  createSourceLocation,
  resolveDocumentUri,
  resolveSourceUri,
  type TokenSnapshotContext,
  type TokenSnapshotDraft,
} from '@dtifx/core/sources';
```

- Pointer helpers (`pointerTemplate`, `placeholder`) construct canonical pointer prefixes.
- `TokenSourcePlanningConfig` accepts the configured layers and source entries, enabling
  deterministic planning across repositories.
- `TokenSourcePlanningOptions` requires a repository port and optional validator or timing hooks.
- `TokenSourcePlanningResult` returns a `plan` sorted by layer/pointer, aggregated `issues`, and the
  elapsed `durationMs`.
- `planTokenSources(config, options)` expands layer-aware source plans with deterministic ordering.
- `TokenResolutionService` resolves planned sources into token snapshots, caching documents as
  needed.
- `createTokenPointer` and `createTokenSetFromParseResult` assist with custom parsing scenarios.
- `createTokenPointerFromTarget()` and `createDefaultSourceLocation()` ensure file-system paths and
  inline payloads map to stable DTIF pointers when building custom loaders.
- URI helpers streamline snapshot attribution. Use `INLINE_SOURCE_URI` when the raw payload lives in
  memory rather than on disk, and `createInlineResolver()` to resolve inline URIs into consistent
  source locations while inspecting returned diagnostics for missing pointers or cycles.
- `createSourceLocation({ documentUri, sourceUri, range? })` describes where tokens originated while
  accommodating editors that supply selection ranges.
- `resolveDocumentUri(base, candidate)` and `resolveSourceUri(base, candidate)` normalise relative
  paths against repository roots so downstream tooling receives canonical URIs.
- `TokenSnapshotContext` and `TokenSnapshotDraft` surface the metadata `TokenResolutionService`
  passes into custom resolvers when constructing snapshots.

`planTokenSources` throws `UnknownLayerError` when a source references a layer that has not been
configured. Validate configuration defaults or guard user-supplied overrides to prevent this
exception in production workflows.

```ts
import { DefaultSourceRepository } from '@dtifx/core/sources';

const config: TokenSourcePlanningConfig = {
  layers: [{ name: 'base', context: { theme: 'light' } }],
  sources: [{ id: 'filesystem', layer: 'base', context: { brand: 'acme' } }],
};

const options: TokenSourcePlanningOptions = {
  repository: new DefaultSourceRepository({ cwd: () => process.cwd() }),
  validator: {
    async validate(document, context) {
      // Perform schema checks or pointer validation and return issues when detected.
      return [];
    },
  },
};

const { plan, issues, durationMs }: TokenSourcePlanningResult = await planTokenSources(
  config,
  options,
);
console.log(plan.entries.length, issues.length, durationMs);
```

```ts
const tokens = new Map([
  [
    '#/color/base',
    {
      id: '#/color/base',
      path: ['color', 'base'],
      value: { hex: '#ffffff' },
      extensions: {},
      source: createDefaultSourceLocation(INLINE_SOURCE_URI),
      references: [],
      resolutionPath: [],
      appliedAliases: [],
    },
  ],
]);

const resolver = createInlineResolver(tokens, INLINE_SOURCE_URI);
const resolution = resolver.resolve('#/color/base');

if (resolution.diagnostics.length > 0) {
  throw new Error(resolution.diagnostics[0]?.message ?? 'Failed to resolve token.');
}

console.log(resolution.token?.value);
```

## Diagnostics

```ts
import {
  DiagnosticCategories,
  DiagnosticScopes,
  createNullDiagnosticsPort,
  emitTokenParserDiagnostic,
  formatReportingScope,
  type DiagnosticsPort,
} from '@dtifx/core';
```

- Diagnostics ports capture structured events with levels (`info`, `warn`, `error`), codes, scopes,
  and messages.
- `createNullDiagnosticsPort()` returns a sink that discards events when telemetry is disabled.
- `emitTokenParserDiagnostic()` converts parser warnings into diagnostic events with consistent
  scopes.
- `formatReportingScope(scope)` normalises arbitrary scope strings (`tokens/Button.json`) into the
  canonical form expected by renderers and logging sinks.

```ts
const diagnostics = createNullDiagnosticsPort();
const scope = formatReportingScope(['tokens', 'button.json']);

diagnostics.emit({
  scope,
  level: 'warn',
  code: 'TOKEN_MISMATCH',
  message: 'Button background is not accessible.',
});
```

### Parser diagnostic conversion

```ts
import {
  convertParserDiagnostic,
  convertParserDiagnosticRelatedInformation,
  convertParserDiagnosticSpan,
  mapParserDiagnosticSeverity,
} from '@dtifx/core';
```

- Use `convertParserDiagnostic()` to translate parser-specific errors into a normalised
  `DiagnosticEvent`.
- `convertParserDiagnosticSpan()` and `convertParserDiagnosticRelatedInformation()` carry precise
  positional metadata into downstream renderers.
- `mapParserDiagnosticSeverity()` guarantees severities align with DTIFx diagnostic levels before
  dispatching events to collectors.

### Parser hooks and sanitizers

```ts
import {
  createDiagnosticsAwareParserHooks,
  createTokenParserDiagnosticEvent,
  emitTokenSourceDiagnostic,
  formatParserDiagnosticMessage,
  sanitizeDiagnosticMessage,
  type ParserHooks,
} from '@dtifx/core';
```

- `createDiagnosticsAwareParserHooks(options)` wires parser lifecycle callbacks into an existing
  `DiagnosticsPort`, automatically forwarding success and failure notifications.
- `createTokenParserDiagnosticEvent()` builds rich diagnostic payloads for reusable parser
  pipelines.
- `emitTokenSourceDiagnostic()` emits diagnostics derived from token-source issues (for example a
  failed file read).
- `formatParserDiagnosticMessage()` and `sanitizeDiagnosticMessage()` protect user-facing output
  from control characters or redundant whitespace before logging or rendering.

### Token-source issue helpers

```ts
import {
  convertTokenSourceIssues,
  convertTokenSourceIssueToDiagnostic,
  formatTokenSourceScope,
} from '@dtifx/core';
```

- `convertTokenSourceIssues()` maps a batch of resolver errors into structured diagnostics,
  preserving repository metadata and severity for display in audit reports.
- `convertTokenSourceIssueToDiagnostic()` handles one-off failures when composing bespoke pipelines.
- `formatTokenSourceScope()` ensures the resulting diagnostic scope matches DTIF URI conventions.

## Policy engine

```ts
import {
  createPolicyConfiguration,
  createDefaultPolicyRuleRegistry,
  createPolicyRules,
  loadPolicyRuleRegistry,
  PolicyRuleFactoryRegistry,
  createPolicyViolationSummary,
  POLICY_SEVERITIES,
  summarisePolicyViolations,
} from '@dtifx/core/policy/configuration';
```

- `createPolicyConfiguration(config, overrides?)` resolves policy entries, plugins, and rule
  factories into `{ rules, engine }`.
- `createPolicyRules(entries, registry?, context?)` normalises configuration entries into rule
  installers using the provided registry and context.
- `loadPolicyRuleRegistry({ config, configDirectory, configPath, plugins? })` loads plugin modules
  and returns a populated rule factory registry.
- Built-in policies cover owner metadata, deprecation replacements, required tags, override
  approvals, and WCAG contrast evaluation.

### Policy violation summaries

- `summarisePolicyViolations(results)` groups raw evaluation results by policy identifier and counts
  severities, returning a `PolicyViolationSummary`.
- `POLICY_SEVERITIES` enumerates supported severities (`info`, `warn`, `error`) so custom renderers
  can iterate deterministically.
- `createPolicyViolationSummary({ id, title, results })` shapes individual policy output for reuse
  when constructing structured reports.

```ts
const evaluation = await engine.evaluateTokens(tokens);
const summary = summarisePolicyViolations(evaluation.results);

for (const severity of POLICY_SEVERITIES) {
  console.log(`${severity}:`, summary.counts[severity] ?? 0);
}

const ownerPolicy = createPolicyViolationSummary({
  id: 'ownership',
  title: 'Tokens must declare owners',
  results: evaluation.results,
});
```

## Run context utilities

```ts
import {
  createRunContext,
  describeRunComparison,
  formatRunDuration,
  formatRunTimestamp,
} from '@dtifx/core';
```

- `createRunContext({ previous, next, startedAt, durationMs })` produces metadata shared by diff and
  audit reports (timestamps, comparison labels, durations).
- `describeRunComparison(context)` returns a human-readable summary (for example `main → feature`).
- `formatRunDuration(context)` inspects the run context and returns either `123ms` or `3.4s`
  depending on the duration magnitude, avoiding noise when runs take longer than a second.
- `formatRunTimestamp(context)` converts the stored ISO timestamp into a compact UTC string (for
  example `2024-04-21 16:02 UTC`), returning `undefined` when the run lacks a valid start time.

```ts
const context = createRunContext({
  previous: 'main',
  next: 'feature/ui-refresh',
  startedAt: new Date('2024-04-21T16:00:00Z'),
  durationMs: 9842,
});

const payload = {
  run: describeRunComparison(context),
  duration: formatRunDuration(context),
  startedAt: formatRunTimestamp(context),
};
```

## Reporting helpers

```ts
import {
  escapeHtml,
  escapeMarkdown,
  formatDurationMs,
  formatUnknownError,
  serialiseError,
  writeJson,
  writeLine,
  type WritableTarget,
} from '@dtifx/core/reporting';
```

- Escapers ensure custom renderers avoid unsafe output.
- `formatDurationMs(ms)` produces millisecond durations suitable for machine-readable logs while
  preserving precision.
- `formatUnknownError(value)` normalises thrown values into readable `ErrorName: message` strings so
  report writers can safely display unexpected failures.
- `serialiseError(error)` converts `Error` instances (including aggregates and causes) into a
  JSON-friendly payload with nested causes flattened for transport or storage.
- `WritableTarget` is the minimal contract (`write(text: string): void`) that report writers accept,
  enabling integration with files, buffers, or HTTP streams.
- `writeJson(target, value)` and `writeLine(target, text)` standardise I/O operations.

```ts
const chunks: string[] = [];
const bufferTarget: WritableTarget = {
  write(text) {
    chunks.push(text);
  },
};

const elapsed = formatDurationMs(1284);
const failure = new Error('Policy evaluation failed');

writeLine(bufferTarget, `Elapsed: ${elapsed}`);
writeLine(bufferTarget, formatUnknownError(failure));
writeJson(bufferTarget, serialiseError(failure));
```

## Design tokens

```ts
import {
  createTokenId,
  cloneTokenExtensions,
  cloneTokenValue,
  type TokenSet,
  type TokenSnapshot,
} from '@dtifx/core/tokens';
```

- Utilities clone token values and metadata safely for downstream processing.
- Types (`TokenSet`, `TokenSnapshot`, `TokenPointer`) provide strong typing when extending runtimes.

## Runtime event bus

```ts
import {
  InMemoryDomainEventBus,
  attachLifecycleObservers,
  createLifecycleObserverEventBus,
  resolveLifecycleEventBus,
  createLifecycleLoggingSubscriber,
  createLifecycleTelemetrySubscriber,
  type DomainEvent,
  type DomainEventSubscriber,
  type BuildStage,
} from '@dtifx/core/runtime';
```

- `InMemoryDomainEventBus` publishes build-domain events to registered subscribers with simple
  in-process delivery semantics.
- `attachLifecycleObservers()` connects build lifecycle observers to any `DomainEventBusPort`,
  making it easy to reuse logging or telemetry observers in other hosts.
- `createLifecycleObserverEventBus()` and `resolveLifecycleEventBus()` bridge between build-specific
  observers and general-purpose domain subscribers.
- `createLifecycleLoggingSubscriber()` produces a structured-logging subscriber, while
  `createLifecycleTelemetrySubscriber()` publishes lifecycle spans to a provided telemetry tracer.
  Combine both to align console output and tracing for long-running build pipelines. Refer to the
  [build runtime reference](./build-runtime.md) for consumer-facing build services that emit these
  events.

## Manifest and collection helpers

```ts
import { append, createPlaceholderManifest, describe, manifest } from '@dtifx/core';
```

- `createPlaceholderManifest(manifest)` freezes metadata (name, summary) for easy reuse across
  packages.
- `manifest` exposes the frozen manifest for this package, and `describe()` returns a mutable copy
  when embedding metadata into external systems.
- `append(collection, ...items)` produces a new array with the provided items appended, keeping the
  original array immutable—a useful helper when composing plugin registries.

These building blocks keep runtime behaviour consistent across DTIFx packages and simplify the
creation of bespoke tooling.

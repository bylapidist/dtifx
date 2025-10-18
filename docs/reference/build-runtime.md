---
title: Build runtime reference
description: API surface for orchestrating builds and watch pipelines.
outline: deep
---

# Build runtime reference

`@dtifx/build` exposes orchestration primitives for running the pipeline outside the CLI. Use these
functions to compose custom hosts, watch services, or integration tests.

## `createDefaultBuildEnvironment`

```ts
import { createDefaultBuildEnvironment } from '@dtifx/build';
```

Creates caches, registries, and infrastructure shared by build commands. The helper resolves cache
paths relative to the configuration directory:

- Document cache and token cache default to in-memory and file system implementations under
  `.dtifx-cache/parser` unless overrides are supplied via
  `documentCache`/`tokenCache`.【F:packages/build/src/application/environments/default-build-environment.ts†L102-L139】
- Transform and dependency caches live under `.dtifx-cache/transforms` and
  `.dtifx-cache/dependencies/snapshot.json` respectively. Override them with
  `transformCache`/`dependencyCache` when embedding distributed
  caches.【F:packages/build/src/application/environments/default-build-environment.ts†L102-L142】
- `FileSystemArtifactWriter` writes formatter artefacts relative to the configuration directory and
  honours a `defaultOutDir` override (mirroring the CLI’s
  `--out-dir`).【F:packages/build/src/application/environments/default-build-environment.ts†L120-L141】
- Options allow supplying custom logging, transform/formatter registries, dependency strategy
  overrides, and telemetry hooks while still returning the normalised configuration and runtime
  services.【F:packages/build/src/application/environments/default-build-environment.ts†L142-L209】

Dispose of the returned environment when finished to close caches and unsubscribe observers.

## `createBuildRuntime`

```ts
import { createBuildRuntime } from '@dtifx/build';
```

Constructs the planning, resolution, transform, formatter, and dependency services that make up a
build. Notable options include:

- `planner`, `transformDefinitions`, `formatterPlanner`, and other overrides to swap concrete
  implementations without rewriting orchestration
  logic.【F:packages/build/src/application/build-runtime.ts†L226-L310】
- `documentCache`, `tokenCache`, and `artifactWriter` when you want to reuse caches created by
  `createDefaultBuildEnvironment` or inject test
  doubles.【F:packages/build/src/application/build-runtime.ts†L239-L285】
- `observers` to attach lifecycle subscribers to the shared event bus for telemetry or custom
  logging.【F:packages/build/src/application/build-runtime.ts†L232-L241】

The returned services are designed to be passed directly to `executeBuild` and watch pipelines.

## `executeBuild`

```ts
import { executeBuild } from '@dtifx/build';
```

Runs the entire pipeline, instrumented with telemetry spans and timing
metrics.【F:packages/build/src/application/build-runtime.ts†L312-L471】

The result exposes:

- `plan`, `resolved`, and `tokens` – the planned sources, resolved plan, and flattened token
  snapshots.【F:packages/build/src/application/build-runtime.ts†L202-L211】
- `transforms`, `formatters`, and `writtenArtifacts` – outputs from transform executions, formatter
  batches, and artefact file paths grouped by formatter
  ID.【F:packages/build/src/application/build-runtime.ts†L202-L211】【F:packages/build/src/application/build-runtime.ts†L368-L407】
- `metrics` and `timings` – aggregate token counts and per-stage durations (plan, resolve, parse,
  transform, format,
  dependency).【F:packages/build/src/application/build-runtime.ts†L202-L211】【F:packages/build/src/application/build-runtime.ts†L312-L407】
- `dependencyChanges` and `transformCache` summaries for incremental
  tooling.【F:packages/build/src/application/build-runtime.ts†L202-L211】【F:packages/build/src/application/build-runtime.ts†L417-L462】

Use `BuildRunOptions` to disable transforms (`includeTransforms: false`), skip formatters, or nest
spans under a parent span when embedding the
runtime.【F:packages/build/src/application/build-runtime.ts†L330-L348】

## `startWatchPipeline`

```ts
import { startWatchPipeline } from '@dtifx/build';
```

Creates a long-running watch session that rebuilds when sources change. Key behaviours:

- Uses `SequentialTaskScheduler` to serialize rebuilds so concurrent file events do not overlap
  executions.【F:packages/build/src/application/pipelines/watch-pipeline.ts†L99-L195】
- Records telemetry spans per iteration (`dtifx.cli.watch.iteration`) and exports artefact counts
  after each run.【F:packages/build/src/application/pipelines/watch-pipeline.ts†L133-L201】
- Registers file-system watchers via `WatcherPort` implementations such as `ChokidarWatcher`,
  reporting reasons in the `sourceId:eventType:absolutePath` format and emitting
  `configuration update` when the config file
  changes.【F:packages/build/src/application/pipelines/watch-pipeline.ts†L213-L288】
- Exposes a `close()` handle to stop watchers, dispose the environment, and flush telemetry.

Provide a factory that returns the prepared environment (for example from
`createDefaultBuildEnvironment`) along with a watcher implementation.

## Task scheduling and observability

- `SequentialTaskScheduler` runs queued build tasks one at a time, ensuring serial rebuilds in watch
  pipelines.【F:packages/build/src/infrastructure/scheduler/sequential-task-scheduler.ts†L1-L76】
- `createBuildStageLoggingSubscriber` publishes human-readable or JSON logs per pipeline stage so
  custom hosts can reuse the CLI
  formatting.【F:packages/build/src/logging/build-event-subscriber.ts†L1-L18】
  `createBuildStageTelemetryEventSubscriber` maps domain events onto active spans to mirror the
  CLI’s telemetry structure.【F:packages/build/src/telemetry/build-event-subscriber.ts†L1-L23】

These utilities let you mirror the CLI’s behaviour in bespoke services while maintaining consistent
telemetry and structured logging.

## Configuration helpers and value types

- `resolveConfigPath` mirrors the shared configuration discovery logic while adapting the error
  message when no build config is found; pass `cwd` or `configPath` overrides when locating
  alternative roots.【F:packages/build/src/application/configuration/config-loader.ts†L17-L30】
- `loadConfig` returns a `LoadedConfig` object containing the absolute path, working directory, and
  normalised `BuildConfig`. The loader validates that layers, sources, transforms, formatters,
  dependencies, and policy declarations use the expected shapes before
  returning.【F:packages/build/src/application/configuration/config-loader.ts†L46-L170】
- Configuration types such as `TransformConfig`, `DependencyConfig`, `FormatterInstanceConfig`, and
  plugin entry unions model the options accepted by the runtime. Utilities like `pointerTemplate`
  and `placeholder` surface pointer helper factories from `@dtifx/core` so presets can compose DTIF
  URIs without manual string handling.【F:packages/build/src/config/index.ts†L4-L117】

```ts
import {
  loadConfig,
  resolveConfigPath,
  type BuildConfig,
  type FormatterInstanceConfig,
  getFormatterConfigEntries,
} from '@dtifx/build';

const configPath = await resolveConfigPath();
const { config }: { config: BuildConfig } = await loadConfig(configPath);
const formatters: readonly FormatterInstanceConfig[] = getFormatterConfigEntries(config) ?? [];
```

## Planning and source discovery

- `SourcePlanningService` orchestrates DTIF source discovery, schema validation, and lifecycle
  notifications. Supply repository and validator ports along with optional observers or a custom
  event bus to integrate with bespoke telemetry
  stacks.【F:packages/build/src/domain/services/source-planning-service.ts†L14-L96】
- `SourcePlanner` wraps the service with file-system access, schema validation, and diagnostic
  conversion. It exposes structured errors when validation fails and logs plan completion metrics
  via the shared structured logger
  interface.【F:packages/build/src/application/planner/source-planner.ts†L40-L173】
- `DefaultSourceRepository`, `pointerTemplate`, and related helpers allow planners to expand file
  globs, apply pointer templates, and interpret layer references without replicating core
  infrastructure.【F:packages/build/src/application/planner/source-planner.ts†L70-L83】【F:packages/build/src/config/index.ts†L4-L17】
- `DtifSchemaValidationAdapter` bridges the runtime with the DTIF JSON schema validator so planners
  can emit consistent diagnostics for invalid
  sources.【F:packages/build/src/application/planner/source-planner.ts†L21-L76】

## Resolution sessions and token caches

- `ResolutionSession` coordinates parsing, caching, and metric collection for DTIF documents.
  Provide parser, document cache, or token cache overrides to integrate custom adapters; otherwise
  the session provisions the default parser backed by caches when
  supplied.【F:packages/build/src/session/resolution-session.ts†L31-L90】
- `DefaultParserAdapter` exposes DTIF parsing with options for flattened tokens, dependency graphs,
  and custom session identifiers, matching the parameters accepted by
  `ResolutionSession`.【F:packages/build/src/session/resolution-session.ts†L46-L79】
- `FileSystemTokenCache` persists parser snapshots across runs using a Keyv-backed file store,
  keeping flattened tokens, metadata, and diagnostics available between builds so long-lived hosts
  avoid redundant parsing work.【F:packages/build/src/session/file-system-token-cache.ts†L38-L123】
- `ResolutionSession` exposes `consumeMetrics()` for hosts that want to surface parser timings or
  document counts alongside build
  telemetry.【F:packages/build/src/session/resolution-session.ts†L62-L88】

## Transformation services and registries

- `TransformationService` wraps an executor port with lifecycle telemetry, emitting stage start,
  completion, and error events alongside duration and result
  counts.【F:packages/build/src/domain/services/transformation-service.ts†L13-L58】
- `TransformRegistry`, `defineTransform`, and related types represent runtime transform definitions,
  pointer selectors, and cache status metadata so custom transforms can be registered or inspected
  at
  runtime.【F:packages/build/src/transform/transform-registry.ts†L1-L124】【F:packages/build/src/transform/transform-registry.ts†L176-L190】
- `TransformCache`, `InMemoryTransformCache`, and `FileSystemTransformCache` implement pluggable
  caches keyed by pointer, transform name, and options hash. The file system variant delegates to
  [`cacache`](https://www.npmjs.com/package/cacache), accepts an explicit cache directory, and
  exposes `FileSystemTransformCacheOptions` (for example `ttl`) so long-lived hosts can expire
  cached entries automatically. Inject them through `createTransformConfiguration` to reuse
  expensive transform results across
  builds.【F:packages/build/src/transform/transform-cache.ts†L1-L83】【F:packages/build/src/transform/transform-cache.ts†L84-L124】
- `createTransformConfiguration` resolves transform definitions, registries, and executors from the
  build config while honouring overrides. Use the helper to wire custom registries, executors, or
  cache instances within bespoke
  hosts.【F:packages/build/src/application/configuration/transforms.ts†L1-L120】【F:packages/build/src/application/configuration/transforms.ts†L160-L203】
- Preset factories such as `createCssTransformPreset`, `createIosSwiftUiTransformPreset`, and
  `createAndroidMaterialTransformPreset` generate transform entries for platform bundles while
  allowing granular overrides per
  transform.【F:packages/build/src/config/transform-presets.ts†L45-L155】
- Transform group helpers `TRANSFORM_GROUP_*`, `normaliseTransformGroupName`, and
  `compareTransformGroups` standardise grouping semantics so hosts can sort or filter transform
  bundles predictably.【F:packages/build/src/transform/transform-groups.ts†L1-L61】

### Direct transform factory helpers

While presets cover the most common platform combinations, the runtime also exports lower-level
factories so you can compose bespoke registries without inheriting formatter defaults:

- `createDefaultTransforms()` returns the full set of CSS-oriented transforms registered by the CLI.
  Use it when you want parity with the default command behaviour but still need to manage registries
  manually.【F:packages/build/src/transform/default-transforms.ts†L1-L11】
- `createCssTransforms()` composes colour, dimension, gradient, and typography transforms, producing
  outputs suitable for CSS variables, style dictionaries, or other web-first pipelines. Combine it
  with custom registries when you only need the web
  bundle.【F:packages/build/src/transform/css-transforms.ts†L1-L21】
- `createAndroidMaterialTransforms()` aggregates Android-specific colour, dimension, gradient,
  shadow, and typography transforms so Android hosts can register Material-friendly outputs without
  pulling in unrelated
  platforms.【F:packages/build/src/transform/android-material-transforms.ts†L1-L22】
- `createIosSwiftUiTransforms()` produces the SwiftUI equivalents, exposing transform definitions
  that return points, colour metadata, gradients, shadows, and typography records tailored for Apple
  targets.【F:packages/build/src/transform/ios-swiftui-transforms.ts†L1-L22】

Each top-level factory is built from specialised modules that focus on one token family:

- `createColorTransforms()` returns CSS metadata and variant pointers, while the platform-specific
  factories (`createIosSwiftUiColorTransforms()`, `createAndroidMaterialColorTransforms()`) expose
  SwiftUI RGBA tuples and Android ARGB
  payloads.【F:packages/build/src/transform/color-transforms.ts†L1-L141】
- `createDimensionTransforms()` normalises rem and pixel measurements for the web. SwiftUI and
  Android variants translate the same values into points, density-independent pixels (`dp`), and
  scalable pixels (`sp`).【F:packages/build/src/transform/dimension-transforms.ts†L1-L141】
- `createGradientTransforms()` serialises gradients into CSS syntax, including conic gradients. The
  SwiftUI and Android helpers reshape linear and radial gradients into angle-aware payloads with
  typed stop metadata for platform renderers and surface unsupported conic kinds with explicit
  errors.【F:packages/build/src/transform/gradient-transforms.ts†L1-L173】
- `createShadowTransforms()` focuses on multi-layer shadow structures, offering SwiftUI and Android
  factories that emit normalised layer arrays with resolved offsets, radii, spreads, and
  opacity.【F:packages/build/src/transform/shadow-transforms.ts†L1-L123】
- `createTypographyTransforms()` produces CSS declaration blocks. Platform-specific factories add
  structure for SwiftUI and Android Material, including parsed dimensions, line heights, and casing
  hints.【F:packages/build/src/transform/typography-transforms.ts†L1-L150】

## Formatting services, registries, and presets

- `FormattingService` coordinates planning, execution, and optional artifact writing for formatter
  runs, returning executed definitions, artifact metadata, and write summaries while emitting
  lifecycle telemetry.【F:packages/build/src/domain/services/formatting-service.ts†L13-L78】
- `DefaultFormatterRegistry` plans formatter executions using either pre-supplied definitions or a
  definition registry/context pair, raising explicit errors when requested formatters are not
  registered.【F:packages/build/src/infrastructure/formatting/default-formatter-registry.ts†L13-L78】
- `DefaultFormatterExecutor` evaluates formatter definitions against transform snapshots and
  enriches emitted artifacts with formatter metadata, ready for file-system writers or downstream
  consumers.【F:packages/build/src/infrastructure/formatting/default-formatter-executor.ts†L1-L29】
- `FileSystemArtifactWriter` writes formatter artifacts relative to the configuration directory,
  falling back to a configurable default output directory to mirror CLI
  behaviour.【F:packages/build/src/infrastructure/formatting/file-system-artifact-writer.ts†L7-L53】
- `createFormatterConfiguration` materialises planner, executor, and plan arrays, accepting
  overrides for tests or advanced hosts that need to precompute
  plans.【F:packages/build/src/application/configuration/formatters.ts†L23-L80】
- Preset factories (`createFormatterPreset`, `createCssFormatterPreset`,
  `createIosSwiftUiFormatterPreset`, `createAndroidMaterialFormatterPreset`) produce formatter
  instance arrays for common platform targets, with overrides for directories, identifiers, and
  options.【F:packages/build/src/config/formatter-presets.ts†L53-L143】
- `createBuildPreset`, `createCssBuildPreset`, `createIosSwiftUiBuildPreset`, and
  `createAndroidMaterialBuildPreset` combine transform and formatter presets into ready-to-merge
  build configuration fragments.【F:packages/build/src/config/build-presets.ts†L101-L200】

## Dependency tracking and incremental caches

- `DependencyTrackingService` evaluates resolved plans to generate dependency snapshots, run diff
  strategies, and commit results back to stores while emitting lifecycle events for
  observers.【F:packages/build/src/domain/services/dependency-tracking-service.ts†L18-L78】
- `SnapshotDependencySnapshotBuilder`, `SnapshotDependencyDiffStrategy`, and
  `GraphDependencyDiffStrategy` provide default implementations for snapshot creation and diffing,
  including configurable transitive graph
  expansion.【F:packages/build/src/domain/services/dependency-strategy-defaults.ts†L32-L165】
- `DependencyStrategyRegistry`, `DefaultDependencyStrategyRegistry`, and helper factories allow
  hosts to register custom diff strategies or tweak the built-in snapshot and graph behaviours using
  typed options.【F:packages/build/src/incremental/dependency-strategy-registry.ts†L12-L161】
- `TokenDependencyCache`, `FileSystemTokenDependencyCache`, and `createTokenDependencySnapshot`
  persist dependency edges between runs, producing deterministic snapshots and diffs keyed by DTIF
  pointers.【F:packages/build/src/incremental/token-dependency-cache.ts†L12-L137】【F:packages/build/src/incremental/token-dependency-cache.ts†L174-L200】

## Task queues, schedulers, and watchers

- `runTaskQueue` and `normaliseConcurrency` execute arbitrary async work with bounded concurrency
  and predictable result ordering, which is useful when parallelising transforms or formatter
  operations.【F:packages/core/src/concurrency/queue.ts†L3-L124】
- `SequentialTaskScheduler` serialises work items in watch pipelines to avoid overlapping rebuilds
  when file-system events arrive in
  bursts.【F:packages/build/src/infrastructure/scheduler/sequential-task-scheduler.ts†L1-L76】
- `ChokidarWatcher` adapts the chokidar file-system watcher to the toolkit’s watch port, forwarding
  create/update/delete events and surfacing watcher errors through the standard
  callbacks.【F:packages/build/src/infrastructure/watch/chokidar-watcher.ts†L1-L63】

## Logging and telemetry primitives

- `JsonLineLogger` and `noopLogger` provide ready-to-use structured logging implementations that
  complement the build event subscribers when hosting the runtime without the CLI
  shell.【F:packages/build/src/index.ts†L73-L75】
- `createTelemetryTracer` and `noopTelemetryTracer` expose OpenTelemetry-backed tracing utilities so
  build hosts can capture timings or disable telemetry entirely without changing call
  sites.【F:packages/core/src/telemetry/tracer.ts†L1-L120】
- `createBuildStageTelemetryEventSubscriber` bridges build lifecycle events onto telemetry spans,
  aligning programmatic integrations with the CLI’s exported
  metrics.【F:packages/build/src/telemetry/build-event-subscriber.ts†L10-L22】

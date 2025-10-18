---
title: Build workflow deep dive
description:
  End-to-end behaviour of the `dtifx build` subcommands, including caching and watch orchestration.
outline: deep
---

# Build workflow deep dive

`dtifx build` packages planning, resolution, transformation, and formatter orchestration into four
subcommands. This walkthrough explains the runtime surface that each command exercises, the inputs
it consumes, the outputs it produces, and when to reach for it in delivery pipelines. The final
section highlights how incremental caches, dependency tracking, and the chokidar-based watcher wire
into repeated runs.

## Command overview

### `dtifx build validate`

**Purpose.** Plans all configured sources and reports the number of entries discovered so you can
verify coverage before formatting tokens. The command is ideal for pre-flight checks in CI or for
validating configuration changes locally.

**Inputs.** Uses the shared build options (`--config`, `--out-dir`, `--reporter`, `--json-logs`,
`--telemetry`, `--timings`) resolved through `resolveBuildGlobalOptions`. It loads the build module,
reporters, and prepares the default build environment before running the
planner.【F:packages/cli/src/tools/build/validate-command-runner.ts†L24-L90】

**Outputs.** The reporter prints the planned entry count, and telemetry spans capture planner timing
so CI logs and exporters can correlate
runtimes.【F:packages/cli/src/tools/build/validate-command-runner.ts†L45-L90】

**Exit codes.** Any module load failure, environment preparation issue, or planning exception sets
`process.exitCode = 1`. Successful runs return with the Node default exit status
`0`.【F:packages/cli/src/tools/build/validate-command-runner.ts†L24-L70】

### `dtifx build generate`

**Purpose.** Executes the full pipeline (plan, resolve, transforms, formatters, dependency commit)
and writes artefacts to the configured destinations. Use it for one-shot builds in CI/CD or local
publishing.

**Inputs.** Shares the global options, then prepares the build environment with telemetry and
reporting dependencies before invoking `build.executeBuild` with the generated
services.【F:packages/cli/src/tools/build/generate-command-runner.ts†L20-L87】

**Outputs.** Emit formatted artefacts and a summary (token counts, formatter runs, artefact totals)
through the selected reporter. The helper also totals written artefacts so telemetry spans record
the same
metrics.【F:packages/cli/src/tools/build/generate-command-runner.ts†L58-L77】【F:packages/cli/src/tools/build/generate-command-runner.ts†L89-L97】

**Exit codes.** Any loading or runtime failure sets `process.exitCode = 1`, allowing CI to detect
failures without additional
wiring.【F:packages/cli/src/tools/build/generate-command-runner.ts†L21-L86】

### `dtifx build inspect`

**Purpose.** Runs the pipeline without formatters and inspects resolved tokens, optionally filtered
by pointer or `$type`, to help debug transformations or governance policies.

**Inputs.** Accepts the global build options along with `--pointer`, `--type`, and `--json`. The
command loads build modules, prepares the environment, and passes `includeFormatters: false` so
execution stops after resolution and
transformations.【F:packages/cli/src/tools/build/inspect-command-runner.ts†L32-L163】

**Outputs.** Emits either human-readable summaries or structured JSON containing token values,
transform outputs, metadata, and provenance. When filters match nothing it prints an explicit
message to avoid silent skips.【F:packages/cli/src/tools/build/inspect-command-runner.ts†L83-L118】

**Exit codes.** Missing dependencies or runtime failures set `process.exitCode = 1`. Successful
inspections exit with status
`0`.【F:packages/cli/src/tools/build/inspect-command-runner.ts†L32-L127】

### `dtifx build watch`

**Purpose.** Continuously rebuilds on filesystem changes with chokidar-backed file watching and a
sequential scheduler. Ideal for local development or long-running preview environments.

**Inputs.** Resolves the same global options, then establishes a watch pipeline that reuses prepared
build environments and reporters for each
iteration.【F:packages/cli/src/tools/build/watch-command-runner.ts†L19-L62】

**Outputs.** Reporters receive build completions (including artefact counts) and watch lifecycle
messages for every iteration. Failures are surfaced but the process keeps running so the next change
can
retry.【F:packages/build/src/application/pipelines/watch-pipeline.ts†L136-L177】【F:packages/build/src/application/pipelines/watch-pipeline.ts†L184-L209】

**Exit codes.** The command keeps the process alive; it does not set a non-zero exit code on build
failures so that file changes can trigger subsequent
rebuilds.【F:packages/cli/src/tools/build/watch-command-runner.ts†L19-L62】【F:packages/build/src/application/pipelines/watch-pipeline.ts†L170-L177】

## Incremental execution plumbing

### Runtime caches and dependency tracking

`createBuildRuntime` threads caches and dependency services through every run. Document and token
caches can be supplied (or reused between runs) to the resolution session, transform caches can be
injected for incremental transformation, and dependency tracking receives a cache store so change
sets can be diffed between
iterations.【F:packages/build/src/application/build-runtime.ts†L240-L296】

During execution the runtime records dependency evaluations, transformation cache usage, formatter
outputs, and commits dependency snapshots at the end of successful runs. Metrics such as cache hits,
changed dependency counts, and written artefacts flow into telemetry so CI logs and reporters share
a consistent picture of incremental
behaviour.【F:packages/build/src/application/build-runtime.ts†L385-L515】

### Watch orchestration and chokidar integration

`dtifx build watch` wires `ChokidarWatcher` and `SequentialTaskScheduler` into `startWatchPipeline`.
The runtime factory receives previous document and token caches after configuration reloads so
incremental parsing persists between rebuilds. Watch registrations emit change reasons containing
the source ID, event type, and absolute path so reporters can surface actionable
context.【F:packages/cli/src/tools/build/watch-command-runner.ts†L38-L62】【F:packages/build/src/application/pipelines/watch-pipeline.ts†L114-L238】

`ChokidarWatcher` adapts chokidar’s `FSWatcher` to the build watcher port, normalising events into
the `created`/`updated`/`deleted` set expected by the pipeline and forwarding errors to the
registered callbacks.【F:packages/build/src/infrastructure/watch/chokidar-watcher.ts†L11-L78】

Together these adapters allow watch sessions to queue rebuilds serially, reuse caches, and stream
reporting hooks without duplicating command
implementations.【F:packages/build/src/application/pipelines/watch-pipeline.ts†L136-L209】【F:packages/build/src/application/pipelines/watch-pipeline.ts†L223-L317】

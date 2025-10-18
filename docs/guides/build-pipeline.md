---
title: Build pipeline guide
description: Operate the DTIFx build runtime from the CLI and custom hosts.
outline: deep
---

# Build pipeline guide

The build runtime in `@dtifx/build` plans token sources, resolves layered snapshots, runs
transforms, and executes formatter plans. The `dtifx build` command exposes the pipeline with
consistent logging and telemetry.

## Configuration essentials

Build configuration modules export a `BuildConfig` object with two required properties:

- `layers` – Ordered entries describing logical layers (for example `base`, `brand`).
- `sources` – File or virtual sources mapped to layers with pointer templates.

Optional sections include:

- `transforms` – Ordered transform entries and plugin registrations.
- `formatters` – Formatter manifests with `name`, optional `id`, `options`, and output targets.
- `audit` – Policy entries consumed by standalone [`dtifx audit` runs](/guides/audit-governance),
  not the build pipeline itself.
- `dependencies` – Dependency strategy configuration and plugins.

> 💡 Prefer not to curate transform and formatter lists manually? The
> [platform build presets](/guides/build-presets) helper composes CSS, SwiftUI, and Android bundles
> that you can spread directly into the configuration object.

The CLI resolves configuration paths by searching for `dtifx.config.mjs`, `.js`, `.cjs`, or `.json`
from the current working directory unless `--config` provides an explicit path. Validation fails
with clear diagnostics if `layers` or `sources` are missing, or when plugin entries are malformed.

### Emitting JavaScript and TypeScript modules

Add the `javascript.module` and `typescript.module` formatters to publish DTIF snapshots directly to
applications and bundlers:

```ts
formatters: {
  entries: [
    {
      name: 'javascript.module',
      output: { directory: 'dist/modules' },
      options: {
        filename: 'tokens.js',
        rootIdentifier: 'moduleTokens',
        namedExports: true,
        transforms: ['dimension.toRem'],
      },
    },
    {
      name: 'typescript.module',
      output: { directory: 'dist/modules' },
      options: { filename: 'tokens.ts', rootIdentifier: 'moduleTokens' },
    },
  ],
},
```

The JavaScript formatter emits an `.js` module plus a `.d.ts` declaration so editors and static
analysis understand the exported shape. Enable `namedExports` when you want bundlers to tree-shake
individual pointer roots. Use the `transforms` option to embed transform output alongside the token
data—be sure the matching transforms are declared under the `transforms` section of the build
configuration.

The TypeScript formatter produces an `.ts` module that preserves literal types with `as const`. Both
formatters honour the `rootIdentifier` option, allowing you to select an export name that matches
the consuming code base.

## Shared CLI flags

Every subcommand accepts the following options:

- `-c, --config <path>` – Path to the configuration file. Defaults to the nearest `dtifx.config.*`.
- `--out-dir <path>` – Fallback directory for formatter artefacts (defaults to `dist`).
- `--reporter <format>` – CLI reporter output (`human`, `json`, `markdown`, `html`). Defaults to
  `human`.
- `--json-logs` – Emit NDJSON structured logs instead of human-readable messages.
- `--timings` – Include stage timing breakdowns in reporter output.
- `--telemetry <mode>` – Telemetry exporter (`none`, `stdout`). Defaults to `none`.

Unknown options are tolerated so wrapper scripts can add their own parsing, but they are not
forwarded automatically. Pass explicit flags when plugins require additional inputs.

## Commands

### Validate

`dtifx build validate` plans sources and verifies configuration without executing transforms or
formatters. Successful runs print the number of planned entries. Failures include diagnostic details
from the planner (for example missing files or duplicate identifiers). Use this command in CI to
catch misconfigured builds quickly.

### Generate

`dtifx build generate` executes the full pipeline:

1. Plans sources and resolves layered tokens.
2. Runs transforms and caches results in `.dtifx-cache/transforms`.
3. Executes formatter plans via the configured writer (file system by default).
4. Evaluates dependency metadata when present.

Reporters emit artefact counts and token totals. Non-zero exit codes indicate failures raised by
transforms, formatters, or dependency analysers. Combine `--json-logs` with the JSON reporter for
machine-readable evidence. Execute [`dtifx audit run`](/guides/audit-governance) to evaluate
policies using the same configuration.

### Inspect

`dtifx build inspect` resolves tokens once and filters the snapshots for debugging. Options:

- `-p, --pointer <jsonPointer>` – Only include tokens whose pointer starts with the supplied prefix.
- `-t, --type <tokenType>` – Filter by resolved `$type`.
- `--json` – Emit JSON instead of human-readable output.

The command honours global flags, so telemetry and logging behave consistently with other
subcommands. Inspection results include resolved values, any transform outputs linked to the
pointer, and provenance URIs.

### Watch

`dtifx build watch` monitors configuration sources and reruns the pipeline when files change. It
instantiates a `ChokidarWatcher` and a `SequentialTaskScheduler` to serialise rebuilds. Each cycle
reports the triggering source identifier, event type, and absolute path (for example
`design-tokens:created:/repo/tokens/button.json`) and reuses caches supplied by
`prepareBuildEnvironment`. Use this mode to integrate hot reloading into local design system
tooling.

## Telemetry and logging

- `--json-logs` swaps the logger for `JsonLineLogger`, writing NDJSON to stdout. The format matches
  the structured events generated by the runtime and suits log aggregation.
- `--telemetry stdout` streams spans to stdout through the OpenTelemetry console exporter for local
  inspection.
- All commands flush spans via `exportSpans()` before exit so long-running `watch` sessions still
  deliver telemetry between cycles.

## Embedding the runtime

Re-create the CLI behaviour programmatically:

```ts
import {
  createDefaultBuildEnvironment,
  createTelemetryRuntime,
  executeBuild,
  loadConfig,
} from '@dtifx/build';

const loaded = await loadConfig('/absolute/path/dtifx.config.mjs');
const environment = createDefaultBuildEnvironment(
  {
    config: loaded.config,
    configDirectory: loaded.directory,
    configPath: loaded.path,
  },
  { defaultOutDir: 'dist' },
);
const telemetry = createTelemetryRuntime('stdout');

try {
  const span = telemetry.tracer.startSpan('custom-build');
  const result = await executeBuild(environment.services, loaded.config, telemetry.tracer, {
    parentSpan: span,
  });
  span.end({ attributes: { tokenCount: result.metrics.totalCount } });
  console.log(`Resolved ${result.metrics.totalCount} tokens.`);
} finally {
  await telemetry.exportSpans();
}
```

This pattern mirrors the CLI: resolve configuration, prepare the environment, run the build, emit
telemetry, then dispose of caches when done.

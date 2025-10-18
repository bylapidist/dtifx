---
title: '@dtifx/build'
description: 'Compose planners, resolvers, and formatters into observable DTIF delivery pipelines.'
---

# `@dtifx/build`

`@dtifx/build` layers opinionated planning, resolution, and formatting modules on top of the shared
`@dtifx/core` runtime. The package helps teams sequence token extraction, transformation, and
publication steps with first-class telemetry and policy enforcement.

## Key capabilities

- **Composable planners** — Break work into deterministic stages so pipelines stay reproducible.
- **Resolvers and transformers** — Expand token graphs, normalise values, and run formatters for
  each delivery channel.
- **Integrated observability** — Export telemetry and status reporting to keep CI runs transparent.

## Getting started

Add the package alongside `@dtifx/core`, then either call the CLI or embed the runtime helpers used
by the shipped commands.

```bash
pnpm add @dtifx/build
```

### Run builds via the CLI

The CLI wires configuration loading, environment setup, and telemetry for you:

```bash
# validate configuration without executing transforms
pnpm exec dtifx build validate

# generate artifacts using your configured formatters
pnpm exec dtifx build generate --out-dir dist
```

### Embed the runtime workflow

Recreate the same workflow programmatically using the exported helpers:

```ts
import {
  createDefaultBuildEnvironment,
  createTelemetryRuntime,
  executeBuild,
  loadConfig,
  resolveConfigPath,
} from '@dtifx/build';

const configPath = await resolveConfigPath();
const loaded = await loadConfig(configPath);
const context = {
  config: loaded.config,
  configPath: loaded.path,
  configDirectory: loaded.directory,
};
const environment = createDefaultBuildEnvironment(context, { defaultOutDir: 'dist' });
const telemetry = createTelemetryRuntime('stdout');

try {
  const result = await executeBuild(environment.services, loaded.config, telemetry.tracer);
  console.log(`Resolved ${result.metrics.totalCount} tokens.`);
} finally {
  await telemetry.exportSpans();
}
```

To consume tokens directly from applications or documentation sites, add the `javascript.module` and
`typescript.module` formatters to your configuration. They emit ESM modules (`tokens.js` +
`tokens.d.ts`, or `tokens.ts`) with optional named exports and embedded transform output so you can
import the same snapshots that ship to other delivery targets.

## Release highlights

- **Jetpack Compose bundles** — Register `android.compose` presets to emit Kotlin `Color`,
  `TextStyle`, and `RoundedCornerShape` artifacts alongside Material resources without manual
  wiring.

## Resources

- [Build pipeline guide](/guides/build-pipeline) — Configure planners, resolvers, and formatters for
  production deployments.
- [Platform build presets](/guides/build-presets) — Drop platform-specific transform and formatter
  bundles into your configuration without manual wiring.
- [Build configuration reference](/reference/build-config) — Schema reference for pipeline manifests
  and module wiring.
- [Build runtime reference](/reference/build-runtime) — Runtime APIs for executing and extending
  build stages.

---
title: '@dtifx/core'
description: 'Diagnostics, telemetry, configuration, and runtime primitives for DTIF workflows.'
---

# `@dtifx/core`

`@dtifx/core` provides the shared runtime substrate that powers every DTIFx package. It exposes
observability utilities, configuration loaders, policy helpers, and host-agnostic primitives so the
build, diff, audit, and CLI experiences stay consistent.

## Key capabilities

- **Diagnostics and telemetry** — Emit structured logs and spans that flow through every other
  package for end-to-end traceability.
- **Configuration loaders** — Resolve workspace manifests, apply environment overlays, and surface
  strongly typed settings to consuming hosts.
- **Runtime primitives** — Share cache, IO, and module orchestration facilities that the build,
  diff, audit, and CLI layers reuse.

## Getting started

Install the package in any DTIF-capable workspace and bootstrap the telemetry and configuration
context before orchestrating additional modules:

```bash
pnpm add @dtifx/core
```

```ts
import {
  JsonLineLogger,
  createTelemetryRuntime,
  resolveConfigPath,
  loadConfigModule,
} from '@dtifx/core';

const telemetry = createTelemetryRuntime('stdout', {
  logger: new JsonLineLogger(process.stdout),
});

const configPath = await resolveConfigPath({ cwd: process.cwd() });
const { config } = await loadConfigModule({ path: configPath });

const span = telemetry.tracer.startSpan('bootstrap');
try {
  // pass telemetry.tracer and config into downstream modules
} finally {
  span.end();
  await telemetry.exportSpans();
}
```

With telemetry configured and the workspace configuration resolved, you can provide these runtime
primitives to build, diff, audit, or CLI modules. They inherit a consistent diagnostics channel,
structured telemetry pipeline, and strongly typed settings for predictable automation.

## Resources

- [Core runtime reference](/reference/core-runtime) — Detailed API surface for runtime factories and
  lifecycle hooks.
- [Telemetry overview](/overview/telemetry) — Walkthrough of the shared tracing and logging
  facilities used by every package.
- [Toolkit architecture](/overview/architecture) — How `@dtifx/core` integrates with the build,
  diff, audit, and CLI stacks.
- [Semantic token prefabs](/core/prefabs) — Typed builders for colour, gradient, typography, and
  shadow tokens.

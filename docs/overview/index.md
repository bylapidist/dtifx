---
title: Toolkit overview
description: Orientation for the DTIFx monorepo, packages, and supported workflows.
outline: deep
---

# Toolkit overview

The DTIFx Toolkit delivers deterministic automation for the Design Token Interchange Format (DTIF).
Every package shares the same runtime primitives—configuration loading, structured logging,
telemetry, and policy evaluation—so the CLI and programmatic interfaces behave consistently across
workflows.

## Supported runtimes

All packages target **Node.js 22 or later**. The published manifests declare this requirement
through `engines.node`, and the executables exit early on older versions. Align local environments
and CI agents on the same major release to avoid runtime mismatch.

## Package responsibilities

- **`@dtifx/core`** – Foundational utilities covering telemetry runtimes, structured loggers,
  configuration resolution, token source planning, policy orchestration, and semantic token prefabs
  for colours, gradients, typography, and shadows.
- **`@dtifx/build`** – DTIF-aware build orchestrator that plans sources, resolves layered snapshots,
  executes transforms, writes formatter artefacts, and evaluates dependency metadata.
- **`@dtifx/diff`** – Token diff engine with rename detection, impact heuristics, filter evaluation,
  and formatters for CLI, JSON, Markdown, HTML, YAML, SARIF, and custom templates.
- **`@dtifx/audit`** – Policy-driven governance runtime that loads policy catalogues, resolves
  tokens, and runs audits with human, Markdown, HTML, and JSON reporters.
- **`@dtifx/cli`** – Unified CLI surface that registers the build, diff, and audit command modules
  behind the `dtifx` binary.

Each package exports TypeScript types alongside runtime utilities, enabling bespoke hosts to compose
pipelines without depending on the CLI entry point.

## Workflow surfaces

The `@dtifx/cli` binary instantiates a shared kernel (`createCliKernel`) and registers the diff,
build, and audit command modules. Running `dtifx` without arguments lists the available namespaces,
and individual commands (`dtifx diff …`, `dtifx build …`, `dtifx audit …`) mirror the APIs described
throughout the documentation.

- **Registered token types** – The DTIF registry recognises design token identifiers spanning
  borders, colours, composite components, cursors, dimensions, durations, easing curves, elevation
  shadows, filters, fonts, font faces, gradients, dedicated line-height entries, motion transforms,
  opacity, multi-layer shadows, stroke styles, typography bundles, and z-index stacking contexts.
  These map directly to `$type` values such as `border`, `color`, `component`, `cursor`,
  `dimension`, `duration`, `easing`, `elevation`, `filter`, `font`, `fontFace`, `gradient`,
  `line-height`, `motion`, `opacity`, `shadow`, `strokeStyle`, `typography`, and `z-index` in DTIF
  documents.

- **Build workflows** plan sources, resolve tokens, run transforms, and execute formatters through
  the services exported by `@dtifx/build`.
- **Diff workflows** load previous and next snapshots through token source ports and render reports
  via `renderReport`.
- **Audit workflows** load configuration with `resolveAuditConfigPath`, prepare token environments,
  and run policies using `createAuditRuntime`.

## Configuration model

Configuration files follow the shared loader exported by `@dtifx/core/config`. The loader resolves
the nearest `dtifx.config.mjs`, `.js`, `.cjs`, or `.json` file, executes it, and returns an object
with the absolute path, working directory, and exported configuration value. Modules may export the
configuration via a named `config`, `buildConfig`, or `auditConfig` export, a default export, or a
function/promise that resolves to the object. Build and audit runtimes validate the resulting
structure before orchestrating pipelines:

- Build configs must expose non-empty `layers` and `sources` arrays and may optionally include
  `transforms`, `formatters`, `audit`, and `dependencies` blocks.
- Audit configs supply policy entries and optional plugin registrations that extend the policy
  catalogue prior to evaluation.

Reusing the shared loader keeps configuration resolution deterministic across the CLI, automated
scripts, and integration tests.

## Observability

`@dtifx/core` exposes `createTelemetryRuntime` with two modes: `none` and `stdout` (console span
exporter). Every CLI command wires the runtime into its domain services and flushes spans via
`exportSpans()` before exit. Structured loggers share the same context so spans and log events can
be correlated by trace metadata.

Diagnostics flow through strongly typed ports. Token source loaders emit structured events
describing load start, success, and failure, while diff and reporting layers emit category-scoped
diagnostics. When the CLI runs with `--json-logs` it switches to the shared `JsonLineLogger` so
diagnostics can be shipped to observability stacks without custom parsing.

## Next steps

- Explore the [architecture](./architecture.md) deep dive to see how the runtime layers fit
  together.
- Follow the [quickstart guide](/guides/getting-started) to exercise the build, audit, and diff
  commands in a sample workspace.
- Review the [semantic token prefabs](/core/prefabs) to compose colour, gradient, typography, and
  shadow tokens programmatically.
- Browse the [CLI reference](/reference/cli) for command listings, defaults, and exit-code
  behaviour.

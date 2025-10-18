---
title: Architecture
description: How DTIFx packages compose runtime layers, shared infrastructure, and tooling.
outline: deep
---

# Architecture

The DTIFx monorepo is organised around a layered runtime model. Shared utilities live in
`@dtifx/core`, domain-specific runtimes build on top, and thin hosts expose commands or services. Nx
powers the workspace so builds, tests, and documentation run reproducibly.

## Repository topology

- **`packages/core`** provides core facilities: telemetry runtimes, structured logging,
  configuration discovery, token source planning, token resolution, concurrency utilities, and the
  policy engine.
- **`packages/build`** orchestrates end-to-end build pipelines. It exports
  `createDefaultBuildEnvironment` to prepare caches and registries, `createBuildRuntime` to wire
  services, and `executeBuild` to run planners, resolvers, transforms, and formatters.
- **`packages/diff`** implements the diff session pipeline. It exposes token source adapters,
  `runDiffSession`, filtering utilities, failure policies, and report renderers.
- **`packages/audit`** loads policy manifests, resolves tokens through either the native or
  build-backed environments, and runs evaluations through `createAuditRuntime` with CLI reporters.
- **`packages/cli`** stitches the runtimes together behind the `dtifx` binary. Command modules
  register with the shared kernel so each workflow receives a consistent IO contract.

Shared TypeScript configuration, ESLint rules, and Markdown linting live at the repo root. Nx
project files (`project.json`) define `build`, `test`, `lint`, and `docs:build` targets with caching
enabled.

## Runtime layering

1. **Foundation – `@dtifx/core`**
   - Token sources use pointer templates, placeholders, and layered context to create deterministic
     plans. The same abstractions feed both build and audit pipelines.
   - Telemetry is provided by `createTelemetryRuntime`, which returns a tracer and an `exportSpans`
     hook. Exporters include the OpenTelemetry console span exporter (`stdout`).
   - Policy configuration loads default governance factories (owner metadata, deprecation
     replacements, tag requirements, override approvals, WCAG contrast) and plugin modules.

2. **Domain runtimes – build, diff, audit**
   - Build runtime services (`SourcePlanner`, `TokenResolutionService`, `TransformationService`,
     `FormattingService`, `DependencyTrackingService`) coordinate planning, parsing, transformation,
     formatting, and dependency snapshots.
   - Diff sessions combine token loading, rename detection, impact classification, summarisation,
     and failure policy evaluation before rendering reports.
   - Audit runtimes reuse the same resolution services and policy engine, optionally delegating to
     the build runtime when audits need build-aware context such as cached transforms.

3. **Hosts – CLI and integrations**
   - The CLI registers command modules that translate Commander arguments into runtime calls. Each
     command resolves configuration paths through `@dtifx/core/config`, prepares environments, and
     forwards IO and telemetry handles to the runtimes.
   - Custom hosts can import the same functions to embed DTIF workflows in pipelines, bots, or other
     automation without reimplementing orchestration logic.

## Telemetry and logging integration

Domain services publish lifecycle events to an in-memory event bus. CLI entry points subscribe with
logging and telemetry adapters:

- Build commands attach `createBuildStageLoggingSubscriber` to emit human-readable events or NDJSON
  structured logs when `--json-logs` is set.
- Telemetry spans are created per command (for example `dtifx.cli.generate`, `dtifx.cli.inspect`,
  `dtifx.cli.audit`). Each pipeline stage becomes a child span, and exporters flush via
  `exportSpans()` before the process exits.
- Audit commands reuse the same pattern, forwarding stage timings and policy summaries to the
  configured reporter.

## Design principles

- **Single source of truth** – Token planning, parsing, diffing, and policy evaluation share the
  same adapters to keep behaviour identical across hosts.
- **Predictable automation** – Configuration loading, telemetry wiring, and logging use shared
  utilities so CI and local runs surface the same diagnostics.
- **Extensibility without forks** – Plugins register transforms, dependency strategies, and policies
  by exporting factories. Custom report renderers hook into the diff runtime via the public
  `renderReport` API.
- **Incremental adoption** – Teams can start with the diff engine, add the build runtime for
  artefact generation, and adopt the audit runtime once governance requirements mature, all through
  the same CLI.

Read the [telemetry guide](./telemetry.md) for exporter details and instrumentation patterns.

# @dtifx/core

## 4.0.0

### Patch Changes

- e5f6223: Add the missing `@types/color` dependency so TypeScript builds succeed under Vitest 4.

## 3.0.0

### Minor Changes

- 35e826e: add semantic token prefabs for colour, gradient, typography, and shadow tokens

### Patch Changes

- 35e826e: use color package for color prefab adjustments

## 2.0.0

### Minor Changes

- 36a9f87: introduce session-backed token parser that reuses dtif-parser sessions for token plans,
  surface parser metrics plus aggregated snapshots through the token resolution service, and rename
  the public adapter to `SessionTokenParser`

## 1.0.0

### Major Changes

- 96b318d: Initial public release of the DTIFx Toolkit.
  - `@dtifx/core` – Shared runtime with structured logging, telemetry primitives, and policy
    utilities.
  - `@dtifx/cli` – Unified command line that wires audit, build, and diff workflows with consistent
    UX.
  - `@dtifx/build` – DTIF-aware build orchestrator for transforms, caching, and formatter pipelines.
  - `@dtifx/audit` – Governance engine for evaluating policies and reporting actionable compliance
    signals.
  - `@dtifx/diff` – Token diff engine with rich reporters, impact analysis, and CI-ready gates.

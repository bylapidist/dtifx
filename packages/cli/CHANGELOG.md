# @dtifx/cli

<!-- markdownlint-disable MD024 -->

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

### Patch Changes

- 3b7a0a5: enable formatter plugin integration test to run against workspace dependencies
- Updated dependencies [96b318d]
  - @dtifx/core@1.0.0
  - @dtifx/build@1.0.0
  - @dtifx/audit@1.0.0
  - @dtifx/diff@1.0.0

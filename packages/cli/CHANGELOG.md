# @dtifx/cli

## 4.1.2

### Patch Changes

- Updated dependencies [b4206a4]
  - @dtifx/extractors@4.1.2
  - @dtifx/core@4.1.2
  - @dtifx/diff@4.1.2
  - @dtifx/build@4.1.2
  - @dtifx/audit@4.1.2

## 4.1.1

### Patch Changes

- 83ba7bb: ensure diff compare reports create parent directories when writing to disk
- Updated dependencies [2710789]
  - @dtifx/extractors@4.1.1
  - @dtifx/core@4.1.1
  - @dtifx/diff@4.1.1
  - @dtifx/build@4.1.1
  - @dtifx/audit@4.1.1

## 4.1.0

### Minor Changes

- 6296f6f: add Penpot and Sketch extractors with CLI integrations and documentation

### Patch Changes

- Updated dependencies [6296f6f]
- Updated dependencies [9a79525]
- Updated dependencies [5e0810a]
  - @dtifx/extractors@4.1.0
  - @dtifx/build@4.1.0
  - @dtifx/core@4.1.0
  - @dtifx/audit@4.1.0
  - @dtifx/diff@4.1.0

## 4.0.0

### Minor Changes

- a398a6a: Add the extractor package with Figma support and wire it into the CLI as
  `dtifx extract figma`.

### Patch Changes

- 4234167: align CLI peer dependency ranges with the v3 major to avoid unnecessary major releases
- Updated dependencies [e5f6223]
- Updated dependencies [a398a6a]
- Updated dependencies [a398a6a]
- Updated dependencies [a398a6a]
- Updated dependencies [a398a6a]
  - @dtifx/core@4.0.0
  - @dtifx/extractors@4.0.0
  - @dtifx/build@4.0.0
  - @dtifx/diff@4.0.0
  - @dtifx/audit@4.0.0

## 3.0.0

### Minor Changes

- 98efcc1: Add a `dtifx init` scaffolder with local templates, workspace validation, and
  documentation updates.

### Patch Changes

- Updated dependencies [48b6817]
- Updated dependencies [35e826e]
- Updated dependencies [35e826e]
  - @dtifx/build@3.0.0
  - @dtifx/core@3.0.0
  - @dtifx/audit@3.0.0
  - @dtifx/diff@3.0.0

## 2.0.0

### Patch Changes

- Updated dependencies [36a9f87]
  - @dtifx/core@2.0.0
  - @dtifx/audit@2.0.0
  - @dtifx/build@2.0.0
  - @dtifx/diff@2.0.0

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

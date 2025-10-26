# @dtifx/extractors

## 4.1.3

### Patch Changes

- Updated dependencies [0684b5d]
  - @dtifx/core@4.1.3

## 4.1.2

### Patch Changes

- b4206a4: ensure cli smoke test installs local peer packages
  - @dtifx/core@4.1.2

## 4.1.1

### Patch Changes

- 2710789: Respect custom Figma API base URLs when generating image token values.
  - @dtifx/core@4.1.1

## 4.1.0

### Minor Changes

- 6296f6f: add Penpot and Sketch extractors with CLI integrations and documentation

### Patch Changes

- Updated dependencies [5e0810a]
  - @dtifx/core@4.1.0

## 4.0.0

### Minor Changes

- a398a6a: Add the extractor package with Figma support and wire it into the CLI as
  `dtifx extract figma`.

### Patch Changes

- a398a6a: Add a CLI smoke test suite that packages @dtifx/extractors with the CLI and verifies
  Figma extraction end to end.
- a398a6a: ensure the extractor smoke workspace installs dependencies for production environments
- Updated dependencies [e5f6223]
  - @dtifx/core@4.0.0

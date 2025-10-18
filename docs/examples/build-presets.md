---
title: Build preset configuration example
description: Reference configuration that composes CSS, SwiftUI, and Android presets.
---

# Build preset configuration example

The snippet below demonstrates how to compose the platform build presets exported by `@dtifx/build`.
It configures a shared token source and aggregates CSS, SwiftUI, and Android pipelines in one
module.

```ts
import { createBuildPreset, placeholder, pointerTemplate, type BuildConfig } from '@dtifx/build';

const presets = createBuildPreset({
  css: { formatters: { baseDirectory: 'dist/web' } },
  iosSwiftUi: { formatters: { baseDirectory: 'dist/apple' } },
  androidMaterial: {
    transforms: { baseGroup: 'android' },
    formatters: { baseDirectory: 'dist/android' },
  },
});

export const config: BuildConfig = {
  layers: [{ name: 'base' }],
  sources: [
    {
      kind: 'file',
      id: 'design-tokens',
      layer: 'base',
      pointerTemplate: pointerTemplate('tokens', placeholder('stem')),
      patterns: ['tokens/**/*.json'],
    },
  ],
  ...presets,
};
```

The helper spreads transform entries and formatter instances into the config, so
`dtifx build generate` immediately emits platform-specific artifacts. Adjust the options to override
formatter identifiers, change output directories, or disable bundle entries while keeping the rest
of the preset intact.

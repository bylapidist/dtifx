---
title: Formatter presets
description: Configure the formatter preset helpers exported by @dtifx/build.
outline: deep
---

# Formatter presets

`@dtifx/build` provides preset helpers that register formatter instances for JSON snapshots, CSS,
Sass, Less, SwiftUI, Android Material, and Jetpack Compose pipelines. They return arrays of
`FormatterInstanceConfig` objects so you can spread them into a build configuration or merge them
with other formatter entries.

## Available helpers

- `createJsonFormatterPreset(options)` — Registers `json.snapshot` and writes to `dist/json` by
  default.
- `createCssFormatterPreset(options)` — Registers `css.variables` and writes to `dist/css` by
  default.
- `createSassFormatterPreset(options)` — Registers `sass.variables` and writes to `dist/sass` by
  default.
- `createLessFormatterPreset(options)` — Registers `less.variables` and writes to `dist/less` by
  default.
- `createIosSwiftUiFormatterPreset(options)` — Registers the SwiftUI formatter suite (`colors`,
  `dimensions`, `typography`, `gradients`, `shadows`) targeting `dist/ios`.
- `createAndroidMaterialFormatterPreset(options)` — Registers the Android Material formatter suite
  (`colors`, `dimensions`, `typography`, `gradients`, `shadows`) targeting `dist/android`.
- `createAndroidComposeFormatterPreset(options)` — Registers the Jetpack Compose formatter suite
  (`colors`, `typography`, `shapes`) targeting `dist/android/compose`.
- `createFormatterPreset(options)` — Concatenates the outputs from the other helpers.

All formatters rely on the canonical pointer decoding utilities from `@lapidist/dtif-parser`,
ensuring consistent naming across platforms.

## Customising formatter entries

Each helper accepts the following options:

- `baseDirectory` – Overrides the default output directory for every formatter in the preset.
- Per-formatter overrides (`snapshot`, `variables`, `colors`, `dimensions`, `typography`,
  `gradients`, `shadows`) let you adjust:
  - `id` – Custom formatter identifier for referencing written artifacts.
  - `options` – Arbitrary option bags forwarded to the formatter factory.
  - `output.directory` – Directory override for individual formatter outputs.

Set an override to `undefined` to keep the defaults or supply a partial configuration. Use the
aggregated `createFormatterPreset` helper when you need to register multiple platform suites at
once.

## Usage example

```ts
import { createFormatterPreset, type FormatterInstanceConfig } from '@dtifx/build';

const formatterEntries: readonly FormatterInstanceConfig[] = createFormatterPreset({
  json: { baseDirectory: 'dist/snapshots' },
  css: { baseDirectory: 'dist/web/css' },
  sass: { baseDirectory: 'dist/web/scss' },
  less: { baseDirectory: 'dist/web/less' },
  iosSwiftUi: {
    baseDirectory: 'dist/apple',
    typography: { id: 'swiftTypography' },
  },
  androidMaterial: {
    baseDirectory: 'dist/android',
    colors: { output: { directory: 'dist/android/xml' } },
  },
  androidCompose: {
    baseDirectory: 'dist/android/compose',
    typography: { options: { objectName: 'TextStyles' } },
  },
});
```

Spread the resulting array into your build configuration’s `formatters` section or merge it with
other registrations as needed.

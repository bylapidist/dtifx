---
title: Platform build presets
description: Compose transform and formatter presets for CSS, SwiftUI, and Android pipelines.
outline: deep
---

# Platform build presets

`@dtifx/build` ships curated preset helpers that wire platform-specific transform and formatter
registries into a build configuration. Presets remove the need to manually list every transform or
formatter entry when you want to generate CSS custom properties, SwiftUI assets, Android Material
resources, or Jetpack Compose Kotlin artifacts.

The helpers return partial `BuildConfig` fragments so they can be merged into existing configuration
modules. Each preset exposes options that let you override output directories, rename formatter
identifiers, change transform groups, or disable individual entries entirely.

## Quick start

Create your configuration file and spread the preset output alongside your own layer and source
settings:

```ts
import { createCssBuildPreset, placeholder, pointerTemplate, type BuildConfig } from '@dtifx/build';

const cssPreset = createCssBuildPreset();

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
  ...cssPreset,
};
```

The CSS preset injects the default transform bundle (`color.toCss`, `dimension.toRem`,
`dimension.toPx`, `gradient.toCss`, `border.toCss`, `shadow.toCss`, `typography.toCss`) and the
`css.variables` formatter configured to write under `dist/css`. Use `createSassFormatterPreset` or
`createLessFormatterPreset` when you also need `$`/`@` variable outputs for Sass or Less builds.

## Combining platforms

Use `createBuildPreset` to compose multiple platform presets into the same configuration. Each
platform can be toggled individually, and you can still override options for specific bundles:

```ts
import { createBuildPreset, pointerTemplate, placeholder, type BuildConfig } from '@dtifx/build';

const preset = createBuildPreset({
  css: { formatters: { baseDirectory: 'dist/web' } },
  iosSwiftUi: {
    formatters: {
      baseDirectory: 'dist/apple',
      typography: { id: 'swiftTypography' },
    },
  },
  androidMaterial: {
    transforms: {
      baseGroup: 'android',
      dimensionToAndroidDp: { options: { minimumFractionDigits: 2 } },
    },
    formatters: {
      baseDirectory: 'dist/android/material',
      colors: { output: { directory: 'dist/android/xml' } },
    },
  },
  androidCompose: {
    formatters: {
      baseDirectory: 'dist/android/compose',
      colors: { options: { objectName: 'BrandColors' } },
    },
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
  ...preset,
};
```

The combined preset spreads transform entries and formatter instances into the configuration. If a
platform is omitted or set to `false`, its entries are skipped entirely.

## Customising transform entries

Each transform preset exposes overrides for the default group or individual entries. For example,
renaming the SwiftUI transform group or disabling a specific transform looks like this:

```ts
import { createIosSwiftUiBuildPreset } from '@dtifx/build';

const iosPreset = createIosSwiftUiBuildPreset({
  transforms: {
    baseGroup: 'swiftui',
    gradientToSwiftUi: false,
  },
});
```

The preset emits the remaining SwiftUI transforms (`color.toSwiftUIColor`,
`dimension.toSwiftUiPoints`, `shadow.toSwiftUI`, `typography.toSwiftUI`) bound to the custom group.
Setting a transform override to `false` removes it from the output, letting you selectively opt out
of bundle entries while still inheriting the rest.

## Jetpack Compose preset

The Compose preset mirrors the Material helpers but targets Kotlin `Color`, `TextStyle`, and
`RoundedCornerShape` outputs. The transform bundle registers `color.toAndroidComposeColor`,
`typography.toAndroidCompose`, and `border.toAndroidComposeShape` under the `android/compose` group,
and the formatter preset writes Kotlin files to `dist/android/compose` by default. Override the
package name, object identifiers, or target directory when you need the generated files to align
with your application structure.

## Customising formatter instances

Formatter presets follow a similar pattern. You can change formatter identifiers, tweak option bags,
and point individual formatters at alternative directories without rewriting the registration logic:

```ts
import { createAndroidMaterialBuildPreset } from '@dtifx/build';

const androidPreset = createAndroidMaterialBuildPreset({
  formatters: {
    baseDirectory: 'dist/mobile/android',
    colors: {
      id: 'materialColors',
      output: { directory: 'dist/mobile/android/xml' },
    },
    typography: {
      options: { packageName: 'com.example.tokens', visibility: 'internal' },
    },
  },
});
```

All formatter presets honour the canonical pointer decoding logic provided by
`@lapidist/dtif-parser`, so customisations never have to reimplement JSON pointer parsing.

## Disabling parts of a preset

Pass `false` to the `transforms` or `formatters` options when you want to keep only half of a
preset. This is useful when another preset already registers compatible transforms or when a
platform reuses a shared formatter:

```ts
const cssPreset = createCssBuildPreset({ formatters: false });
```

The example retains the CSS transforms but skips the built-in formatter registrations. Combine this
with the aggregated `createBuildPreset` helper to mix and match platform coverage across your build
configuration.

## Next steps

- Review the [`createFormatterPreset`](../config/formatter-presets) and
  [`createTransformPreset`](../config/transform-presets) references for lower-level preset options.
- Explore the individual formatter documentation to understand generated Swift and Android output
  structures.
- Integrate presets into CLI workflows via `dtifx build generate` or your own runtime host.

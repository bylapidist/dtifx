---
title: Transform presets
description: Configure the transform preset helpers exported by @dtifx/build.
outline: deep
---

# Transform presets

Transform presets expose the standard transform bundles shipped with `@dtifx/build`. They return
arrays of `TransformConfigEntry` objects that can be assigned to the `transforms.entries` section of
a build configuration.

## Available helpers

- `createCssTransformPreset(options)` — Registers the CSS transform bundle (`color.toCss`,
  `dimension.toRem`, `dimension.toPx`, `gradient.toCss`, `border.toCss`, `shadow.toCss`,
  `typography.toCss`) under the `web.base` group.
- `createIosSwiftUiTransformPreset(options)` — Registers the SwiftUI transform bundle
  (`color.toSwiftUIColor`, `dimension.toSwiftUiPoints`, `gradient.toSwiftUI`, `shadow.toSwiftUI`,
  `typography.toSwiftUI`) under the `ios.swiftui` group.
- `createAndroidMaterialTransformPreset(options)` — Registers the Android transform bundle
  (`color.toAndroidArgb`, `dimension.toAndroidDp`, `dimension.toAndroidSp`,
  `gradient.toAndroidMaterial`, `shadow.toAndroidMaterial`, `typography.toAndroidMaterial`) under
  the `android.material` group.
- `createAndroidComposeTransformPreset(options)` — Registers the Jetpack Compose transform bundle
  (`color.toAndroidComposeColor`, `border.toAndroidComposeShape`, `typography.toAndroidCompose`)
  under the `android.compose` group.
- `createTransformPreset(options)` — Concatenates the outputs from the other helpers.

Each preset emits entries that correspond to the factories registered in the default transform
registry, so the build pipeline resolves them without extra setup.

## Customising transform entries

Options supported by the helpers include:

- `baseGroup` – Overrides the default transform group assigned to every entry in the preset.
- Per-transform overrides (`colorToCss`, `gradientToSwiftUi`, `typographyToAndroidMaterial`, and so
  on) let you change:
  - `group` – Set a per-transform group value.
  - `options` – Supply transform-specific options (for example `minimumFractionDigits`).

Supply `false` instead of an override object to remove a specific transform from the preset. This is
useful when you want to replace one transform with a custom plugin while keeping the rest of the
bundle intact.

## Usage example

```ts
import { createTransformPreset, type TransformConfigEntry } from '@dtifx/build';

const transformEntries: readonly TransformConfigEntry[] = createTransformPreset({
  css: { baseGroup: 'web.design-system' },
  iosSwiftUi: {
    gradientToSwiftUi: { group: 'ios.gradients' },
  },
  androidMaterial: {
    dimensionToAndroidDp: { options: { minimumFractionDigits: 2 } },
  },
  androidCompose: {
    baseGroup: 'android.composeTokens',
  },
});
```

Use the resulting array as your `transforms.entries` value or merge it with additional custom
transform registrations.

---
title: Prefab library
description:
  Compose high-level token prefabs for fonts, panels, responsive imagery, and media queries.
outline: deep
---

# Prefab library

`@dtifx/core` exposes a fluent prefab layer for quickly assembling rich token graphs without hand
crafting JSON payloads. Each prefab wraps the low-level `TokenPrefab` base class, normalises input,
provides mutation helpers, and emits a snapshot-ready token value.

## Font prefabs

Use the `FontTokenPrefab` builder to define font families with fallbacks, feature settings, and
metric metadata:

```ts
import { FontTokenPrefab } from '@dtifx/core/prefabs';

const heading = FontTokenPrefab.fromFamily(['fonts', 'heading'], 'Inter')
  .addFallbacks('system-ui', 'Segoe UI')
  .withWeight(600)
  .withMetrics({ ascent: 0.92, descent: -0.24 })
  .setFeature('liga', 1);
```

The prefab trims and deduplicates fallbacks, rejects empty feature names, and preserves optional
fields only when values are supplied. Use `withWeight(undefined)` or `setFeature(name, undefined)`
to clear previously assigned metadata.

## Image prefabs

Image prefabs model responsive asset metadata. The `responsive` helper builds pixel-ratio aware
source sets using a predictable naming convention:

```ts
import { ImageTokenPrefab } from '@dtifx/core/prefabs';

const hero = ImageTokenPrefab.responsive(['media', 'hero'], 'hero.png', {
  alt: 'Product hero illustration',
  pixelRatios: [1, 2, 3],
});
```

Additional sources can be appended with `addSources`, and metadata such as `alt` text or
placeholders can be cleared by passing `undefined`. Use `assertValidPixelRatio` when validating
user-supplied configurations before handing them to the prefab layer.

## Panel prefabs

Panel prefabs capture layered surfaces that combine fills, shadows, padding, and radius metadata.
All spacing helpers accept single values, CSS-like tuples, or explicit side objects. Invalid layer
kinds, negative spacing, and empty token references are rejected during normalisation.

```ts
import { PanelTokenPrefab } from '@dtifx/core/prefabs';

const card = PanelTokenPrefab.create(['components', 'card'], {
  panelType: 'surface',
  layers: [
    { kind: 'fill', token: 'color.surface' },
    { kind: 'shadow', token: 'shadow.raised', opacity: 0.4 },
  ],
})
  .withPadding([16, 24])
  .withRadius(12);
```

## Media query prefabs

Media query prefabs provide a structural way to construct common responsive breakpoints without
interpolating strings. Pass constraint objects and the prefab will generate a canonical media query
string:

```ts
import { MediaQueryTokenPrefab } from '@dtifx/core/prefabs';

const tablet = MediaQueryTokenPrefab.forWidthRange(['queries', 'tablet'], {
  mediaType: 'screen',
  min: 768,
  max: 1024,
});
```

Call `addConstraint` or `withConstraints` to extend the query, or `withWidthRange` to replace
existing width rules. Use `isValidMediaFeatureName` to preflight media features submitted by users.

## Serialisation

Each prefab exposes `toJSON()` and `toSnapshot()` from the `TokenPrefab` base class. When composed
with other prefabs they produce ready-to-serialise token graphs with consistent metadata handling.

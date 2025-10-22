---
title: Semantic token prefabs
description:
  'Typed builders for constructing semantic colour, gradient, typography, and shadow tokens that map
  directly to DTIF snapshots.'
---

# Semantic token prefabs

The prefabs shipped with `@dtifx/core` let you author semantic tokens in code without hand-writing
DTIF payloads. They mirror the DTIF schema, apply opinionated sanitisation, and expose helper math
so you can create rich token sets that still serialise back to `TokenSnapshot` data.

Every prefab inherits the base [`TokenPrefab`](./index.md#resources) utilities, so you can attach
descriptions, tags, and other metadata before producing JSON entries or `TokenSnapshot` instances.

## Colour tokens

Use the `Color` prefab to produce colour tokens with SRGB-aware helpers:

```ts
import { Color } from '@dtifx/core';

const brandAccent = Color.fromHex(['palette', 'brand', 'accent'], '#336699')
  .lighten(0.1)
  .withAlpha(0.85)
  .withDescription('Accessible brand accent');

const snapshot = brandAccent.toSnapshot();
// snapshot.value.colorSpace === 'srgb'
// snapshot.value.hex === '#4080BFD9'
```

Lightening and darkening use HSL lightness so gradients and overlays behave predictably. You can
also construct colours from SRGB components or reuse existing `ColorTokenPrefab` instances when
composing gradients.

## Gradient tokens

The `Gradient` prefab normalises stop positions, trims metadata, and applies colour adjustments
across every stop:

```ts
import { Gradient } from '@dtifx/core';

const heroBackground = Gradient.linear(
  ['gradients', 'hero', 'background'],
  [
    { position: 0, color: '#0B1E3F' },
    { position: 1, color: '#25457A' },
  ],
  { angle: ' 45deg ', shape: ' ELLIPSE ' },
)
  .lighten(0.08)
  .withAngle('to bottom right');

const json = heroBackground.toJSON();
// json.$value.stops[0].color.hex === '#173663'
```

Gradient prefabs require at least two stops and automatically clamp numeric stop positions to the
0–1 range. Lighten and darken propagate to every stop so you can derive themed gradients without
repeating colour maths.

## Typography tokens

`Typography.create` captures typography primitives such as font family, size, line height, spacing,
and weight. Inputs are sanitised—units are lower-cased, negative ratios clamp to zero, and optional
fields can be removed by passing `undefined`:

```ts
import { Typography } from '@dtifx/core';

const bodyCopy = Typography.create(['typography', 'body'], {
  typographyType: 'Body',
  fontFamily: 'Inter',
  fontSize: [16, 'PX'],
  lineHeight: 1.45,
  letterSpacing: { value: 0.02, unit: 'em' },
  fontWeight: 'SemiBold',
});

const relaxed = bodyCopy.withLineHeight(1.6).withTypographyType('body-large');
```

The resulting snapshots match DTIF expectations for typography tokens, making it easy to serialise
prefab output alongside parsed DTIF documents.

## Shadow tokens

Shadow prefabs accept one or more layers and provide colour adjustments for elevation stacks:

```ts
import { Shadow } from '@dtifx/core';

const cardShadow = Shadow.create(
  ['shadow', 'card'],
  [
    {
      shadowType: 'css.box-shadow',
      offsetX: [0, 'px'],
      offsetY: [2, 'px'],
      blur: [4, 'px'],
      color: '#000000',
    },
  ],
).lighten(0.35);
```

Layer dimensions are trimmed and lower-cased, and shadow colours respond to the same lightness
helpers as standalone colour tokens.

## Producing DTIF entries

Prefab instances expose both `toJSON()`—returning `{ $type, $value }` token definitions—and
`toSnapshot()`—producing rich `TokenSnapshot` structures with inline source metadata. This lets you
hydrate semantic tokens alongside parsed DTIF documents or serialise them straight to disk without
worrying about schema compliance.

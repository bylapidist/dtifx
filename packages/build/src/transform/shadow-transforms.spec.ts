import type { TokenSnapshot } from '../session/resolution-session.js';
import { describe, expect, it } from 'vitest';

import {
  shadowToAndroidMaterialTransform,
  shadowToCssTransform,
  shadowToSwiftUiTransform,
} from './shadow-transforms.js';

function createSnapshot(pointer: string, value: unknown, resolved?: unknown): TokenSnapshot {
  const snapshot: Record<string, unknown> = { pointer, value };
  if (resolved !== undefined) {
    snapshot.resolution = { value: resolved };
  }
  return snapshot as TokenSnapshot;
}

function createSrgbColor(hex: string) {
  const normalised = hex.replace(/^#/, '').toLowerCase();
  const red = Number.parseInt(normalised.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalised.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalised.slice(4, 6), 16) / 255;
  return {
    colorSpace: 'srgb',
    components: [red, green, blue] as const,
  };
}

function createColorReference(hex: string, ref?: string) {
  const base = { $value: createSrgbColor(hex) };
  if (ref) {
    return { ...base, $ref: ref };
  }
  return base;
}

describe('shadowToSwiftUiTransform', () => {
  it('serialises single-layer shadow tokens into SwiftUI metadata', () => {
    const value = {
      color: createColorReference('#000000'),
      offsetX: 4,
      offsetY: -8,
      blur: 12,
      spread: 1,
      opacity: 0.5,
    } satisfies Parameters<typeof shadowToSwiftUiTransform.run>[0]['value'];
    const snapshot = createSnapshot('/shadow/card/default', value, value);
    const result = shadowToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toStrictEqual({
      layers: [
        {
          color: '#000000',
          x: 4,
          y: -8,
          radius: 12,
          spread: 1,
          opacity: 0.5,
        },
      ],
    });
  });

  it('normalises layered shadow tokens and inherits fallback metadata', () => {
    const value = {
      color: { $ref: '#/shadow/panel/elevated/color' },
      offsetX: '1.5rem',
      offsetY: '2px',
      blur: '10pt',
      opacity: '0.8',
      layers: [
        {
          color: createColorReference('#abcdef'),
          offsetX: '0',
          offsetY: ' 6 ',
          blur: '4px',
          spread: '0.5rem',
          opacity: '0.25',
        },
        {
          spread: 3,
        },
      ],
    } satisfies Parameters<typeof shadowToSwiftUiTransform.run>[0]['value'];
    const resolved = {
      color: createSrgbColor('#123456'),
      offsetX: '1.5rem',
      offsetY: '2px',
      blur: '10pt',
      opacity: '0.8',
      layers: value.layers,
    };
    const snapshot = createSnapshot('/shadow/panel/elevated', value, resolved);
    const result = shadowToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toStrictEqual({
      layers: [
        {
          color: '#abcdef',
          x: 0,
          y: 6,
          radius: 4,
          spread: 8,
          opacity: 0.25,
        },
        {
          color: '#123456',
          x: 24,
          y: 2,
          radius: 10,
          spread: 3,
          opacity: 0.8,
        },
      ],
    });
  });

  it('omits shadow tokens that do not expose any layers with colours', () => {
    const value = {
      offsetX: 'var(--offset)',
      opacity: 'invalid',
    } satisfies Parameters<typeof shadowToSwiftUiTransform.run>[0]['value'];
    const snapshot = createSnapshot('/shadow/card/empty', value);
    const result = shadowToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toBeUndefined();
  });

  it('resolves DTIF dimension references when normalising layers', () => {
    const value = {
      color: createColorReference('#112233'),
      offsetX: { dimensionType: 'length', unit: 'pixel', value: 2 },
      offsetY: {
        $ref: { pointer: '#/alias/spacing/small', uri: 'file://foundation.json' },
        $value: { dimensionType: 'length', unit: 'rem', value: 0.25 },
      },
      blur: { unit: 'rem', value: 1.5, dimensionType: 'length' },
      spread: { unit: 'pt', value: 2, dimensionType: 'length' },
      layers: [
        {
          color: createColorReference('#abcdef'),
          offsetX: { unit: 'px', value: 3, dimensionType: 'length' },
          offsetY: { dimensionType: 'length', unit: 'rem', value: 0.5 },
          blur: { unit: 'pixel', value: 6, dimensionType: 'length' },
          spread: {
            $ref: { pointer: '#/alias/spacing/tight', uri: 'file://foundation.json' },
            $value: { dimensionType: 'length', unit: 'rem', value: 0.125 },
          },
          opacity: 0.75,
        },
        {
          color: ' #fedcba ',
          offsetX: {
            $ref: { pointer: '#/alias/spacing/point', uri: 'file://foundation.json' },
            $value: { dimensionType: 'length', unit: 'point', value: 1 },
          },
          opacity: '0.3',
        },
      ],
    } satisfies Parameters<typeof shadowToSwiftUiTransform.run>[0]['value'];
    const resolved = {
      color: createSrgbColor('#112233'),
      offsetX: value.offsetX,
      offsetY: value.offsetY,
      blur: value.blur,
      spread: value.spread,
      layers: [
        {
          color: createSrgbColor('#abcdef'),
          offsetX: { unit: 'px', value: 3, dimensionType: 'length' },
          offsetY: { dimensionType: 'length', unit: 'rem', value: 0.5 },
          blur: { unit: 'pixel', value: 6, dimensionType: 'length' },
          spread: value.layers[0]!.spread,
          opacity: 0.75,
        },
        {
          color: createSrgbColor('#fedcba'),
          offsetX: value.layers[1]!.offsetX,
          opacity: '0.3',
        },
      ],
    };
    const snapshot = createSnapshot('/shadow/card/dimensions', value, resolved);

    const result = shadowToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toStrictEqual({
      layers: [
        {
          color: '#abcdef',
          x: 3,
          y: 8,
          radius: 6,
          spread: 2,
          opacity: 0.75,
        },
        {
          color: '#fedcba',
          x: 1,
          y: 4,
          radius: 24,
          spread: 2,
          opacity: 0.3,
        },
      ],
    });
  });
});

describe('shadowToAndroidMaterialTransform', () => {
  it('serialises single-layer shadow tokens into Android metadata', () => {
    const value = {
      color: createColorReference('#000000'),
      offsetX: 4,
      offsetY: -8,
      blur: 12,
      spread: 1,
      opacity: 0.5,
    } satisfies Parameters<typeof shadowToAndroidMaterialTransform.run>[0]['value'];
    const snapshot = createSnapshot('/shadow/card/default', value, value);
    const result = shadowToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toStrictEqual({
      layers: [
        {
          color: '#000000',
          x: 4,
          y: -8,
          radius: 12,
          spread: 1,
          opacity: 0.5,
        },
      ],
    });
  });

  it('normalises layered shadow tokens and inherits fallback metadata', () => {
    const value = {
      color: { $ref: '#/shadow/panel/elevated/color' },
      offsetX: '1.5rem',
      offsetY: '2px',
      blur: '10pt',
      opacity: '0.8',
      layers: [
        {
          color: createColorReference('#abcdef'),
          offsetX: '0',
          offsetY: ' 6 ',
          blur: '4px',
          spread: '0.5rem',
          opacity: '0.25',
        },
        {
          spread: 3,
        },
      ],
    } satisfies Parameters<typeof shadowToAndroidMaterialTransform.run>[0]['value'];
    const resolved = {
      color: createSrgbColor('#123456'),
      offsetX: '1.5rem',
      offsetY: '2px',
      blur: '10pt',
      opacity: '0.8',
      layers: value.layers,
    };
    const snapshot = createSnapshot('/shadow/panel/elevated', value, resolved);
    const result = shadowToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toStrictEqual({
      layers: [
        {
          color: '#abcdef',
          x: 0,
          y: 6,
          radius: 4,
          spread: 8,
          opacity: 0.25,
        },
        {
          color: '#123456',
          x: 24,
          y: 2,
          radius: 10,
          spread: 3,
          opacity: 0.8,
        },
      ],
    });
  });

  it('omits shadow tokens that do not expose any layers with colours', () => {
    const value = {
      offsetX: 'var(--offset)',
      opacity: 'invalid',
    } satisfies Parameters<typeof shadowToAndroidMaterialTransform.run>[0]['value'];
    const snapshot = createSnapshot('/shadow/card/empty', value);
    const result = shadowToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toBeUndefined();
  });

  it('resolves DTIF dimension references when normalising layers', () => {
    const value = {
      color: createColorReference('#112233'),
      offsetX: { dimensionType: 'length', unit: 'pixel', value: 2 },
      offsetY: {
        $ref: { pointer: '#/alias/spacing/small', uri: 'file://foundation.json' },
        $value: { dimensionType: 'length', unit: 'rem', value: 0.25 },
      },
      blur: { unit: 'rem', value: 1.5, dimensionType: 'length' },
      spread: { unit: 'pt', value: 2, dimensionType: 'length' },
      layers: [
        {
          color: createColorReference('#abcdef'),
          offsetX: { unit: 'px', value: 3, dimensionType: 'length' },
          offsetY: { dimensionType: 'length', unit: 'rem', value: 0.5 },
          blur: { unit: 'pixel', value: 6, dimensionType: 'length' },
          spread: {
            $ref: { pointer: '#/alias/spacing/tight', uri: 'file://foundation.json' },
            $value: { dimensionType: 'length', unit: 'rem', value: 0.125 },
          },
          opacity: 0.75,
        },
        {
          color: ' #fedcba ',
          offsetX: {
            $ref: { pointer: '#/alias/spacing/point', uri: 'file://foundation.json' },
            $value: { dimensionType: 'length', unit: 'point', value: 1 },
          },
          opacity: '0.3',
        },
      ],
    } satisfies Parameters<typeof shadowToAndroidMaterialTransform.run>[0]['value'];
    const resolved = {
      color: createSrgbColor('#112233'),
      offsetX: value.offsetX,
      offsetY: value.offsetY,
      blur: value.blur,
      spread: value.spread,
      layers: [
        {
          color: createSrgbColor('#abcdef'),
          offsetX: { unit: 'px', value: 3, dimensionType: 'length' },
          offsetY: { dimensionType: 'length', unit: 'rem', value: 0.5 },
          blur: { unit: 'pixel', value: 6, dimensionType: 'length' },
          spread: value.layers[0]!.spread,
          opacity: 0.75,
        },
        {
          color: createSrgbColor('#fedcba'),
          offsetX: value.layers[1]!.offsetX,
          opacity: '0.3',
        },
      ],
    };
    const snapshot = createSnapshot('/shadow/card/dimensions', value, resolved);

    const result = shadowToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toStrictEqual({
      layers: [
        {
          color: '#abcdef',
          x: 3,
          y: 8,
          radius: 6,
          spread: 2,
          opacity: 0.75,
        },
        {
          color: '#fedcba',
          x: 1,
          y: 4,
          radius: 24,
          spread: 2,
          opacity: 0.3,
        },
      ],
    });
  });
});

describe('shadowToCssTransform', () => {
  it('serialises layered shadow tokens into CSS declarations', () => {
    const value = {
      color: { $ref: '#/shadow/panel/elevated/color' },
      offsetX: '1.5rem',
      offsetY: '2px',
      blur: '10pt',
      opacity: '0.8',
      layers: [
        {
          color: createColorReference('#abcdef'),
          offsetX: 0,
          offsetY: 6,
          blur: 4,
          spread: '0.5rem',
          opacity: '0.25',
        },
        {
          spread: 3,
        },
      ],
    } satisfies Parameters<typeof shadowToCssTransform.run>[0]['value'];
    const resolved = {
      color: createSrgbColor('#123456'),
      offsetX: '1.5rem',
      offsetY: '2px',
      blur: '10pt',
      opacity: '0.8',
      layers: value.layers,
    };
    const snapshot = createSnapshot('/shadow/panel/elevated', value, resolved);
    const result = shadowToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toStrictEqual({
      css: [
        '0 6px 4px 8px rgba(171, 205, 239, 0.25)',
        '24px 2px 10px 3px rgba(18, 52, 86, 0.8)',
      ].join(', '),
      layers: [
        '0 6px 4px 8px rgba(171, 205, 239, 0.25)',
        '24px 2px 10px 3px rgba(18, 52, 86, 0.8)',
      ],
    });
  });

  it('omits tokens that do not yield any CSS layers', () => {
    const value = {
      offsetX: 'var(--offset)',
      opacity: 'invalid',
    } satisfies Parameters<typeof shadowToCssTransform.run>[0]['value'];
    const snapshot = createSnapshot('/shadow/card/empty', value);
    const result = shadowToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toBeUndefined();
  });

  it('resolves DTIF dimension references when normalising layers', () => {
    const value = {
      color: createColorReference('#112233'),
      offsetX: { dimensionType: 'length', unit: 'pixel', value: 2 },
      offsetY: {
        $ref: { pointer: '#/alias/spacing/small', uri: 'file://foundation.json' },
        $value: { dimensionType: 'length', unit: 'rem', value: 0.25 },
      },
      blur: { unit: 'rem', value: 1.5, dimensionType: 'length' },
      spread: { unit: 'pt', value: 2, dimensionType: 'length' },
      layers: [
        {
          color: createColorReference('#abcdef'),
          offsetX: { unit: 'px', value: 3, dimensionType: 'length' },
          offsetY: { dimensionType: 'length', unit: 'rem', value: 0.5 },
          blur: { unit: 'pixel', value: 6, dimensionType: 'length' },
          spread: {
            $ref: { pointer: '#/alias/spacing/tight', uri: 'file://foundation.json' },
            $value: { dimensionType: 'length', unit: 'rem', value: 0.125 },
          },
          opacity: 0.75,
        },
        {
          color: ' #fedcba ',
          offsetX: {
            $ref: { pointer: '#/alias/spacing/point', uri: 'file://foundation.json' },
            $value: { dimensionType: 'length', unit: 'point', value: 1 },
          },
          opacity: '0.3',
        },
      ],
    } satisfies Parameters<typeof shadowToCssTransform.run>[0]['value'];
    const resolved = {
      color: createSrgbColor('#112233'),
      offsetX: value.offsetX,
      offsetY: value.offsetY,
      blur: value.blur,
      spread: value.spread,
      layers: [
        {
          color: createSrgbColor('#abcdef'),
          offsetX: { unit: 'px', value: 3, dimensionType: 'length' },
          offsetY: { dimensionType: 'length', unit: 'rem', value: 0.5 },
          blur: { unit: 'pixel', value: 6, dimensionType: 'length' },
          spread: value.layers[0]!.spread,
          opacity: 0.75,
        },
        {
          color: createSrgbColor('#fedcba'),
          offsetX: value.layers[1]!.offsetX,
          opacity: '0.3',
        },
      ],
    };
    const snapshot = createSnapshot('/shadow/card/dimensions', value, resolved);

    const result = shadowToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'shadow',
      value,
    });

    expect(result).toStrictEqual({
      css: [
        '3px 8px 6px 2px rgba(171, 205, 239, 0.75)',
        '1px 4px 24px 2px rgba(254, 220, 186, 0.3)',
      ].join(', '),
      layers: [
        '3px 8px 6px 2px rgba(171, 205, 239, 0.75)',
        '1px 4px 24px 2px rgba(254, 220, 186, 0.3)',
      ],
    });
  });
});

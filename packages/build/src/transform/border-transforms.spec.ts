import type { TokenSnapshot } from '../session/resolution-session.js';
import { describe, expect, it } from 'vitest';

import {
  borderToAndroidComposeShapeTransform,
  borderToCssTransform,
  createAndroidComposeBorderTransforms,
  createCssBorderTransforms,
} from './border-transforms.js';

function createSnapshot(pointer: string, resolved?: unknown, value?: unknown): TokenSnapshot {
  const snapshot: Record<string, unknown> = { pointer };
  if (resolved !== undefined) {
    snapshot.resolution = { value: resolved };
  }
  if (value !== undefined) {
    snapshot.value = value;
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

describe('borderToCssTransform', () => {
  it('serialises border tokens into CSS metadata', () => {
    const value = {
      borderType: 'css.border',
      width: { unit: 'pixel', value: 2, dimensionType: 'length' },
      style: ' solid ',
      color: createColorReference('#123456'),
      radius: {
        topLeft: { x: 4, y: 8 },
        topRight: '2px',
        bottomRight: { x: '1rem', y: '50%' },
        bottomLeft: { x: 0 },
      },
    } satisfies Parameters<typeof borderToCssTransform.run>[0]['value'];
    const snapshot = createSnapshot('/border/control/default', value, value);
    const result = borderToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'border',
      value,
    });

    expect(result).toStrictEqual({
      css: '2px solid #123456',
      width: '2px',
      style: 'solid',
      color: '#123456',
      radius: '4px 2px 1rem 0 / 8px 2px 50% 0',
      radii: {
        topLeft: '4px 8px',
        topRight: '2px',
        bottomRight: '1rem 50%',
        bottomLeft: '0',
      },
    });
  });

  it('omits borders that target unsupported rendering surfaces', () => {
    const snapshot = createSnapshot('/border/control/iosOnly');
    const result = borderToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'border',
      value: {
        borderType: 'ios.layer.border',
        width: { unit: 'pixel', value: 1, dimensionType: 'length' },
        style: 'solid',
        color: '#000000',
      },
    });

    expect(result).toBeUndefined();
  });

  it('omits borders without complete styling metadata', () => {
    const snapshot = createSnapshot('/border/control/incomplete');
    const result = borderToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'border',
      value: {
        borderType: 'css.border',
        width: { unit: 'pixel', value: 1, dimensionType: 'length' },
        color: createColorReference('#000000', '#/color/base'),
      },
    });

    expect(result).toBeUndefined();
  });
});

describe('createCssBorderTransforms', () => {
  it('returns the css border transform collection', () => {
    expect(createCssBorderTransforms()).toStrictEqual([borderToCssTransform]);
  });
});

describe('borderToAndroidComposeShapeTransform', () => {
  it('serialises border radius metadata into Compose corners', () => {
    const snapshot = createSnapshot('/border/compose/rounded');
    const result = borderToAndroidComposeShapeTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'border',
      value: {
        borderType: 'css.border',
        radius: {
          topLeft: { unit: 'pixel', value: 8, dimensionType: 'length' },
          topRight: '8px',
          bottomRight: { x: 8, y: 8 },
          bottomLeft: 8,
        },
      },
    });

    expect(result).toStrictEqual({
      corners: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
    });
  });

  it('omits borders that cannot be converted to Compose shapes', () => {
    const snapshot = createSnapshot('/border/compose/unsupported');
    const result = borderToAndroidComposeShapeTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'border',
      value: {
        borderType: 'css.border',
        radius: { topLeft: '8px 4px' },
      },
    });

    expect(result).toBeUndefined();
  });
});

describe('createAndroidComposeBorderTransforms', () => {
  it('returns the compose border transform collection', () => {
    expect(createAndroidComposeBorderTransforms()).toStrictEqual([
      borderToAndroidComposeShapeTransform,
    ]);
  });
});

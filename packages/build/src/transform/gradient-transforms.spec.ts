import type { TokenSnapshot } from '../session/resolution-session.js';
import { describe, expect, it } from 'vitest';

import {
  gradientToCssTransform,
  gradientToAndroidMaterialTransform,
  gradientToSwiftUiTransform,
} from './gradient-transforms.js';

function createSnapshot(pointer: string, value: unknown, resolved?: unknown): TokenSnapshot {
  return {
    pointer,
    value,
    ...(resolved === undefined ? {} : { resolution: { value: resolved } }),
  } as TokenSnapshot;
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

describe('gradientToCssTransform', () => {
  it('serialises conic gradients into CSS syntax', () => {
    const value = {
      kind: 'conic',
      direction: 'from 135deg at 25% 25%',
      stops: [
        { color: createColorReference('#ff0000'), position: 0 },
        { color: createColorReference('#00ff00'), position: '50%' },
        { color: createColorReference('#0000ff'), position: 100 },
      ],
    } satisfies Parameters<typeof gradientToCssTransform.run>[0]['value'];
    const resolved = {
      kind: 'conic',
      direction: 'from 135deg at 25% 25%',
      stops: [
        { color: createSrgbColor('#ff0000'), position: 0 },
        { color: createSrgbColor('#00ff00'), position: '50%' },
        { color: createSrgbColor('#0000ff'), position: 100 },
      ],
    } satisfies Parameters<typeof gradientToCssTransform.run>[0]['value'];
    const snapshot = createSnapshot('/gradient/background/conic', value, resolved);

    const result = gradientToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'gradient',
      value,
    });

    expect(result).toStrictEqual({
      css: 'conic-gradient(from 135deg at 25% 25%, #ff0000 0%, #00ff00 50%, #0000ff 100%)',
    });
  });
});

describe('gradientToSwiftUiTransform', () => {
  it('serialises gradient tokens into SwiftUI metadata', () => {
    const value = {
      kind: 'linear',
      angle: '45deg',
      stops: [
        { color: createColorReference('#ff0000'), position: 0 },
        { color: { $ref: '#/gradient/background/hero/stops/1/color' }, position: 50 },
        { color: createColorReference('#0000ff'), position: 100 },
      ],
    } satisfies Parameters<typeof gradientToSwiftUiTransform.run>[0]['value'];
    const resolved = {
      kind: 'linear',
      angle: 45,
      stops: [
        { color: createSrgbColor('#ff0000'), position: 0 },
        { color: createSrgbColor('#00ff00'), position: 50 },
        { color: createSrgbColor('#0000ff'), position: 100 },
      ],
    };
    const snapshot = createSnapshot('/gradient/background/hero', value, resolved);
    const result = gradientToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'gradient',
      value,
    });

    expect(result).toStrictEqual({
      kind: 'linear',
      angle: 45,
      stops: [
        { color: '#ff0000', location: 0 },
        { color: '#00ff00', location: 0.5 },
        { color: '#0000ff', location: 1 },
      ],
    });
  });

  it('normalises stop metadata including percentages and easing', () => {
    const value = {
      kind: 'radial',
      stops: [
        { color: 'var(--token)', position: '25%' },
        { color: createColorReference('#ff00ff'), position: '0.75', easing: ' ease-in-out ' },
        { color: createColorReference('#ffffff', '#/gradient/background/overlay/stops/2/color') },
      ],
    } satisfies Parameters<typeof gradientToSwiftUiTransform.run>[0]['value'];
    const resolved = {
      kind: 'radial',
      stops: [
        { color: 'var(--token)', position: '25%' },
        { color: createSrgbColor('#ff00ff'), position: '0.75', easing: ' ease-in-out ' },
        { color: createSrgbColor('#ffffff') },
      ],
    };
    const snapshot = createSnapshot('/gradient/background/overlay', value, resolved);
    const result = gradientToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'gradient',
      value,
    });

    expect(result).toStrictEqual({
      kind: 'radial',
      stops: [
        { color: 'var(--token)', location: 0.25 },
        { color: '#ff00ff', location: 0.75, easing: 'ease-in-out' },
        { color: '#ffffff' },
      ],
    });
  });

  it('omits gradients that do not contain valid stops', () => {
    const snapshot = createSnapshot('/gradient/background/empty', {
      kind: 'linear',
      stops: [{ color: '   ' }],
    });
    const result = gradientToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'gradient',
      value: {
        kind: 'linear',
        stops: [{ color: '   ' }],
      },
    });

    expect(result).toBeUndefined();
  });

  it('throws when encountering unsupported conic gradients', () => {
    const value = {
      kind: 'conic',
      stops: [
        { color: createColorReference('#ff0000'), position: 0 },
        { color: createColorReference('#0000ff'), position: 1 },
      ],
    } satisfies Parameters<typeof gradientToSwiftUiTransform.run>[0]['value'];
    const resolved = {
      kind: 'conic',
      stops: [
        { color: createSrgbColor('#ff0000'), position: 0 },
        { color: createSrgbColor('#0000ff'), position: 1 },
      ],
    } satisfies Parameters<typeof gradientToSwiftUiTransform.run>[0]['value'];
    const snapshot = createSnapshot('/gradient/background/conic', value, resolved);

    expect(() =>
      gradientToSwiftUiTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'gradient',
        value,
      }),
    ).toThrowError(/gradient\.toSwiftUI supports linear and radial gradients/);
  });
});

describe('gradientToAndroidMaterialTransform', () => {
  it('serialises gradient tokens into Android Material metadata', () => {
    const value = {
      kind: 'linear',
      angle: 270,
      stops: [
        { color: createColorReference('#ff0000'), position: 0 },
        { color: { $ref: '#/gradient/background/hero/stops/1/color' }, position: '50%' },
        { color: createColorReference('#0000ff'), position: 1 },
      ],
    } satisfies Parameters<typeof gradientToAndroidMaterialTransform.run>[0]['value'];
    const resolved = {
      kind: 'linear',
      angle: 270,
      stops: [
        { color: createSrgbColor('#ff0000'), position: 0 },
        { color: createSrgbColor('#00ff00'), position: '50%' },
        { color: createSrgbColor('#0000ff'), position: 1 },
      ],
    };
    const snapshot = createSnapshot('/gradient/background/hero', value, resolved);
    const result = gradientToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'gradient',
      value,
    });

    expect(result).toStrictEqual({
      kind: 'linear',
      angle: 270,
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#00ff00', position: 0.5 },
        { color: '#0000ff', position: 1 },
      ],
    });
  });

  it('normalises stop metadata including easing', () => {
    const value = {
      kind: 'radial',
      stops: [
        { color: createColorReference('#ffffff'), position: '25%' },
        { color: 'var(--token)', easing: ' ease-in-out ' },
      ],
    } satisfies Parameters<typeof gradientToAndroidMaterialTransform.run>[0]['value'];
    const resolved = {
      kind: 'radial',
      stops: [
        { color: createSrgbColor('#ffffff'), position: '25%' },
        { color: 'var(--token)', easing: ' ease-in-out ' },
      ],
    };
    const snapshot = createSnapshot('/gradient/background/overlay', value, resolved);
    const result = gradientToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'gradient',
      value,
    });

    expect(result).toStrictEqual({
      kind: 'radial',
      stops: [
        { color: '#ffffff', position: 0.25 },
        { color: 'var(--token)', easing: 'ease-in-out' },
      ],
    });
  });

  it('omits gradients that do not contain valid stops', () => {
    const snapshot = createSnapshot('/gradient/background/invalid', {
      kind: 'linear',
      stops: [{ color: '   ' }],
    });
    const result = gradientToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'gradient',
      value: {
        kind: 'linear',
        stops: [{ color: '   ' }],
      },
    });

    expect(result).toBeUndefined();
  });

  it('throws when encountering unsupported conic gradients', () => {
    const value = {
      kind: 'conic',
      stops: [
        { color: createColorReference('#ff0000'), position: '25%' },
        { color: createColorReference('#0000ff'), position: 0.75 },
      ],
    } satisfies Parameters<typeof gradientToAndroidMaterialTransform.run>[0]['value'];
    const resolved = {
      kind: 'conic',
      stops: [
        { color: createSrgbColor('#ff0000'), position: '25%' },
        { color: createSrgbColor('#0000ff'), position: 0.75 },
      ],
    } satisfies Parameters<typeof gradientToAndroidMaterialTransform.run>[0]['value'];
    const snapshot = createSnapshot('/gradient/background/conic', value, resolved);

    expect(() =>
      gradientToAndroidMaterialTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'gradient',
        value,
      }),
    ).toThrowError(/gradient\.toAndroidMaterial supports linear and radial gradients/);
  });
});

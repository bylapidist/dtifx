import type { TokenSnapshot } from '../session/resolution-session.js';
import { describe, expect, it } from 'vitest';

import {
  colorToAndroidArgbTransform,
  colorToAndroidComposeColorTransform,
  colorToCssTransform,
  colorToSwiftUIColorTransform,
} from './color-transforms.js';

function createSnapshot(pointer: string): TokenSnapshot {
  return { pointer } as unknown as TokenSnapshot;
}

describe('colorToCssTransform', () => {
  it('normalises sRGB inputs into CSS metadata', () => {
    const snapshot = createSnapshot('/color/web/primary');
    const result = colorToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'srgb',
        components: [0.25, 0.5, 0.75, 0.8],
      },
    });

    expect(result).toStrictEqual({
      srgbHex: '#4080bfcc',
      oklch: {
        l: Number.parseFloat('0.58555'),
        c: Number.parseFloat('0.118266'),
        h: Number.parseFloat('250.532374'),
        css: 'oklch(0.5856 0.1183 250.5324 / 0.8000)',
      },
      relativeLuminance: Number.parseFloat('0.201625'),
    });
  });

  it('converts OKLCH inputs before emitting metadata', () => {
    const snapshot = createSnapshot('/color/web/accent');
    const result = colorToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'oklch',
        components: [0.6, 0.1, 120],
        alpha: 0.75,
      },
    });

    expect(result).toStrictEqual({
      srgbHex: '#798940bf',
      oklch: {
        l: Number.parseFloat('0.6'),
        c: Number.parseFloat('0.1'),
        h: Number.parseFloat('119.99996'),
        css: 'oklch(0.6000 0.1000 120.0000 / 0.7500)',
      },
      relativeLuminance: Number.parseFloat('0.222664'),
    });
  });
});

describe('colorToSwiftUIColorTransform', () => {
  it('serialises sRGB colors into SwiftUI components', () => {
    const snapshot = createSnapshot('/color/brand/primary');
    const result = colorToSwiftUIColorTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'srgb',
        components: [0.25, 0.5, 0.75],
      },
    });

    expect(result).toStrictEqual({
      red: 0.25,
      green: 0.5,
      blue: 0.75,
      opacity: 1,
      hex: '#4080bf',
    });
  });

  it('includes explicit alpha components when provided', () => {
    const snapshot = createSnapshot('/color/brand/secondary');
    const result = colorToSwiftUIColorTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'srgb',
        components: [1, 0.6, 0.2],
        alpha: 0.5,
      },
    });

    expect(result).toStrictEqual({
      red: 1,
      green: 0.6,
      blue: 0.2,
      opacity: 0.5,
      hex: '#ff993380',
    });
  });

  it('normalises NaN and out-of-range components', () => {
    const snapshot = createSnapshot('/color/system/invalid');
    const result = colorToSwiftUIColorTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'srgb',
        components: [Number.NaN, 2, -1, 5],
      },
    });

    expect(result).toStrictEqual({
      red: 0,
      green: 1,
      blue: 0,
      opacity: 1,
      hex: '#00ff00ff',
    });
  });

  it('rejects unsupported color spaces', () => {
    const snapshot = createSnapshot('/color/brand/primary');

    expect(() =>
      colorToSwiftUIColorTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'color',
        value: {
          colorSpace: 'displayP3',
          components: [0.1, 0.2, 0.3],
        },
      }),
    ).toThrow(
      'color transforms support srgb, oklab, and oklch colorSpace values. Received displayP3.',
    );
  });

  it('converts OKLCH colors before serialising SwiftUI payloads', () => {
    const snapshot = createSnapshot('/color/brand/oklch');
    const result = colorToSwiftUIColorTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'oklch',
        components: [0.6, 0.1, 120],
        alpha: 0.75,
      },
    });

    expect(result).toStrictEqual({
      red: Number.parseFloat('0.472735'),
      green: Number.parseFloat('0.536854'),
      blue: Number.parseFloat('0.251555'),
      opacity: 0.75,
      hex: '#798940bf',
    });
  });

  it('converts OKLAB colors before serialising SwiftUI payloads', () => {
    const snapshot = createSnapshot('/color/brand/oklab');
    const result = colorToSwiftUIColorTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'oklab',
        components: [0.6, 0.1, -0.05],
      },
    });

    expect(result).toStrictEqual({
      red: Number.parseFloat('0.657919'),
      green: Number.parseFloat('0.398173'),
      blue: Number.parseFloat('0.612873'),
      opacity: 1,
      hex: '#a8669c',
    });
  });
});

describe('colorToAndroidArgbTransform', () => {
  it('serialises sRGB colors into ARGB byte components', () => {
    const snapshot = createSnapshot('/color/brand/android');
    const result = colorToAndroidArgbTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'srgb',
        components: [0.2, 0.4, 0.6],
      },
    });

    expect(result).toStrictEqual({
      alpha: 255,
      red: 51,
      green: 102,
      blue: 153,
      argbHex: '#ff336699',
    });
  });

  it('normalises invalid components before converting to bytes', () => {
    const snapshot = createSnapshot('/color/system/android');
    const result = colorToAndroidArgbTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'srgb',
        components: [Number.NaN, 2, -0.5, 1.5],
      },
    });

    expect(result).toStrictEqual({
      alpha: 255,
      red: 0,
      green: 255,
      blue: 0,
      argbHex: '#ff00ff00',
    });
  });

  it('includes explicit alpha channel when provided', () => {
    const snapshot = createSnapshot('/color/brand/android/alpha');
    const result = colorToAndroidArgbTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'srgb',
        components: [1, 0.5, 0],
        alpha: 0.5,
      },
    });

    expect(result).toStrictEqual({
      alpha: 128,
      red: 255,
      green: 128,
      blue: 0,
      argbHex: '#80ff8000',
    });
  });

  it('serialises OKLCH colors into ARGB components', () => {
    const snapshot = createSnapshot('/color/android/oklch');
    const result = colorToAndroidArgbTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'oklch',
        components: [0.6, 0.1, 120],
        alpha: 0.75,
      },
    });

    expect(result).toStrictEqual({
      alpha: 191,
      red: 121,
      green: 137,
      blue: 64,
      argbHex: '#bf798940',
    });
  });
});

describe('colorToAndroidComposeColorTransform', () => {
  it('serialises sRGB colors into Compose hex literals', () => {
    const snapshot = createSnapshot('/color/brand/compose');
    const result = colorToAndroidComposeColorTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'srgb',
        components: [0.25, 0.5, 0.75],
      },
    });

    expect(result).toStrictEqual({
      argbHex: '#ff4080bf',
      hexLiteral: '0xFF4080BF',
    });
  });

  it('normalises invalid components before emitting literals', () => {
    const snapshot = createSnapshot('/color/system/compose');
    const result = colorToAndroidComposeColorTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'srgb',
        components: [Number.NaN, 2, -0.5, 0.2],
      },
    });

    expect(result).toStrictEqual({
      argbHex: '#3300ff00',
      hexLiteral: '0x3300FF00',
    });
  });

  it('serialises OKLAB colors into Compose literals', () => {
    const snapshot = createSnapshot('/color/android/oklab');
    const result = colorToAndroidComposeColorTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'color',
      value: {
        colorSpace: 'oklab',
        components: [0.6, 0.1, -0.05],
        alpha: 0.4,
      },
    });

    expect(result).toStrictEqual({
      argbHex: '#66a8669c',
      hexLiteral: '0x66A8669C',
    });
  });
});

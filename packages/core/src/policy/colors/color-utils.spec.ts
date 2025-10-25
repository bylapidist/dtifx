import { describe, expect, it } from 'vitest';

import {
  computeRelativeLuminance,
  normaliseColorValueToSrgb,
  parseColorValue,
  toColorCssOutput,
  type ColorValue,
} from './color-utils.js';

describe('color-utils', () => {
  const baseSrgb: ColorValue = {
    colorSpace: 'srgb',
    components: [0.25, 0.5, 0.75],
  };

  it('parses structured color payloads', () => {
    const value = parseColorValue({
      colorSpace: 'srgb',
      components: [0.1, 0.2, 0.3, 0.4],
      alpha: 0.8,
      hex: '#112233',
    });

    expect(value).toEqual({
      colorSpace: 'srgb',
      components: [0.1, 0.2, 0.3, 0.4],
      alpha: 0.8,
      hex: '#112233',
    });
  });

  it('returns undefined for invalid color payloads', () => {
    expect(parseColorValue(void 0)).toBeUndefined();
    expect(parseColorValue({ colorSpace: 'srgb', components: ['x'] })).toBeUndefined();
  });

  it('computes CSS metadata for srgb values', () => {
    const cssOutput = toColorCssOutput(baseSrgb);

    expect(cssOutput.srgbHex).toBe('#4080bf');
    expect(cssOutput.oklch.css).toMatch(/^oklch\(/);
    expect(cssOutput.relativeLuminance).toBeCloseTo(computeRelativeLuminance(baseSrgb), 6);
  });

  it('normalises oklch colors to srgb', () => {
    const cssOutput = toColorCssOutput(baseSrgb);
    const oklchValue: ColorValue = {
      colorSpace: 'oklch',
      components: [cssOutput.oklch.l, cssOutput.oklch.c, cssOutput.oklch.h],
    };

    const normalised = normaliseColorValueToSrgb(oklchValue);

    expect(normalised.colorSpace).toBe('srgb');
    for (const [index, component] of normalised.components.entries()) {
      expect(component).toBeCloseTo(baseSrgb.components[index], 4);
    }
  });

  it('normalises oklab colors to srgb', () => {
    const cssOutput = toColorCssOutput(baseSrgb);
    const radians = (cssOutput.oklch.h * Math.PI) / 180;
    const oklabValue: ColorValue = {
      colorSpace: 'oklab',
      components: [
        cssOutput.oklch.l,
        Math.cos(radians) * cssOutput.oklch.c,
        Math.sin(radians) * cssOutput.oklch.c,
      ],
    };

    const normalised = normaliseColorValueToSrgb(oklabValue);

    expect(normalised.colorSpace).toBe('srgb');
    for (const [index, component] of normalised.components.entries()) {
      expect(component).toBeCloseTo(baseSrgb.components[index], 4);
    }
  });

  it('derives alpha information from component arrays when needed', () => {
    const cssOutput = toColorCssOutput({
      colorSpace: 'srgb',
      components: [0.2, 0.4, 0.6, 0.5],
    });

    expect(cssOutput.srgbHex).toBe('#33669980');
    expect(cssOutput.oklch.css.endsWith('/ 0.5000)')).toBe(true);
  });

  it('throws for unsupported color spaces', () => {
    const invalid: ColorValue = {
      colorSpace: 'cielab',
      components: [0.1, 0.2, 0.3],
    };

    expect(() => normaliseColorValueToSrgb(invalid)).toThrowError(
      'Unsupported color space: cielab',
    );
  });
});

import ColorManipulator from 'color';
import type { ColorInstance as ColorManipulatorInstance } from 'color';

import {
  TokenPrefab,
  createInitialState,
  normaliseTokenPath,
  type TokenPathInput,
} from './token-prefab.js';
import type { TokenPath } from '../tokens/index.js';

export type ColorComponents = readonly [number, number, number];

export interface ColorValue {
  readonly colorSpace: string;
  readonly components: ColorComponents;
  readonly alpha?: number;
  readonly hex?: string;
}

export type ColorInput =
  | string
  | ColorValue
  | { readonly r: number; readonly g: number; readonly b: number; readonly a?: number };

export type ColorLike = ColorInput | ColorTokenPrefab;

const SRGB = 'srgb';

function withOptionalAlpha<TBase extends Record<string, unknown>>(
  base: TBase,
  alpha: number | undefined,
): TBase & { alpha?: number } {
  if (alpha === undefined) {
    return base as TBase & { alpha?: number };
  }

  return { ...base, alpha };
}

export class ColorTokenPrefab extends TokenPrefab<ColorValue, ColorTokenPrefab> {
  static from(path: TokenPathInput, input: ColorInput): ColorTokenPrefab {
    const tokenPath = normaliseTokenPath(path);
    return new ColorTokenPrefab(tokenPath, createInitialState(normaliseColorInput(input)));
  }

  private constructor(path: TokenPath, state: ReturnType<typeof createInitialState<ColorValue>>) {
    super('color', path, state);
  }

  protected create(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<ColorValue>>,
  ): ColorTokenPrefab {
    return new ColorTokenPrefab(path, state);
  }

  get value(): ColorValue {
    return this.state.value;
  }

  lighten(amount: number): ColorTokenPrefab {
    return this.updateValue((value) => adjustLightness(value, Math.abs(amount), 'lighten'));
  }

  darken(amount: number): ColorTokenPrefab {
    return this.updateValue((value) => adjustLightness(value, Math.abs(amount), 'darken'));
  }

  withAlpha(alpha: number): ColorTokenPrefab {
    return this.updateValue((value) => normaliseColor({ ...value, alpha }));
  }

  withHex(hex: string): ColorTokenPrefab {
    return this.updateValue(() => normaliseColorInput(hex));
  }

  withComponents(
    components: ColorComponents,
    options: { readonly colorSpace?: string; readonly alpha?: number } = {},
  ): ColorTokenPrefab {
    return this.updateValue(() =>
      normaliseColor(
        withOptionalAlpha(
          {
            colorSpace: options.colorSpace ?? this.state.value.colorSpace,
            components,
          },
          options.alpha,
        ),
      ),
    );
  }
}

export const Color = {
  fromHex(path: TokenPathInput, hex: string): ColorTokenPrefab {
    return ColorTokenPrefab.from(path, hex);
  },
  srgb(
    path: TokenPathInput,
    components: ColorComponents,
    options: { readonly alpha?: number } = {},
  ): ColorTokenPrefab {
    return ColorTokenPrefab.from(
      path,
      withOptionalAlpha(
        {
          colorSpace: SRGB,
          components,
        },
        options.alpha,
      ),
    );
  },
  fromComponents(
    path: TokenPathInput,
    components: ColorComponents,
    options: { readonly colorSpace?: string; readonly alpha?: number } = {},
  ): ColorTokenPrefab {
    return ColorTokenPrefab.from(
      path,
      withOptionalAlpha(
        {
          colorSpace: options.colorSpace ?? SRGB,
          components,
        },
        options.alpha,
      ),
    );
  },
};

function normaliseColorInput(input: ColorInput): ColorValue {
  if (typeof input === 'string') {
    return normaliseColor(parseHex(input));
  }

  if (isColorCandidate(input)) {
    return normaliseColor(input);
  }

  return normaliseColor(
    withOptionalAlpha(
      {
        colorSpace: SRGB,
        components: [input.r, input.g, input.b],
      },
      input.a,
    ),
  );
}

function normaliseColor(value: {
  readonly colorSpace?: string;
  readonly components: readonly number[];
  readonly alpha?: number;
}): ColorValue {
  const colorSpace = (value.colorSpace ?? SRGB).trim();
  if (colorSpace.length === 0) {
    throw new TypeError('colorSpace must be provided for color tokens.');
  }

  if (value.components.length < 3) {
    throw new TypeError('Color components must include at least red, green, and blue channels.');
  }

  const components: ColorComponents = [
    clamp01(value.components[0] ?? 0),
    clamp01(value.components[1] ?? 0),
    clamp01(value.components[2] ?? 0),
  ];

  const alpha = value.alpha === undefined ? undefined : clamp01(value.alpha);

  const hex = formatHex(components, alpha);

  const result: ColorValue = {
    colorSpace,
    components,
    hex,
  };

  return alpha === undefined
    ? result
    : {
        ...result,
        alpha,
      };
}

function parseHex(input: string): {
  readonly colorSpace: string;
  readonly components: ColorComponents;
  readonly alpha?: number;
} {
  const trimmed = input.trim();
  if (!/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(trimmed)) {
    throw new TypeError(`Invalid hex color: ${input}`);
  }

  let body = trimmed.slice(1);
  if (body.length === 3 || body.length === 4) {
    body = [...body].map((char) => char + char).join('');
  }

  const hasAlpha = body.length === 8;
  const colorBody = hasAlpha ? body.slice(0, 6) : body;
  const r = Number.parseInt(colorBody.slice(0, 2), 16) / 255;
  const g = Number.parseInt(colorBody.slice(2, 4), 16) / 255;
  const b = Number.parseInt(colorBody.slice(4, 6), 16) / 255;
  const alpha = hasAlpha ? Number.parseInt(body.slice(6, 8), 16) / 255 : undefined;

  const components: ColorComponents = [r, g, b];
  if (alpha === undefined) {
    return {
      colorSpace: SRGB,
      components,
    };
  }

  return {
    colorSpace: SRGB,
    components,
    alpha,
  };
}

function formatHex(components: ColorComponents, alpha: number | undefined): string {
  const hex = components.map((component) => toHexByte(component)).join('');
  const alphaHex = alpha === undefined ? '' : toHexByte(alpha);
  return `#${hex}${alphaHex}`.toUpperCase();
}

function toHexByte(component: number): string {
  const value = Math.round(clamp01(component) * 255);
  return value.toString(16).padStart(2, '0');
}

function clamp01(value: number): number {
  if (Number.isFinite(value)) {
    if (value <= 0) {
      return 0;
    }

    if (value >= 1) {
      return 1;
    }

    return value;
  }

  return 0;
}

function adjustLightness(
  value: ColorValue,
  amount: number,
  mode: 'lighten' | 'darken',
): ColorValue {
  const ratio = clamp01(Math.abs(amount));
  if (ratio === 0) {
    return value;
  }

  if (value.colorSpace.toLowerCase() !== SRGB) {
    throw new TypeError('Lightness adjustments require an srgb colorSpace.');
  }

  const base = toColorManipulator(value);
  const adjusted = mode === 'lighten' ? base.lighten(ratio) : base.darken(ratio);

  return normaliseColor(
    withOptionalAlpha(
      {
        colorSpace: value.colorSpace,
        components: toColorComponents(adjusted),
      },
      value.alpha,
    ),
  );
}

function isColorCandidate(value: unknown): value is {
  readonly colorSpace?: string;
  readonly components: readonly number[];
  readonly alpha?: number;
} {
  if (value && typeof value === 'object') {
    return Array.isArray((value as { readonly components?: unknown }).components);
  }

  return false;
}

/**
 * Converts colour-like input into a normalised colour value understood by DTIF consumers.
 * @param input - Colour-like value to normalise.
 * @returns A normalised colour value compatible with DTIF snapshots.
 */
export function toColorValue(input: ColorLike): ColorValue {
  if (input instanceof ColorTokenPrefab) {
    return input.value;
  }

  return normaliseColorInput(input);
}

/**
 * Lightens a colour value by increasing its HSL lightness component.
 *
 * @param value - The colour value to lighten.
 * @param amount - The amount of lightness to apply (0-1).
 * @returns A new colour value with increased lightness.
 */
export function lightenColorValue(value: ColorValue, amount: number): ColorValue {
  return adjustLightness(value, Math.abs(amount), 'lighten');
}

/**
 * Darkens a colour value by decreasing its HSL lightness component.
 *
 * @param value - The colour value to darken.
 * @param amount - The amount of lightness reduction to apply (0-1).
 * @returns A new colour value with decreased lightness.
 */
export function darkenColorValue(value: ColorValue, amount: number): ColorValue {
  return adjustLightness(value, Math.abs(amount), 'darken');
}

function toColorManipulator(value: ColorValue): ColorManipulatorInstance {
  const rgb = value.components.map((component) => clamp01(component) * 255);
  const instance = ColorManipulator.rgb(rgb);
  if (value.alpha === undefined) {
    return instance;
  }

  return instance.alpha(clamp01(value.alpha));
}

function toColorComponents(color: ColorManipulatorInstance): ColorComponents {
  const { r, g, b } = color.unitObject();
  return [clamp01(r ?? 0), clamp01(g ?? 0), clamp01(b ?? 0)];
}

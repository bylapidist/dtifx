import type { JsonPointer } from '@lapidist/dtif-parser';

import {
  STATIC_TRANSFORM_OPTIONS_HASH,
  defineTransform,
  type TransformDefinition,
  type TransformInput,
  type TransformSelector,
  type TypedTransformDefinition,
} from './transform-registry.js';
import {
  TRANSFORM_GROUP_ANDROID_COMPOSE,
  TRANSFORM_GROUP_ANDROID_MATERIAL,
  TRANSFORM_GROUP_IOS_SWIFTUI,
  TRANSFORM_GROUP_WEB_BASE,
} from './transform-groups.js';
import type { TokenSnapshot } from '../session/resolution-session.js';
import {
  normaliseColorValueToSrgb,
  parseColorValue,
  toColorCssOutput,
  type ColorCssMetadata,
  type ColorValue,
} from '@dtifx/core/policy';

export type { ColorValue } from '@dtifx/core/policy';

export type ColorCssTransformOutput = ColorCssMetadata;

export interface ColorTokenVariantsTransformOutput {
  readonly pointer: JsonPointer;
  readonly variants: readonly JsonPointer[];
}

export interface ColorSwiftUIColorTransformOutput {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly opacity: number;
  readonly hex: string;
}

export interface ColorAndroidArgbTransformOutput {
  readonly alpha: number;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly argbHex: string;
}

export interface ColorAndroidComposeTransformOutput {
  readonly argbHex: string;
  readonly hexLiteral: string;
}

/**
 * Builds the collection of transform definitions that operate on color tokens.
 * @returns {readonly TransformDefinition[]} Transform definitions that should be registered for color token handling.
 */
export function createColorTransforms(): readonly TransformDefinition[] {
  return [colorToCssTransform, colorTokenVariantsTransform];
}

/**
 * Builds the collection of color transforms that target SwiftUI-based outputs.
 * @returns {readonly TransformDefinition[]} Transform definitions that expose SwiftUI color metadata.
 */
export function createIosSwiftUiColorTransforms(): readonly TransformDefinition[] {
  return [colorToSwiftUIColorTransform];
}

/**
 * Builds the collection of color transforms that target Android Material outputs.
 * @returns {readonly TransformDefinition[]} Transform definitions that expose Android-friendly color metadata.
 */
export function createAndroidMaterialColorTransforms(): readonly TransformDefinition[] {
  return [colorToAndroidArgbTransform];
}

/**
 * Builds the collection of color transforms that target Jetpack Compose outputs.
 * @returns {readonly TransformDefinition[]} Transform definitions that expose Compose-friendly color metadata.
 */
export function createAndroidComposeColorTransforms(): readonly TransformDefinition[] {
  return [colorToAndroidComposeColorTransform];
}

/**
 * Transform definition that converts structured color tokens into a CSS friendly payload.
 */
export const colorToCssTransform = defineTransform({
  name: 'color.toCss',
  selector: { types: ['color'] as const },
  group: TRANSFORM_GROUP_WEB_BASE,
  optionsHash: STATIC_TRANSFORM_OPTIONS_HASH,
  run: (input: TransformInput<ColorValue, 'color'>) => {
    const value = ensureSrgbColorValue(input);
    return toColorCssOutput(value);
  },
} satisfies TypedTransformDefinition<ColorCssTransformOutput, TransformSelector<'color'>>);

export const colorToSwiftUIColorTransform = defineTransform({
  name: 'color.toSwiftUIColor',
  selector: { types: ['color'] as const },
  group: TRANSFORM_GROUP_IOS_SWIFTUI,
  optionsHash: STATIC_TRANSFORM_OPTIONS_HASH,
  run: (input: TransformInput<ColorValue, 'color'>) => {
    const value = ensureSrgbColorValue(input);
    const [redComponent, greenComponent, blueComponent] = value.components;
    const opacity = resolveOpacity(value);
    const metadata = toColorCssOutput(value);
    return {
      red: normaliseComponent(redComponent),
      green: normaliseComponent(greenComponent),
      blue: normaliseComponent(blueComponent),
      opacity,
      hex: metadata.srgbHex,
    } satisfies ColorSwiftUIColorTransformOutput;
  },
} satisfies TypedTransformDefinition<ColorSwiftUIColorTransformOutput, TransformSelector<'color'>>);

export const colorToAndroidArgbTransform = defineTransform({
  name: 'color.toAndroidArgb',
  selector: { types: ['color'] as const },
  group: TRANSFORM_GROUP_ANDROID_MATERIAL,
  optionsHash: STATIC_TRANSFORM_OPTIONS_HASH,
  run: (input: TransformInput<ColorValue, 'color'>) => {
    const value = ensureSrgbColorValue(input);
    const [redComponent, greenComponent, blueComponent] = value.components;
    const alpha = resolveOpacity(value);
    const red = toByteComponent(redComponent);
    const green = toByteComponent(greenComponent);
    const blue = toByteComponent(blueComponent);
    const alphaByte = toByteFromNormalised(alpha);
    return {
      alpha: alphaByte,
      red,
      green,
      blue,
      argbHex: formatAndroidHex(alphaByte, red, green, blue),
    } satisfies ColorAndroidArgbTransformOutput;
  },
} satisfies TypedTransformDefinition<ColorAndroidArgbTransformOutput, TransformSelector<'color'>>);

export const colorToAndroidComposeColorTransform = defineTransform({
  name: 'color.toAndroidComposeColor',
  selector: { types: ['color'] as const },
  group: TRANSFORM_GROUP_ANDROID_COMPOSE,
  optionsHash: STATIC_TRANSFORM_OPTIONS_HASH,
  run: (input: TransformInput<ColorValue, 'color'>) => {
    const value = ensureSrgbColorValue(input);
    const [redComponent, greenComponent, blueComponent] = value.components;
    const alpha = resolveOpacity(value);
    const red = toByteComponent(redComponent);
    const green = toByteComponent(greenComponent);
    const blue = toByteComponent(blueComponent);
    const alphaByte = toByteFromNormalised(alpha);
    const argbHex = formatAndroidHex(alphaByte, red, green, blue);
    return {
      argbHex,
      hexLiteral: formatComposeHex(alphaByte, red, green, blue),
    } satisfies ColorAndroidComposeTransformOutput;
  },
} satisfies TypedTransformDefinition<
  ColorAndroidComposeTransformOutput,
  TransformSelector<'color'>
>);

/**
 * Transform definition that exposes color variants declared through token metadata extensions.
 */
export const colorTokenVariantsTransform = defineTransform({
  name: 'color.tokenVariants',
  selector: { types: ['color'] as const },
  group: TRANSFORM_GROUP_WEB_BASE,
  optionsHash: STATIC_TRANSFORM_OPTIONS_HASH,
  run: ({ snapshot }) => ({
    pointer: snapshot.pointer,
    variants: collectVariants(snapshot),
  }),
} satisfies TypedTransformDefinition<
  ColorTokenVariantsTransformOutput,
  TransformSelector<'color'>
>);

/**
 * Validates the transform input and returns a parsed {@link ColorValue} or throws when invalid.
 * @param {TransformInput<ColorValue, 'color'>} input - Transform invocation details including the raw value.
 * @returns {ColorValue} The parsed color value.
 * @throws {TypeError} When the token is missing required structure or uses an unsupported color space.
 */
function ensureSrgbColorValue(input: TransformInput<ColorValue, 'color'>): ColorValue {
  const value = parseColorValue(input.value);
  if (value === undefined) {
    throw new TypeError(
      `Color transforms require a color token with structured value. ` +
        `Received: ${JSON.stringify(input.value)}`,
    );
  }
  try {
    return normaliseColorValueToSrgb(value);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new TypeError(
        `color transforms support srgb, oklab, and oklch colorSpace values. Received ${value.colorSpace}.`,
      );
    }
    throw error;
  }
}

function resolveOpacity(value: ColorValue): number {
  const fallback = typeof value.components[3] === 'number' ? value.components[3] : 1;
  const opacity = typeof value.alpha === 'number' ? value.alpha : fallback;
  return normaliseComponent(opacity);
}

function normaliseComponent(component: number): number {
  if (Number.isNaN(component) || Number.isFinite(component) === false) {
    return 0;
  }
  if (component < 0) {
    return 0;
  }
  if (component > 1) {
    return 1;
  }
  return Math.round(component * 1_000_000) / 1_000_000;
}

function toByteComponent(component: number): number {
  const normalised = normaliseComponent(component);
  return Math.round(normalised * 255);
}

function toByteFromNormalised(component: number): number {
  if (Number.isFinite(component) === false) {
    return 0;
  }
  if (component < 0) {
    return 0;
  }
  if (component > 1) {
    return 255;
  }
  return Math.round(component * 255);
}

function formatAndroidHex(alpha: number, red: number, green: number, blue: number): string {
  return `#${toHex(alpha)}${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function formatComposeHex(alpha: number, red: number, green: number, blue: number): string {
  const hex = `${toHex(alpha)}${toHex(red)}${toHex(green)}${toHex(blue)}`.toUpperCase();
  return `0x${hex}`;
}

function toHex(component: number): string {
  const clamped = Math.min(255, Math.max(0, Math.trunc(component)));
  return clamped.toString(16).padStart(2, '0');
}

/**
 * Extracts variant pointers from the colour token metadata extension when available.
 * @param {TokenSnapshot} snapshot - Token snapshot containing metadata extensions.
 * @returns {readonly JsonPointer[]} Pointers describing variant tokens.
 */
function collectVariants(snapshot: TokenSnapshot): readonly JsonPointer[] {
  const extensionValue = snapshot.metadata?.extensions?.['net.lapidist.color'];
  if (extensionValue === undefined) {
    return [];
  }
  if (Object(extensionValue) === extensionValue) {
    const extension = extensionValue as {
      readonly variants?: unknown;
    };
    const variants = extension.variants;
    if (Array.isArray(variants)) {
      const pointer = snapshot.pointer;
      return variants
        .map((variant) => (typeof variant === 'string' ? variant : undefined))
        .filter((entry): entry is string => typeof entry === 'string' && entry !== pointer)
        .map((entry) => entry as JsonPointer);
    }
  }
  return [];
}

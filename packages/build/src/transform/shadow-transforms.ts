import { defineTransform } from './transform-registry.js';
import type { TransformDefinition } from './transform-registry.js';
import {
  TRANSFORM_GROUP_ANDROID_MATERIAL,
  TRANSFORM_GROUP_IOS_SWIFTUI,
  TRANSFORM_GROUP_WEB_BASE,
} from './transform-groups.js';
import type { TokenTypeValue } from '../types/token-value-types.js';
import type { TokenSnapshot } from '../session/resolution-session.js';
import { resolveColorCssMetadata } from './color-reference.js';

interface ShadowLayerOutput {
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly spread?: number;
  readonly opacity?: number;
}

export interface ShadowSwiftUiLayerOutput extends ShadowLayerOutput {}

export interface ShadowSwiftUiTransformOutput {
  readonly layers: readonly ShadowSwiftUiLayerOutput[];
}

export interface ShadowAndroidMaterialLayerOutput extends ShadowLayerOutput {}

export interface ShadowAndroidMaterialTransformOutput {
  readonly layers: readonly ShadowAndroidMaterialLayerOutput[];
}

export interface ShadowCssTransformOutput {
  readonly css: string;
  readonly layers: readonly string[];
}

type ShadowTokenValue = TokenTypeValue<'shadow'>;

type ShadowLayerValue = ShadowTokenValue & {
  readonly color?: unknown;
  readonly offsetX?: unknown;
  readonly offsetY?: unknown;
  readonly x?: unknown;
  readonly y?: unknown;
  readonly horizontal?: unknown;
  readonly vertical?: unknown;
  readonly blur?: unknown;
  readonly radius?: unknown;
  readonly spread?: unknown;
  readonly opacity?: unknown;
};

interface ShadowTransformValue extends ShadowLayerValue {
  readonly layers?: readonly ShadowLayerValue[];
}

/**
 * Transform definition that converts shadow tokens into SwiftUI compatible metadata.
 */
export const shadowToSwiftUiTransform = defineTransform({
  name: 'shadow.toSwiftUI',
  group: TRANSFORM_GROUP_IOS_SWIFTUI,
  selector: { types: ['shadow'] },
  run: ({ value, snapshot }) => {
    if (!isShadowValue(value)) {
      return;
    }

    const layers = normaliseLayers(value, snapshot);

    if (layers.length === 0) {
      return;
    }

    return { layers } satisfies ShadowSwiftUiTransformOutput;
  },
});

/**
 * Builds the set of SwiftUI oriented shadow transforms available to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of serialising shadow tokens for SwiftUI.
 */
export function createIosSwiftUiShadowTransforms(): readonly TransformDefinition[] {
  return [shadowToSwiftUiTransform];
}

/**
 * Transform definition that converts shadow tokens into CSS-compatible metadata.
 */
export const shadowToCssTransform = defineTransform({
  name: 'shadow.toCss',
  group: TRANSFORM_GROUP_WEB_BASE,
  selector: { types: ['shadow'] },
  run: ({ value, snapshot }) => {
    if (!isShadowValue(value)) {
      return;
    }

    const layers = normaliseLayers(value, snapshot);

    if (layers.length === 0) {
      return;
    }

    const cssLayers = formatShadowLayers(layers);

    if (cssLayers.length === 0) {
      return;
    }

    return { css: cssLayers.join(', '), layers: cssLayers } satisfies ShadowCssTransformOutput;
  },
});

export const shadowToAndroidMaterialTransform = defineTransform({
  name: 'shadow.toAndroidMaterial',
  group: TRANSFORM_GROUP_ANDROID_MATERIAL,
  selector: { types: ['shadow'] },
  run: ({ value, snapshot }) => {
    if (!isShadowValue(value)) {
      return;
    }

    const layers = normaliseLayers(value, snapshot);

    if (layers.length === 0) {
      return;
    }

    return { layers } satisfies ShadowAndroidMaterialTransformOutput;
  },
});

/**
 * Builds the set of Android Material oriented shadow transforms available to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of serialising shadow tokens for Android targets.
 */
export function createAndroidMaterialShadowTransforms(): readonly TransformDefinition[] {
  return [shadowToAndroidMaterialTransform];
}

/**
 * Builds the set of CSS oriented shadow transforms available to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions that serialise shadow tokens for CSS outputs.
 */
export function createCssShadowTransforms(): readonly TransformDefinition[] {
  return [shadowToCssTransform];
}

function isShadowValue(value: unknown): value is ShadowTransformValue {
  return Object(value) === value;
}

function normaliseLayers(
  value: ShadowTransformValue,
  snapshot: TokenSnapshot,
): ShadowLayerOutput[] {
  const candidates =
    Array.isArray(value.layers) && value.layers.length > 0 ? value.layers : [value];
  const fallbackColor = normaliseColor(value.color, snapshot, []);
  const fallbackX = normaliseLength(value.offsetX ?? value.x ?? value.horizontal, 0);
  const fallbackY = normaliseLength(value.offsetY ?? value.y ?? value.vertical, 0);
  const fallbackRadius = normaliseLength(value.blur ?? value.radius, 0);
  const fallbackSpread = normaliseOptionalLength(value.spread);
  const fallbackOpacity = normaliseOpacity(value.opacity);

  const fallbacks: ShadowLayerFallbacks = {
    x: fallbackX,
    y: fallbackY,
    radius: fallbackRadius,
    ...(fallbackSpread === undefined ? {} : { spread: fallbackSpread }),
    ...(fallbackOpacity === undefined ? {} : { opacity: fallbackOpacity }),
    ...(fallbackColor === undefined ? {} : { color: fallbackColor }),
  };

  const pathCandidates =
    Array.isArray(value.layers) && value.layers.length > 0
      ? value.layers.map((_, index) => ['layers', index] as const)
      : [undefined];

  return candidates
    .map((layer, index) => normaliseLayer(layer, fallbacks, snapshot, pathCandidates[index]))
    .filter((layer): layer is ShadowLayerOutput => layer !== undefined);
}

interface ShadowLayerFallbacks {
  readonly color?: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly spread?: number;
  readonly opacity?: number;
}

function normaliseLayer(
  layer: ShadowLayerValue,
  fallbacks: ShadowLayerFallbacks,
  snapshot: TokenSnapshot,
  path: readonly (string | number)[] | undefined,
): ShadowLayerOutput | undefined {
  const basePath = path ?? [];
  const color = normaliseColor(layer.color, snapshot, basePath) ?? fallbacks.color;

  if (!color) {
    return undefined;
  }

  const x = normaliseLength(layer.offsetX ?? layer.x ?? layer.horizontal, fallbacks.x);
  const y = normaliseLength(layer.offsetY ?? layer.y ?? layer.vertical, fallbacks.y);
  const radius = normaliseLength(layer.blur ?? layer.radius, fallbacks.radius);
  const spread = normaliseOptionalLength(layer.spread) ?? fallbacks.spread;
  const opacity = normaliseOpacity(layer.opacity);

  const layerOpacity = opacity ?? fallbacks.opacity;

  return {
    color,
    x,
    y,
    radius,
    ...(spread === undefined ? {} : { spread }),
    ...(layerOpacity === undefined ? {} : { opacity: layerOpacity }),
  } satisfies ShadowLayerOutput;
}

function normaliseColor(
  value: unknown,
  snapshot: TokenSnapshot,
  path: readonly (string | number)[],
): string | undefined {
  const metadata = resolveColorCssMetadata(value, snapshot, [...path, 'color']);
  if (metadata) {
    return metadata.srgbHex;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return undefined;
}

function normaliseOptionalLength(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normaliseLength(value);
}

function normaliseLength(value: unknown, fallback = 0): number {
  const numeric = parseLength(value);
  if (numeric === undefined) {
    return fallback;
  }
  return numeric;
}

function parseLength(value: unknown): number | undefined {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return roundScalar(value);
    }
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const remMatch = /^-?\d+(?:\.\d+)?rem$/i.exec(trimmed);
    if (remMatch) {
      const magnitude = Number.parseFloat(trimmed.slice(0, -3));
      return Number.isFinite(magnitude) ? roundScalar(magnitude * ROOT_FONT_SIZE_IN_PX) : undefined;
    }

    const pxMatch = /^-?\d+(?:\.\d+)?(?:px|pt)?$/i.exec(trimmed);
    if (pxMatch) {
      const magnitude = Number.parseFloat(trimmed.replace(/px|pt/i, ''));
      return Number.isFinite(magnitude) ? roundScalar(magnitude) : undefined;
    }

    const numeric = Number.parseFloat(trimmed);
    if (Number.isFinite(numeric)) {
      return roundScalar(numeric);
    }
  }

  const dimension = resolveLengthDimensionReference(value);
  if (dimension) {
    return convertDimensionToPixels(dimension);
  }

  return undefined;
}

interface LengthDimensionCandidate {
  readonly unit: string;
  readonly value: number;
}

function resolveLengthDimensionReference(value: unknown): LengthDimensionCandidate | undefined {
  if (Object(value) !== value || value === null) {
    return undefined;
  }

  const candidate = value as {
    readonly unit?: unknown;
    readonly value?: unknown;
    readonly dimensionType?: unknown;
    readonly $value?: unknown;
    readonly $ref?: unknown;
  };

  if (typeof candidate.unit === 'string' && typeof candidate.value === 'number') {
    if (candidate.dimensionType !== undefined && candidate.dimensionType !== 'length') {
      return undefined;
    }
    if (Number.isFinite(candidate.value) === false) {
      return undefined;
    }
    return { unit: candidate.unit, value: candidate.value };
  }

  const nestedSources: readonly unknown[] = [candidate.$value, candidate.value, candidate.$ref];
  for (const nested of nestedSources) {
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const resolved = resolveLengthDimensionReference(nested);
      if (resolved) {
        return resolved;
      }
    }
  }

  return undefined;
}

function convertDimensionToPixels(candidate: LengthDimensionCandidate): number | undefined {
  const magnitude = candidate.value;
  if (Number.isFinite(magnitude) === false) {
    return undefined;
  }

  const trimmedUnit = candidate.unit.trim();
  if (trimmedUnit.length === 0) {
    return undefined;
  }

  const converter = LENGTH_DIMENSION_UNIT_CONVERSIONS.get(trimmedUnit.toLowerCase());
  if (!converter) {
    return undefined;
  }

  const pixels = converter(magnitude);
  if (Number.isFinite(pixels) === false) {
    return undefined;
  }

  return roundScalar(pixels);
}

const LENGTH_DIMENSION_UNIT_CONVERSIONS = new Map<string, (value: number) => number>([
  ['pixel', (value) => value],
  ['px', (value) => value],
  ['point', (value) => value],
  ['pt', (value) => value],
  ['rem', (value) => value * ROOT_FONT_SIZE_IN_PX],
]);

const ROOT_FONT_SIZE_IN_PX = 16;

function normaliseOpacity(value: unknown): number | undefined {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return clampOpacity(value);
    }
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const numeric = Number.parseFloat(trimmed);
    if (Number.isFinite(numeric)) {
      return clampOpacity(numeric);
    }
  }

  return undefined;
}

function clampOpacity(value: number): number {
  if (Number.isNaN(value) || Number.isFinite(value) === false) {
    return 1;
  }
  const clamped = Math.min(Math.max(value, 0), 1);
  return Math.round(clamped * 1e4) / 1e4;
}

function roundScalar(value: number): number {
  if (Object.is(value, -0)) {
    return 0;
  }
  return Math.round(value * 1e3) / 1e3;
}

function formatShadowLayers(layers: readonly ShadowLayerOutput[]): string[] {
  return layers
    .map((layer) => formatShadowLayer(layer))
    .filter((entry): entry is string => entry !== undefined);
}

function formatShadowLayer(layer: ShadowLayerOutput): string | undefined {
  const color = formatShadowColor(layer.color, layer.opacity);
  if (!color) {
    return undefined;
  }

  const parts = [
    formatLengthValue(layer.x),
    formatLengthValue(layer.y),
    formatLengthValue(layer.radius),
  ];

  if (layer.spread !== undefined) {
    parts.push(formatLengthValue(layer.spread));
  }

  parts.push(color);
  return parts.join(' ');
}

function formatLengthValue(value: number): string {
  if (Number.isFinite(value) === false) {
    return '0';
  }
  const rounded = Math.round(value * 1e4) / 1e4;
  if (Object.is(rounded, -0)) {
    return '0';
  }
  if (rounded === 0) {
    return '0';
  }
  return `${rounded.toString()}px`;
}

function formatShadowColor(color: string, opacity: number | undefined): string | undefined {
  const trimmed = color.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsedHex = parseHexColor(trimmed);
  if (parsedHex) {
    const baseAlpha = parsedHex.alpha ?? 1;
    if (opacity === undefined) {
      if (parsedHex.alpha === undefined) {
        return trimmed;
      }
      return formatRgba(parsedHex.red, parsedHex.green, parsedHex.blue, baseAlpha);
    }
    const combined = clampOpacity(baseAlpha * opacity);
    return formatRgba(parsedHex.red, parsedHex.green, parsedHex.blue, combined);
  }

  if (opacity === undefined) {
    return trimmed;
  }

  const functionMatch = /^\s*([a-zA-Z][a-zA-Z0-9-]*)\((.*)\)\s*$/u.exec(trimmed);
  if (functionMatch) {
    const prefix = functionMatch[1]!;
    const body = functionMatch[2]!;
    const slashIndex = body.lastIndexOf('/');
    if (slashIndex !== -1) {
      const base = body.slice(0, slashIndex).trim();
      const alphaSegment = body.slice(slashIndex + 1).trim();
      const existing = Number.parseFloat(alphaSegment);
      const baseAlpha = Number.isFinite(existing) ? clampOpacity(existing) : 1;
      const combined = clampOpacity(baseAlpha * opacity);
      return `${prefix}(${base} / ${formatAlpha(combined)})`;
    }

    if (/^rgba?$/iu.test(prefix) || /^hsla?$/iu.test(prefix)) {
      const segments = body
        .split(',')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
      if (segments.length === 4) {
        const existing = Number.parseFloat(segments[3]!);
        const baseAlpha = Number.isFinite(existing) ? clampOpacity(existing) : 1;
        const combined = clampOpacity(baseAlpha * opacity);
        return `${prefix}(${segments.slice(0, 3).join(', ')}, ${formatAlpha(combined)})`;
      }
      if (segments.length === 3) {
        return `${prefix}(${segments.join(', ')}, ${formatAlpha(clampOpacity(opacity))})`;
      }
    }

    return `${prefix}(${body.trim()} / ${formatAlpha(clampOpacity(opacity))})`;
  }

  if (trimmed.includes('(') && trimmed.endsWith(')')) {
    const base = trimmed.slice(0, trimmed.lastIndexOf(')'));
    return `${base} / ${formatAlpha(clampOpacity(opacity))})`;
  }

  return trimmed;
}

function parseHexColor(
  value: string,
):
  | { readonly red: number; readonly green: number; readonly blue: number; readonly alpha?: number }
  | undefined {
  const trimmed = value.trim();
  const match = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu.exec(trimmed);
  if (!match) {
    return undefined;
  }
  const hex = match[1]!;
  if (hex.length === 3 || hex.length === 4) {
    const r = Number.parseInt(hex[0]! + hex[0]!, 16);
    const g = Number.parseInt(hex[1]! + hex[1]!, 16);
    const b = Number.parseInt(hex[2]! + hex[2]!, 16);
    const a = hex.length === 4 ? Number.parseInt(hex[3]! + hex[3]!, 16) / 255 : undefined;
    return { red: r, green: g, blue: b, ...(a === undefined ? {} : { alpha: clampOpacity(a) }) };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : undefined;
    return { red: r, green: g, blue: b, ...(a === undefined ? {} : { alpha: clampOpacity(a) }) };
  }
  return undefined;
}

function formatRgba(red: number, green: number, blue: number, alpha: number): string {
  const clamped = clampOpacity(alpha);
  if (clamped >= 1) {
    return `rgb(${red}, ${green}, ${blue})`;
  }
  return `rgba(${red}, ${green}, ${blue}, ${formatAlpha(clamped)})`;
}

function formatAlpha(value: number): string {
  const rounded = Math.round(clampOpacity(value) * 1e4) / 1e4;
  return rounded.toString();
}

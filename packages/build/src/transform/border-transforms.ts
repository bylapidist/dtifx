import { defineTransform } from './transform-registry.js';
import type { TransformDefinition } from './transform-registry.js';
import { TRANSFORM_GROUP_ANDROID_COMPOSE, TRANSFORM_GROUP_WEB_BASE } from './transform-groups.js';
import type { TokenTypeValue } from '../types/token-value-types.js';
import type { TokenSnapshot } from '../session/resolution-session.js';
import { resolveColorCssMetadata } from './color-reference.js';

export interface BorderCssTransformOutput {
  readonly css: string;
  readonly width?: string;
  readonly style?: string;
  readonly color?: string;
  readonly radius?: string;
  readonly radii?: Readonly<Record<string, string>>;
}

export interface BorderAndroidComposeShapeTransformOutput {
  readonly corners: Readonly<{
    readonly topLeft?: number;
    readonly topRight?: number;
    readonly bottomRight?: number;
    readonly bottomLeft?: number;
  }>;
}

type BorderTokenValue = TokenTypeValue<'border'>;

type BorderValueRecord = BorderTokenValue & {
  readonly borderType?: unknown;
  readonly width?: unknown;
  readonly style?: unknown;
  readonly color?: unknown;
  readonly radius?: unknown;
};

const CSS_BORDER_PREFIX = 'css.';

type ComposeCornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';

const COMPOSE_LENGTH_PATTERN = /^(-?\d+(?:\.\d+)?)([A-Za-z%]*)$/u;
const CORNER_KEY_MAP: Readonly<
  Record<'top-left' | 'top-right' | 'bottom-right' | 'bottom-left', ComposeCornerKey>
> = {
  'top-left': 'topLeft',
  'top-right': 'topRight',
  'bottom-right': 'bottomRight',
  'bottom-left': 'bottomLeft',
};

/**
 * Transform definition that serialises border tokens into CSS shorthand declarations.
 */
export const borderToCssTransform = defineTransform({
  name: 'border.toCss',
  group: TRANSFORM_GROUP_WEB_BASE,
  selector: { types: ['border'] },
  run: ({ value, snapshot }) => {
    if (!isBorderValue(value)) {
      return;
    }

    if (!isCssBorder(value.borderType)) {
      return;
    }

    const width = formatBorderWidth(value.width);
    const style = formatBorderStyle(value.style);
    const color = formatColor(value.color, snapshot);

    if (!width || !style || !color) {
      return;
    }

    const radius = formatBorderRadius(value.radius);

    return {
      css: `${width} ${style} ${color}`.trim(),
      width,
      style,
      color,
      ...(radius.shorthand ? { radius: radius.shorthand } : {}),
      ...(radius.entries ? { radii: radius.entries } : {}),
    } satisfies BorderCssTransformOutput;
  },
});

/**
 * Builds the set of CSS-oriented border transforms exposed to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions for CSS border serialisation.
 */
export function createCssBorderTransforms(): readonly TransformDefinition[] {
  return [borderToCssTransform];
}

/**
 * Builds the set of Compose-oriented border transforms exposed to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions for Compose shape serialisation.
 */
export function createAndroidComposeBorderTransforms(): readonly TransformDefinition[] {
  return [borderToAndroidComposeShapeTransform];
}

export const borderToAndroidComposeShapeTransform = defineTransform({
  name: 'border.toAndroidComposeShape',
  group: TRANSFORM_GROUP_ANDROID_COMPOSE,
  selector: { types: ['border'] },
  run: ({ value }) => {
    if (!isBorderValue(value)) {
      return;
    }

    const corners = parseComposeCorners(value.radius);
    if (corners === undefined) {
      return;
    }

    return { corners } satisfies BorderAndroidComposeShapeTransformOutput;
  },
});

function isBorderValue(value: unknown): value is BorderValueRecord {
  return Object(value) === value;
}

function isCssBorder(borderType: unknown): boolean {
  if (borderType === undefined) {
    return true;
  }

  if (typeof borderType !== 'string') {
    return false;
  }

  const trimmed = borderType.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return trimmed.startsWith(CSS_BORDER_PREFIX);
}

function formatBorderWidth(value: unknown): string | undefined {
  return formatLengthToken(value);
}

function formatBorderStyle(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
}

function formatColor(value: unknown, snapshot: TokenSnapshot): string | undefined {
  const metadata = resolveColorCssMetadata(value, snapshot, ['color']);
  if (metadata) {
    return metadata.srgbHex;
  }

  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
}

interface RadiusResult {
  readonly shorthand?: string;
  readonly entries?: Readonly<Record<string, string>>;
}

interface CornerComponents {
  readonly horizontal: string;
  readonly vertical: string;
}

interface CornerFormatResult {
  readonly serialised: string;
  readonly components?: CornerComponents;
}

function formatBorderRadius(value: unknown): RadiusResult {
  if (value === undefined) {
    return {};
  }

  const shorthand = formatLengthToken(value);
  if (shorthand !== undefined) {
    return { shorthand };
  }

  if (Object(value) !== value) {
    return {};
  }

  const candidate = value as Record<string, unknown>;
  const entries: Record<string, string> = {};
  const components: Record<string, CornerComponents> = {};

  for (const [key, entryValue] of Object.entries(candidate)) {
    const formatted = formatCorner(entryValue);
    if (!formatted) {
      continue;
    }
    entries[key] = formatted.serialised;
    const normalisedKey = normaliseCornerKey(key);
    if (formatted.components && normalisedKey) {
      components[normalisedKey] = formatted.components;
    }
  }

  const shorthandValue = computeCornerShorthand(components);

  return {
    ...(Object.keys(entries).length > 0 ? { entries } : {}),
    ...(shorthandValue ? { shorthand: shorthandValue } : {}),
  };
}

function parseComposeCorners(
  value: unknown,
): BorderAndroidComposeShapeTransformOutput['corners'] | undefined {
  const uniform = parseComposeCornerValue(value);
  if (uniform !== undefined) {
    return { topLeft: uniform, topRight: uniform, bottomRight: uniform, bottomLeft: uniform };
  }

  if (Object(value) !== value) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const result: Partial<Record<ComposeCornerKey, number>> = {};

  for (const [key, raw] of Object.entries(candidate)) {
    const normalisedKey = normaliseCornerKey(key);
    if (normalisedKey === undefined) {
      continue;
    }
    const composeKey = CORNER_KEY_MAP[normalisedKey];
    if (composeKey === undefined) {
      continue;
    }
    const parsed = parseComposeCornerValue(raw);
    if (parsed === undefined) {
      continue;
    }
    result[composeKey] = parsed;
  }

  if (Object.keys(result).length === 0) {
    return undefined;
  }

  return result as BorderAndroidComposeShapeTransformOutput['corners'];
}

function parseComposeCornerValue(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return normaliseCornerSize(value);
  }

  if (typeof value === 'string') {
    return parseComposeLengthString(value);
  }

  if (Object(value) !== value) {
    return undefined;
  }

  const candidate = value as {
    readonly unit?: unknown;
    readonly value?: unknown;
    readonly x?: unknown;
    readonly y?: unknown;
  };

  if (typeof candidate.value === 'number') {
    const unit = typeof candidate.unit === 'string' ? candidate.unit : undefined;
    return convertToDpMagnitude(candidate.value, unit);
  }

  const hasVector = candidate.x !== undefined || candidate.y !== undefined;
  if (hasVector) {
    const horizontal = parseComposeCornerValue(candidate.x ?? candidate.y);
    const vertical = parseComposeCornerValue(candidate.y ?? candidate.x);
    if (horizontal === undefined || vertical === undefined) {
      return undefined;
    }
    if (Math.abs(horizontal - vertical) > 0.0001) {
      return undefined;
    }
    return normaliseCornerSize((horizontal + vertical) / 2);
  }

  return undefined;
}

function parseComposeLengthString(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.includes('/')) {
    return undefined;
  }

  const parts = trimmed.split(/\s+/u).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return undefined;
  }

  const magnitudes: number[] = [];

  for (const part of parts) {
    const match = COMPOSE_LENGTH_PATTERN.exec(part);
    if (!match) {
      return undefined;
    }
    const [, numericSource, unitSource] = match;
    if (numericSource === undefined) {
      return undefined;
    }
    const numeric = Number.parseFloat(numericSource);
    const converted = convertToDpMagnitude(numeric, unitSource);
    if (converted === undefined) {
      return undefined;
    }
    magnitudes.push(converted);
  }

  if (magnitudes.some((magnitude) => Math.abs(magnitude - magnitudes[0]!) > 0.0001)) {
    return undefined;
  }

  return normaliseCornerSize(magnitudes[0]!);
}

function convertToDpMagnitude(value: number, unit: string | undefined): number | undefined {
  if (Number.isFinite(value) === false) {
    return undefined;
  }

  const normalisedUnit = unit?.toLowerCase();
  switch (normalisedUnit) {
    case undefined:
    case '':
    case 'px':
    case 'pixel':
    case 'dp':
    case 'pt': {
      return normaliseCornerSize(value);
    }
    case 'rem': {
      return normaliseCornerSize(value * 16);
    }
    default: {
      return undefined;
    }
  }
}

function normaliseCornerSize(value: number): number | undefined {
  if (Number.isFinite(value) === false) {
    return undefined;
  }
  if (value < 0) {
    return 0;
  }
  const rounded = Math.round(value * 1e4) / 1e4;
  if (Object.is(rounded, -0)) {
    return 0;
  }
  return rounded;
}

function formatCorner(value: unknown): CornerFormatResult | undefined {
  const token = formatLengthToken(value);
  if (token !== undefined) {
    const parts = token.split(/\s+/u).filter((part) => part.length > 0);
    if (parts.length === 0) {
      return undefined;
    }
    if (parts.length === 1) {
      return {
        serialised: parts[0]!,
        components: { horizontal: parts[0]!, vertical: parts[0]! },
      } satisfies CornerFormatResult;
    }
    const horizontal = parts[0]!;
    const vertical = parts.at(-1)!;
    return {
      serialised: parts.join(' '),
      components: { horizontal, vertical },
    } satisfies CornerFormatResult;
  }

  if (Object(value) !== value) {
    return undefined;
  }

  const candidate = value as { readonly x?: unknown; readonly y?: unknown };
  const horizontal = formatLengthToken(candidate.x);
  const vertical = formatLengthToken(candidate.y);

  if (!horizontal && !vertical) {
    return undefined;
  }

  const resolvedHorizontal = horizontal ?? vertical;
  const resolvedVertical = vertical ?? horizontal ?? resolvedHorizontal;

  if (!resolvedHorizontal || !resolvedVertical) {
    return undefined;
  }

  if (resolvedHorizontal === resolvedVertical) {
    return {
      serialised: resolvedHorizontal,
      components: { horizontal: resolvedHorizontal, vertical: resolvedVertical },
    } satisfies CornerFormatResult;
  }

  return {
    serialised: `${resolvedHorizontal} ${resolvedVertical}`,
    components: { horizontal: resolvedHorizontal, vertical: resolvedVertical },
  } satisfies CornerFormatResult;
}

function normaliseCornerKey(
  key: string,
): 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left' | undefined {
  switch (key) {
    case 'topLeft':
    case 'top-left':
    case 'top_start':
    case 'topStart': {
      return 'top-left';
    }
    case 'topRight':
    case 'top-right':
    case 'topEnd':
    case 'top_end': {
      return 'top-right';
    }
    case 'bottomRight':
    case 'bottom-right':
    case 'bottomEnd':
    case 'bottom_end': {
      return 'bottom-right';
    }
    case 'bottomLeft':
    case 'bottom-left':
    case 'bottomStart':
    case 'bottom_start': {
      return 'bottom-left';
    }
    default: {
      return undefined;
    }
  }
}

function computeCornerShorthand(
  components: Readonly<Record<string, CornerComponents>>,
): string | undefined {
  const order: readonly ('top-left' | 'top-right' | 'bottom-right' | 'bottom-left')[] = [
    'top-left',
    'top-right',
    'bottom-right',
    'bottom-left',
  ];

  const values = order.map((key) => components[key]);
  if (values.every((entry) => entry === undefined)) {
    return undefined;
  }

  const fallback = values.find((entry) => entry !== undefined);
  const horizontalValues = values.map((entry) => entry?.horizontal ?? fallback?.horizontal ?? '0');
  const verticalValues = values.map((entry, index) => {
    if (entry) {
      return entry.vertical;
    }
    const horizontal = horizontalValues[index]!;
    return fallback?.vertical ?? horizontal;
  });

  const horizontal = compressRadiusValues(horizontalValues);
  const vertical = compressRadiusValues(verticalValues);

  return horizontal === vertical ? horizontal : `${horizontal} / ${vertical}`;
}

function compressRadiusValues(values: readonly string[]): string {
  const [first, second, third, fourth] = values as Readonly<[string, string, string, string]>;
  if (first === second && first === third && first === fourth) {
    return first;
  }
  if (first === third && second === fourth) {
    return `${first} ${second}`;
  }
  if (second === fourth) {
    return `${first} ${second} ${third}`;
  }
  return values.join(' ');
}

function formatLengthToken(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }

  if (typeof value === 'number') {
    if (Number.isFinite(value) === false) {
      return undefined;
    }
    if (Object.is(value, -0)) {
      return '0';
    }
    if (value === 0) {
      return '0';
    }
    return `${formatNumber(value)}px`;
  }

  if (Object(value) === value) {
    const candidate = value as { readonly unit?: unknown; readonly value?: unknown };
    if (typeof candidate.value !== 'number' || Number.isFinite(candidate.value) === false) {
      return undefined;
    }
    if (typeof candidate.unit !== 'string') {
      return undefined;
    }

    const unit = candidate.unit.trim();
    if (unit.length === 0) {
      return undefined;
    }

    const formatted = formatNumber(candidate.value);

    switch (unit) {
      case 'pixel': {
        return `${formatted}px`;
      }
      case 'rem': {
        return `${formatted}rem`;
      }
      case 'point': {
        return `${formatted}pt`;
      }
      case 'percent':
      case 'percentage': {
        return `${formatted}%`;
      }
      default: {
        return `${formatted}${unit}`;
      }
    }
  }

  return undefined;
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 1e4) / 1e4;
  if (Object.is(rounded, -0)) {
    return '0';
  }
  return rounded.toString();
}

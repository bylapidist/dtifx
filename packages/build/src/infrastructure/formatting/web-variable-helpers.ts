import type { JsonPointer } from '@lapidist/dtif-parser';

import type { FormatterToken } from '../../formatter/formatter-registry.js';
import type { BorderCssTransformOutput } from '../../transform/border-transforms.js';
import type { ColorCssTransformOutput } from '../../transform/color-transforms.js';
import type {
  DimensionPxTransformOutput,
  DimensionRemTransformOutput,
} from '../../transform/dimension-transforms.js';
import type { FontCssTransformOutput } from '../../transform/font-transforms.js';
import type { GradientCssTransformOutput } from '../../transform/gradient-transforms.js';
import type { ShadowCssTransformOutput } from '../../transform/shadow-transforms.js';
import type { TypographyCssTransformOutput } from '../../transform/typography-transforms.js';
import { getDecodedPointerSegments } from './token-pointer.js';

export const WEB_VARIABLE_SUPPORTED_TYPES = [
  'color',
  'dimension',
  'gradient',
  'shadow',
  'border',
  'typography',
  'font',
] as const;

export type WebVariableSupportedTokenType = (typeof WEB_VARIABLE_SUPPORTED_TYPES)[number];

export interface WebVariableDeclaration {
  readonly name: string;
  readonly value: string;
}

interface ResolvedWebVariableValue {
  readonly value: string;
  readonly additionalSegments?: readonly string[];
}

export interface WebVariableCollectorOptions {
  readonly prefix?: string;
  readonly createIdentifier: (segments: readonly string[]) => string;
}

/**
 * Collects normalised variable declarations from formatter tokens using a provided naming strategy.
 *
 * @param {readonly FormatterToken[]} tokens - Formatter tokens to analyse.
 * @param {WebVariableCollectorOptions} options - Naming and prefix options for the declarations.
 * @returns {readonly WebVariableDeclaration[]} Collected variable declarations ready for emission.
 */
export function collectWebVariableDeclarations(
  tokens: readonly FormatterToken[],
  options: WebVariableCollectorOptions,
): readonly WebVariableDeclaration[] {
  const declarations: WebVariableDeclaration[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (!isWebVariableSupportedTokenType(token.type)) {
      continue;
    }
    const values = resolveWebVariableValues(token);
    if (values.length === 0) {
      continue;
    }
    const baseSegments = createNormalisedVariableSegments(token.pointer, options.prefix);
    for (const value of values) {
      const segments = value.additionalSegments
        ? [...baseSegments, ...value.additionalSegments]
        : [...baseSegments];
      const identifier = options.createIdentifier(segments);
      if (seen.has(identifier)) {
        continue;
      }
      seen.add(identifier);
      declarations.push({ name: identifier, value: value.value });
    }
  }
  return declarations;
}

/**
 * Determines whether the provided token type is supported by web variable formatters.
 *
 * @param {string | undefined} type - Token type to validate.
 * @returns {boolean} `true` when the type is supported.
 */
export function isWebVariableSupportedTokenType(
  type: string | undefined,
): type is WebVariableSupportedTokenType {
  return WEB_VARIABLE_SUPPORTED_TYPES.includes(type as WebVariableSupportedTokenType);
}

/**
 * Resolves a formatter token into one or more CSS-compatible values when available.
 *
 * @param {FormatterToken} token - Formatter token to resolve.
 * @returns {readonly ResolvedWebVariableValue[]} Normalised CSS-compatible values ready for declaration emission.
 */
export function resolveWebVariableValues(
  token: FormatterToken,
): readonly ResolvedWebVariableValue[] {
  if (token.type === 'color') {
    return wrapResolvedValue(resolveColorValue(token.transforms.get('color.toCss')));
  }
  if (token.type === 'dimension') {
    return wrapResolvedValue(resolveDimensionValue(token.transforms));
  }
  if (token.type === 'gradient') {
    return wrapResolvedValue(resolveGradientValue(token.transforms.get('gradient.toCss')));
  }
  if (token.type === 'shadow') {
    return wrapResolvedValue(resolveShadowValue(token.transforms.get('shadow.toCss')));
  }
  if (token.type === 'border') {
    return wrapResolvedValue(resolveBorderValue(token.transforms.get('border.toCss')));
  }
  if (token.type === 'typography') {
    return resolveTypographyValues(token.transforms.get('typography.toCss'));
  }
  if (token.type === 'font') {
    return wrapResolvedValue(resolveFontValue(token.transforms.get('font.toCss')));
  }
  return [];
}

/**
 * Generates normalised, kebab-case pointer segments for use in variable identifiers.
 *
 * @param {JsonPointer} pointer - JSON pointer describing the token location.
 * @param {string | undefined} prefix - Optional identifier prefix to prepend.
 * @returns {readonly string[]} Normalised pointer segments safe for identifier usage.
 */
export function createNormalisedVariableSegments(
  pointer: JsonPointer,
  prefix: string | undefined,
): readonly string[] {
  const segments = getDecodedPointerSegments(pointer)
    .map((segment) => normaliseVariableSegment(segment))
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    segments.push('token');
  }
  if (prefix) {
    const prefixed = normaliseVariableSegment(prefix);
    if (prefixed.length > 0) {
      segments.unshift(prefixed);
    }
  }
  return segments;
}

/**
 * Normalises a pointer segment or prefix fragment into kebab-case.
 *
 * @param {string} value - Segment value to normalise.
 * @returns {string} Normalised segment suitable for identifier composition.
 */
export function normaliseVariableSegment(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const sanitised = trimmed.replaceAll(/[^A-Za-z0-9_-]+/g, '-');
  const segmented = sanitised
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll(/([A-Z])([A-Z][a-z0-9])/g, '$1-$2')
    .replaceAll(/([A-Za-z])([0-9])/g, '$1-$2')
    .replaceAll(/([0-9])([A-Za-z])/g, '$1-$2');
  const lower = segmented.toLowerCase();
  const collapsed = lower
    .replaceAll(/[^a-z0-9_-]+/g, '-')
    .replaceAll(/-{2,}/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  return collapsed;
}

function resolveColorValue(output: unknown): string | undefined {
  if (!output) {
    return undefined;
  }
  const result = output as ColorCssTransformOutput;
  return result.oklch.css;
}

function resolveDimensionValue(transforms: ReadonlyMap<string, unknown>): string | undefined {
  const rem = transforms.get('dimension.toRem') as DimensionRemTransformOutput | undefined;
  if (rem?.css) {
    return rem.css;
  }
  const px = transforms.get('dimension.toPx') as DimensionPxTransformOutput | undefined;
  return px?.css;
}

function resolveGradientValue(output: unknown): string | undefined {
  if (!output) {
    return undefined;
  }
  const result = output as GradientCssTransformOutput;
  return result.css;
}

function resolveShadowValue(output: unknown): string | undefined {
  if (!output) {
    return undefined;
  }
  const result = output as ShadowCssTransformOutput;
  return result.css;
}

function resolveBorderValue(output: unknown): string | undefined {
  if (!output) {
    return undefined;
  }
  const result = output as BorderCssTransformOutput;
  return result.css;
}

function wrapResolvedValue(value: string | undefined): readonly ResolvedWebVariableValue[] {
  return value ? [{ value }] : [];
}

function resolveTypographyValues(output: unknown): readonly ResolvedWebVariableValue[] {
  if (!output) {
    return [];
  }
  const result = output as TypographyCssTransformOutput;
  const values: ResolvedWebVariableValue[] = [];

  const append = (key: keyof TypographyCssTransformOutput) => {
    const cssValue = result[key];
    if (!cssValue) {
      return;
    }
    const segment = normaliseVariableSegment(key);
    if (segment.length === 0) {
      return;
    }
    values.push({ value: cssValue, additionalSegments: [segment] });
  };

  append('fontFamily');
  append('fontWeight');
  append('fontSize');
  append('lineHeight');
  append('letterSpacing');
  append('paragraphSpacing');
  append('textTransform');

  return values;
}

function resolveFontValue(output: unknown): string | undefined {
  if (!output) {
    return undefined;
  }
  const result = output as FontCssTransformOutput;
  return result.css;
}

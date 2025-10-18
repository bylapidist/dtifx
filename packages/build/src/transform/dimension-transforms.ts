import { defineTransform } from './transform-registry.js';
import type { TransformDefinition } from './transform-registry.js';
import {
  TRANSFORM_GROUP_ANDROID_MATERIAL,
  TRANSFORM_GROUP_IOS_SWIFTUI,
  TRANSFORM_GROUP_WEB_BASE,
} from './transform-groups.js';
import type { DimensionValue } from '../types/token-value-types.js';

export interface DimensionRemTransformOutput {
  readonly rem?: number;
  readonly css: string;
}

export interface DimensionPxTransformOutput {
  readonly px?: number;
  readonly css: string;
}

export interface DimensionSwiftUiTransformOutput {
  readonly points: number;
  readonly literal: string;
}

export interface DimensionAndroidDpTransformOutput {
  readonly dp: number;
  readonly literal: string;
}

export interface DimensionAndroidSpTransformOutput {
  readonly sp: number;
  readonly literal: string;
}

export type EvaluatedDimensionToken = Pick<DimensionValue, 'unit' | 'value'> &
  Partial<Pick<DimensionValue, 'dimensionType' | 'fontScale'>>;

type LengthDimensionValue = (DimensionValue | EvaluatedDimensionToken) & {
  readonly dimensionType: 'length';
};

/**
 * Normalises any dimension-like token wrapper into a usable {@link DimensionValue} shape.
 *
 * This helper inspects parser supplied resolution metadata, value wrapper conventions, and
 * function expressions so downstream transforms can operate on concrete units and magnitudes.
 *
 * @param {unknown} token - Token payload to evaluate.
 * @returns {EvaluatedDimensionToken | undefined} A concrete dimension description when evaluation succeeds.
 */
export function evaluateDimensionToken(token: unknown): EvaluatedDimensionToken | undefined {
  return evaluateDimensionTokenInternal(token, new Set());
}

/**
 * Transform definition that converts dimension tokens into rem measurements.
 */
export const dimensionToRemTransform = defineTransform({
  name: 'dimension.toRem',
  group: TRANSFORM_GROUP_WEB_BASE,
  selector: { types: ['dimension'] },
  run: ({ value }) => {
    const evaluated = evaluateDimensionToken(value);
    if (evaluated) {
      return createRemTransformOutput(evaluated);
    }

    return createRemTransformOutput(value);
  },
});

/**
 * Transform definition that converts dimension tokens into pixel measurements.
 */
export const dimensionToPxTransform = defineTransform({
  name: 'dimension.toPx',
  group: TRANSFORM_GROUP_WEB_BASE,
  selector: { types: ['dimension'] },
  run: ({ value }) => {
    const evaluated = evaluateDimensionToken(value);
    if (evaluated) {
      return createPxTransformOutput(evaluated);
    }

    return createPxTransformOutput(value);
  },
});

/**
 * Transform definition that converts dimension tokens into SwiftUI point measurements.
 */
export const dimensionToSwiftUiPointsTransform = defineTransform({
  name: 'dimension.toSwiftUiPoints',
  group: TRANSFORM_GROUP_IOS_SWIFTUI,
  selector: { types: ['dimension'] },
  run: ({ value }) => {
    const evaluated = evaluateDimensionToken(value);
    if (evaluated) {
      return createSwiftUiPointsOutput(evaluated);
    }

    return createSwiftUiPointsOutput(value);
  },
});

export const dimensionToAndroidDpTransform = defineTransform({
  name: 'dimension.toAndroidDp',
  group: TRANSFORM_GROUP_ANDROID_MATERIAL,
  selector: { types: ['dimension'] },
  run: ({ value }) => {
    const evaluated = evaluateDimensionToken(value);
    if (evaluated) {
      return createAndroidDpOutput(evaluated);
    }

    return createAndroidDpOutput(value);
  },
});

export const dimensionToAndroidSpTransform = defineTransform({
  name: 'dimension.toAndroidSp',
  group: TRANSFORM_GROUP_ANDROID_MATERIAL,
  selector: { types: ['dimension'] },
  run: ({ value }) => {
    const evaluated = evaluateDimensionToken(value);
    if (evaluated) {
      return createAndroidSpOutputFromDimension(evaluated);
    }

    return createAndroidSpOutputFromDimension(value);
  },
});

/**
 * Builds the set of dimension transforms exposed to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of converting dimension values into CSS-friendly units.
 */
export function createDimensionTransforms(): readonly TransformDefinition[] {
  return [dimensionToRemTransform, dimensionToPxTransform];
}

/**
 * Builds the set of SwiftUI oriented dimension transforms exposed to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions that expose SwiftUI-friendly point measurements.
 */
export function createIosSwiftUiDimensionTransforms(): readonly TransformDefinition[] {
  return [dimensionToSwiftUiPointsTransform];
}

/**
 * Builds the set of Android oriented dimension transforms exposed to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions that expose density-independent measurements.
 */
export function createAndroidMaterialDimensionTransforms(): readonly TransformDefinition[] {
  return [dimensionToAndroidDpTransform, dimensionToAndroidSpTransform];
}

function createRemTransformOutput(value: unknown): DimensionRemTransformOutput | undefined {
  if (!isLengthDimensionValue(value)) {
    return undefined;
  }

  if (value.unit === 'rem') {
    const rem = normaliseMagnitude(value.value, 4);
    if (rem !== undefined) {
      return {
        rem,
        css: formatRemCss(rem),
      } satisfies DimensionRemTransformOutput;
    }
    return undefined;
  }

  if (value.unit === 'pixel') {
    const rem = normaliseMagnitude(value.value / ROOT_FONT_SIZE_IN_PX, 4);
    if (rem !== undefined) {
      return {
        rem,
        css: formatRemCss(rem),
      } satisfies DimensionRemTransformOutput;
    }
    return undefined;
  }

  const css = formatCssDimension(value);
  if (css) {
    return {
      css,
    } satisfies DimensionRemTransformOutput;
  }

  return undefined;
}

function createPxTransformOutput(value: unknown): DimensionPxTransformOutput | undefined {
  if (!isLengthDimensionValue(value)) {
    return undefined;
  }

  if (value.unit === 'pixel') {
    const px = normaliseMagnitude(value.value, 2);
    if (px !== undefined) {
      return {
        px,
        css: formatPxCss(px),
      } satisfies DimensionPxTransformOutput;
    }
    return undefined;
  }

  if (value.unit === 'rem') {
    const px = normaliseMagnitude(value.value * ROOT_FONT_SIZE_IN_PX, 2);
    if (px !== undefined) {
      return {
        px,
        css: formatPxCss(px),
      } satisfies DimensionPxTransformOutput;
    }
    return undefined;
  }

  const css = formatCssDimension(value);
  if (css) {
    return {
      css,
    } satisfies DimensionPxTransformOutput;
  }

  return undefined;
}

function createSwiftUiPointsOutput(value: unknown): DimensionSwiftUiTransformOutput | undefined {
  if (!isLengthDimensionValue(value)) {
    return undefined;
  }

  const points = convertToPoints(value);
  if (points === undefined) {
    return undefined;
  }

  return createSwiftUiOutput(points);
}

function createAndroidDpOutput(value: unknown): DimensionAndroidDpTransformOutput | undefined {
  if (!isLengthDimensionValue(value) || value.fontScale === true) {
    return undefined;
  }

  const dp = convertToDp(value);
  if (dp === undefined) {
    return undefined;
  }

  return createAndroidOutput(dp);
}

function createAndroidSpOutputFromDimension(
  value: unknown,
): DimensionAndroidSpTransformOutput | undefined {
  if (!isLengthDimensionValue(value) || value.fontScale !== true) {
    return undefined;
  }

  const sp = convertToDp(value);
  if (sp === undefined) {
    return undefined;
  }

  return createAndroidSpOutput(sp);
}

/**
 * Determines whether the provided value resembles a supported {@link DimensionValue}.
 * @param {unknown} value - Candidate token value to inspect.
 * @returns {value is DimensionValue} `true` when the value has a supported unit and numeric magnitude.
 */
function isDimensionValue(value: unknown): value is (DimensionValue | EvaluatedDimensionToken) & {
  readonly dimensionType: DimensionValue['dimensionType'];
} {
  if (Object(value) !== value) {
    return false;
  }
  const candidate = value as DimensionValue;
  return (
    typeof candidate.unit === 'string' &&
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value) &&
    typeof candidate.dimensionType === 'string'
  );
}

function isLengthDimensionValue(value: unknown): value is LengthDimensionValue {
  return isDimensionValue(value) && value.dimensionType === 'length';
}

function convertToPoints(value: LengthDimensionValue): number | undefined {
  if (value.unit === 'rem') {
    return value.value * ROOT_FONT_SIZE_IN_PX;
  }
  if (value.unit === 'pixel') {
    return value.value;
  }
  if (value.unit === 'point') {
    return value.value;
  }
  return undefined;
}

function createSwiftUiOutput(points: number): DimensionSwiftUiTransformOutput | undefined {
  const normalised = normalisePoints(points);
  if (normalised === undefined) {
    return undefined;
  }
  return {
    points: normalised,
    literal: formatPointsLiteral(normalised),
  } satisfies DimensionSwiftUiTransformOutput;
}

function normalisePoints(points: number): number | undefined {
  if (Number.isFinite(points) === false) {
    return undefined;
  }
  const rounded = Math.round(points * 1000) / 1000;
  if (Object.is(rounded, -0)) {
    return 0;
  }
  return rounded;
}

function formatPointsLiteral(points: number): string {
  if (Number.isInteger(points)) {
    return `${points}.0`;
  }
  return points.toString();
}

function convertToDp(value: LengthDimensionValue): number | undefined {
  if (value.unit === 'rem') {
    return value.value * ROOT_FONT_SIZE_IN_PX;
  }
  if (value.unit === 'pixel') {
    return value.value;
  }
  if (value.unit === 'point') {
    return value.value;
  }
  return undefined;
}

function createAndroidOutput(dp: number): DimensionAndroidDpTransformOutput | undefined {
  const normalised = normaliseDp(dp);
  if (normalised === undefined) {
    return undefined;
  }
  return {
    dp: normalised,
    literal: formatDpLiteral(normalised),
  } satisfies DimensionAndroidDpTransformOutput;
}

function normaliseDp(dp: number): number | undefined {
  if (Number.isFinite(dp) === false) {
    return undefined;
  }
  const rounded = Math.round(dp * 1000) / 1000;
  if (Object.is(rounded, -0)) {
    return 0;
  }
  return rounded;
}

function formatDpLiteral(dp: number): string {
  if (Number.isInteger(dp)) {
    return `${dp}dp`;
  }
  return `${dp}dp`;
}

function createAndroidSpOutput(sp: number): DimensionAndroidSpTransformOutput | undefined {
  const normalised = normaliseSp(sp);
  if (normalised === undefined) {
    return undefined;
  }
  return {
    sp: normalised,
    literal: formatSpLiteral(normalised),
  } satisfies DimensionAndroidSpTransformOutput;
}

function normaliseSp(sp: number): number | undefined {
  if (Number.isFinite(sp) === false) {
    return undefined;
  }
  const rounded = Math.round(sp * 1000) / 1000;
  if (Object.is(rounded, -0)) {
    return 0;
  }
  return rounded;
}

function formatSpLiteral(sp: number): string {
  return `${sp}sp`;
}

const ROOT_FONT_SIZE_IN_PX = 16;

const CSS_DIMENSION_UNIT_MAP = new Map<string, string>([
  ['pixel', 'px'],
  ['percent', '%'],
  ['percentage', '%'],
  ['point', 'pt'],
  ['unitless', ''],
]);

function evaluateDimensionTokenInternal(
  token: unknown,
  seen: Set<object>,
): EvaluatedDimensionToken | undefined {
  if (token === undefined || token === null) {
    return undefined;
  }

  if (typeof token !== 'object') {
    return undefined;
  }

  if (seen.has(token as object)) {
    return undefined;
  }

  const candidate = token as Record<string, unknown>;
  seen.add(candidate);

  if (typeof candidate['fn'] === 'string') {
    const functionResolution = resolveFunctionValue(candidate, seen);
    if (functionResolution) {
      seen.delete(candidate);
      return functionResolution;
    }
  }

  const resolution = tryResolveFromFields(candidate, seen, ['$resolved', 'resolved']);
  if (resolution) {
    seen.delete(candidate);
    return resolution;
  }

  const direct = extractDimension(candidate);
  if (direct) {
    seen.delete(candidate);
    return direct;
  }

  const wrapped = tryResolveFromFields(candidate, seen, ['$value', 'value']);
  if (wrapped) {
    seen.delete(candidate);
    return wrapped;
  }

  seen.delete(candidate);
  return undefined;
}

function tryResolveFromFields(
  source: Record<string, unknown>,
  seen: Set<object>,
  keys: readonly string[],
): EvaluatedDimensionToken | undefined {
  for (const key of keys) {
    if (key in source && source[key] !== undefined) {
      const resolved = evaluateDimensionTokenInternal(source[key], seen);
      if (resolved) {
        return mergeDimensionMetadata(resolved, source);
      }
    }
  }
  return undefined;
}

function resolveFunctionValue(
  candidate: Record<string, unknown>,
  seen: Set<object>,
): EvaluatedDimensionToken | undefined {
  const parameters = candidate['parameters'];
  if (Array.isArray(parameters)) {
    const metadataSources: unknown[] = [];
    for (const parameter of parameters) {
      const resolved = evaluateDimensionTokenInternal(parameter, seen);
      if (resolved) {
        metadataSources.push(resolved);
      }
    }

    const resolution = tryResolveFromFields(candidate, seen, ['$resolved', 'resolved']);
    if (resolution) {
      return mergeDimensionMetadata(resolution, candidate, ...metadataSources);
    }

    return undefined;
  }

  const resolution = tryResolveFromFields(candidate, seen, ['$resolved', 'resolved']);
  if (resolution) {
    return mergeDimensionMetadata(resolution, candidate);
  }

  return undefined;
}

function extractDimension(candidate: Record<string, unknown>): EvaluatedDimensionToken | undefined {
  const unit = candidate['unit'];
  const value = candidate['value'];
  if (typeof unit !== 'string' || typeof value !== 'number' || Number.isFinite(value) === false) {
    return undefined;
  }

  const dimensionType =
    typeof candidate['dimensionType'] === 'string' ? candidate['dimensionType'] : undefined;
  const fontScale =
    typeof candidate['fontScale'] === 'boolean' ? candidate['fontScale'] : undefined;

  return {
    unit,
    value,
    ...(dimensionType === undefined ? {} : { dimensionType }),
    ...(fontScale === undefined ? {} : { fontScale }),
  } satisfies EvaluatedDimensionToken;
}

function mergeDimensionMetadata(
  base: EvaluatedDimensionToken,
  ...sources: readonly unknown[]
): EvaluatedDimensionToken {
  let dimensionType = base.dimensionType;
  let fontScale = base.fontScale;

  for (const source of sources) {
    if (Object(source) !== source) {
      continue;
    }

    const record = source as Record<string, unknown>;

    if (dimensionType === undefined) {
      const candidate = record['dimensionType'];
      if (typeof candidate === 'string') {
        dimensionType = candidate as DimensionValue['dimensionType'];
      }
    }

    if (fontScale === undefined) {
      const candidate = record['fontScale'];
      if (typeof candidate === 'boolean') {
        fontScale = candidate;
      }
    }
  }

  return {
    unit: base.unit,
    value: base.value,
    ...(dimensionType === undefined ? {} : { dimensionType }),
    ...(fontScale === undefined ? {} : { fontScale }),
  } satisfies EvaluatedDimensionToken;
}

function formatCssDimension(value: LengthDimensionValue): string | undefined {
  const unit = normaliseCssUnit(value.unit);
  if (unit === undefined) {
    return undefined;
  }
  const magnitude = formatCssNumber(value.value);
  return `${magnitude}${unit}`;
}

function normaliseCssUnit(unit: string): string | undefined {
  const trimmed = unit.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const lower = trimmed.toLowerCase();
  return CSS_DIMENSION_UNIT_MAP.get(lower) ?? lower;
}

function normaliseMagnitude(value: number, precision: number): number | undefined {
  if (Number.isFinite(value) === false) {
    return undefined;
  }
  const factor = 10 ** precision;
  const rounded = Math.round(value * factor) / factor;
  if (Object.is(rounded, -0)) {
    return 0;
  }
  return rounded;
}

function formatRemCss(value: number): string {
  return `${formatCssNumber(value, 4)}rem`;
}

function formatPxCss(value: number): string {
  return `${formatCssNumber(value, 2)}px`;
}

function formatCssNumber(value: number, precision = 4): string {
  if (Number.isFinite(value) === false) {
    return value.toString();
  }
  const factor = 10 ** precision;
  const rounded = Math.round(value * factor) / factor;
  if (Object.is(rounded, -0)) {
    return '0';
  }
  if (Number.isInteger(rounded)) {
    return rounded.toString(10);
  }
  return rounded.toString();
}

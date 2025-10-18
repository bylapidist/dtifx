import { defineTransform } from './transform-registry.js';
import type { TransformDefinition } from './transform-registry.js';
import {
  TRANSFORM_GROUP_ANDROID_COMPOSE,
  TRANSFORM_GROUP_ANDROID_MATERIAL,
  TRANSFORM_GROUP_IOS_SWIFTUI,
  TRANSFORM_GROUP_WEB_BASE,
} from './transform-groups.js';
import type { DimensionValue, TypographyValue } from '../types/token-value-types.js';

type LengthDimensionValue = (DimensionValue | EvaluatedDimensionToken) & {
  readonly dimensionType: 'length';
};
import {
  evaluateDimensionToken,
  type DimensionAndroidDpTransformOutput,
  type DimensionAndroidSpTransformOutput,
  type DimensionSwiftUiTransformOutput,
  type EvaluatedDimensionToken,
} from './dimension-transforms.js';

export interface TypographyCssTransformOutput {
  readonly fontFamily?: string;
  readonly fontWeight?: string;
  readonly fontSize?: string;
  readonly lineHeight?: string;
  readonly letterSpacing?: string;
  readonly paragraphSpacing?: string;
  readonly textTransform?: string;
}

export interface TypographySwiftUiLineHeightOutput {
  readonly points?: number;
  readonly multiplier?: number;
  readonly literal: string;
}

export interface TypographySwiftUiTransformOutput {
  readonly fontFamily?: string;
  readonly fontWeight?: string;
  readonly fontSize?: DimensionSwiftUiTransformOutput;
  readonly lineHeight?: TypographySwiftUiLineHeightOutput;
  readonly letterSpacing?: DimensionSwiftUiTransformOutput;
  readonly paragraphSpacing?: DimensionSwiftUiTransformOutput;
  readonly textCase?: string;
  readonly textTransform?: string;
}

export interface TypographyAndroidMaterialLineHeightOutput {
  readonly sp?: number;
  readonly multiplier?: number;
  readonly literal: string;
}

export interface TypographyAndroidMaterialTransformOutput {
  readonly fontFamily?: string;
  readonly fontWeight?: string;
  readonly fontSize?: DimensionAndroidSpTransformOutput;
  readonly lineHeight?: TypographyAndroidMaterialLineHeightOutput;
  readonly letterSpacing?: DimensionAndroidSpTransformOutput;
  readonly paragraphSpacing?: DimensionAndroidDpTransformOutput;
  readonly textCase?: string;
  readonly textTransform?: string;
}

export type TypographyAndroidComposeTransformOutput = TypographyAndroidMaterialTransformOutput;

/**
 * Transform definition that converts typography tokens into a CSS declaration block.
 */
export const typographyToCssTransform = defineTransform({
  name: 'typography.toCss',
  group: TRANSFORM_GROUP_WEB_BASE,
  selector: { types: ['typography'] },
  run: ({ value }) => {
    if (isTypographyValue(value) === false) {
      return;
    }

    const fontFamily = formatCssString(value.fontFamily);
    const fontWeight = formatCssString(value.fontWeight);
    const fontSize = formatCssDimension(value.fontSize);
    const lineHeight = formatCssLineHeight(value.lineHeight);
    const letterSpacing = formatCssDimension(value.letterSpacing);
    const paragraphSpacing = formatCssDimension(value.paragraphSpacing);
    const textTransform = formatCssString(value.textTransform);

    const declarations: TypographyCssTransformOutput = {
      ...(fontFamily === undefined ? undefined : { fontFamily }),
      ...(fontWeight === undefined ? undefined : { fontWeight }),
      ...(fontSize === undefined ? undefined : { fontSize }),
      ...(lineHeight === undefined ? undefined : { lineHeight }),
      ...(letterSpacing === undefined ? undefined : { letterSpacing }),
      ...(paragraphSpacing === undefined ? undefined : { paragraphSpacing }),
      ...(textTransform === undefined ? undefined : { textTransform }),
    } satisfies TypographyCssTransformOutput;

    if (Object.keys(declarations).length === 0) {
      return;
    }

    return declarations;
  },
});

/**
 * Transform definition that converts typography tokens into SwiftUI friendly structures.
 */
export const typographyToSwiftUiTransform = defineTransform({
  name: 'typography.toSwiftUI',
  group: TRANSFORM_GROUP_IOS_SWIFTUI,
  selector: { types: ['typography'] },
  run: ({ value }) => {
    if (isTypographyValue(value) === false) {
      return;
    }

    const fontFamily = normaliseFontFamily(value.fontFamily);
    const fontWeight = normaliseFontWeight(value.fontWeight);
    const fontSize = parseDimensionLike(value.fontSize);
    const lineHeight = parseLineHeight(value.lineHeight);
    const letterSpacing = parseDimensionLike(value.letterSpacing);
    const paragraphSpacing = parseDimensionLike(value.paragraphSpacing);
    const textCase = normaliseTextValue(value.textCase);
    const textTransform = normaliseTextValue(value.textTransform);

    const result: TypographySwiftUiTransformOutput = {
      ...(fontFamily === undefined ? {} : { fontFamily }),
      ...(fontWeight === undefined ? {} : { fontWeight }),
      ...(fontSize === undefined ? {} : { fontSize }),
      ...(lineHeight === undefined ? {} : { lineHeight }),
      ...(letterSpacing === undefined ? {} : { letterSpacing }),
      ...(paragraphSpacing === undefined ? {} : { paragraphSpacing }),
      ...(textCase === undefined ? {} : { textCase }),
      ...(textTransform === undefined ? {} : { textTransform }),
    } satisfies TypographySwiftUiTransformOutput;

    if (Object.keys(result).length === 0) {
      return;
    }

    return result;
  },
});

export const typographyToAndroidMaterialTransform = defineTransform({
  name: 'typography.toAndroidMaterial',
  group: TRANSFORM_GROUP_ANDROID_MATERIAL,
  selector: { types: ['typography'] },
  run: ({ value }) => serialiseAndroidTypography(value),
});

export const typographyToAndroidComposeTransform = defineTransform({
  name: 'typography.toAndroidCompose',
  group: TRANSFORM_GROUP_ANDROID_COMPOSE,
  selector: { types: ['typography'] },
  run: ({ value }) => serialiseAndroidTypography(value),
});

/**
 * Builds the set of typography transforms exposed to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of serialising typography values.
 */
export function createTypographyTransforms(): readonly TransformDefinition[] {
  return [typographyToCssTransform];
}

/**
 * Builds the set of SwiftUI oriented typography transforms exposed to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of serialising typography values for SwiftUI.
 */
export function createIosSwiftUiTypographyTransforms(): readonly TransformDefinition[] {
  return [typographyToSwiftUiTransform];
}

/**
 * Builds the set of Android Material oriented typography transforms exposed to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of serialising typography values for Android.
 */
export function createAndroidMaterialTypographyTransforms(): readonly TransformDefinition[] {
  return [typographyToAndroidMaterialTransform];
}

/**
 * Builds the set of Jetpack Compose oriented typography transforms exposed to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of serialising typography values for Compose.
 */
export function createAndroidComposeTypographyTransforms(): readonly TransformDefinition[] {
  return [typographyToAndroidComposeTransform];
}

/**
 * Determines whether the provided value resembles a {@link TypographyValue}.
 * @param {unknown} value - Candidate token value to inspect.
 * @returns {value is TypographyValue} `true` when the value is an object.
 */
function isTypographyValue(value: unknown): value is TypographyValue {
  return Object(value) === value;
}

function formatCssDimension(value: unknown): string | undefined {
  const resolved = resolveTypographyDimensionValue(value);
  if (typeof resolved === 'number') {
    if (Number.isFinite(resolved) === false) {
      return undefined;
    }
    return formatCssPixels(resolved);
  }

  const dimension = parseDimensionLike(resolved);
  if (dimension?.points !== undefined) {
    return formatCssPixels(dimension.points);
  }

  if (typeof resolved === 'string') {
    const trimmed = resolved.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }

  return undefined;
}

function formatCssLineHeight(value: unknown): string | undefined {
  const resolved = resolveTypographyDimensionValue(value);

  if (typeof resolved === 'number') {
    if (Number.isFinite(resolved) === false) {
      return undefined;
    }
    if (resolved >= 8) {
      return formatCssPixels(resolved);
    }
    const multiplier = normaliseMultiplier(resolved);
    return multiplier === undefined ? undefined : formatLiteral(multiplier);
  }

  const dimension = parseDimensionLike(resolved);
  if (dimension?.points !== undefined) {
    return formatCssPixels(dimension.points);
  }

  if (typeof resolved === 'string') {
    const trimmed = resolved.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }

  return undefined;
}

function formatCssString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const stringified = String(value).trim();
  return stringified.length === 0 ? undefined : stringified;
}

function resolveTypographyDimensionValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (Object(value) === value) {
    const evaluated = evaluateDimensionToken(value);
    if (evaluated) {
      return evaluated;
    }
  }

  if (Object(value) !== value) {
    return value;
  }

  const candidate = value as Record<string, unknown>;

  if ('fontDimensionReference' in candidate && candidate['fontDimensionReference'] !== undefined) {
    const reference = candidate['fontDimensionReference'];
    const resolvedReference = resolveTypographyDimensionValue(reference);
    if (resolvedReference !== undefined) {
      return resolvedReference;
    }
  }

  if ('$value' in candidate && candidate['$value'] !== undefined) {
    return resolveTypographyDimensionValue(candidate['$value']);
  }

  const dimension = resolveDimensionRecord(candidate);
  if (dimension !== undefined) {
    return dimension;
  }

  if ('value' in candidate && candidate['value'] !== undefined) {
    return candidate['value'];
  }

  return value;
}

function resolveDimensionRecord(candidate: Record<string, unknown>): DimensionValue | undefined {
  const rawValue = candidate['value'];
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return createDimensionValue(rawValue, candidate);
  }

  return undefined;
}

function createDimensionValue(
  magnitude: number,
  source: Record<string, unknown>,
): DimensionValue | undefined {
  const unit = normaliseDimensionUnit(source['unit']);
  if (!unit) {
    return undefined;
  }

  const dimensionType = normaliseDimensionType(source['dimensionType']) ?? 'length';
  const fontScale = normaliseFontScale(source['fontScale']);

  return {
    unit,
    value: magnitude,
    dimensionType,
    ...(fontScale === undefined ? {} : { fontScale }),
  } satisfies DimensionValue;
}

function normaliseDimensionUnit(value: unknown): DimensionValue['unit'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalised = value.trim().toLowerCase();
  if (normalised.length === 0) {
    return undefined;
  }

  switch (normalised) {
    case 'pixel':
    case 'pixels':
    case 'px': {
      return 'pixel';
    }
    case 'point':
    case 'points':
    case 'pt': {
      return 'point';
    }
    case 'rem': {
      return 'rem';
    }
    default: {
      return undefined;
    }
  }
}

function normaliseDimensionType(value: unknown): DimensionValue['dimensionType'] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();
  switch (lower) {
    case 'length':
    case 'angle':
    case 'resolution':
    case 'custom': {
      return lower;
    }
    default: {
      return lower as DimensionValue['dimensionType'];
    }
  }
}

function normaliseFontScale(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function formatCssPixels(value: number): string | undefined {
  const normalised = normalisePoints(value);
  if (normalised === undefined) {
    return undefined;
  }

  if (Number.isInteger(normalised)) {
    return `${normalised}px`;
  }

  return `${normalised}px`;
}

function normaliseFontFamily(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function normaliseFontWeight(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return undefined;
}

function normaliseTextValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function createResolutionCandidates(value: unknown): readonly unknown[] {
  const resolved = resolveTypographyDimensionValue(value);
  const candidates: unknown[] = [];

  if (resolved !== undefined) {
    candidates.push(resolved);
  }

  if (value !== undefined && (resolved === undefined || Object.is(resolved, value) === false)) {
    candidates.push(value);
  }

  return candidates;
}

function parseAndroidDimensionLike(
  value: unknown,
  unit: 'dp',
): DimensionAndroidDpTransformOutput | undefined;
function parseAndroidDimensionLike(
  value: unknown,
  unit: 'sp',
): DimensionAndroidSpTransformOutput | undefined;
function parseAndroidDimensionLike(
  value: unknown,
  unit: 'dp' | 'sp',
): DimensionAndroidDpTransformOutput | DimensionAndroidSpTransformOutput | undefined {
  for (const candidate of createResolutionCandidates(value)) {
    if (isDimensionObject(candidate)) {
      const hasFontScaleMetadata = Object.hasOwn(candidate, 'fontScale');
      if (hasFontScaleMetadata && unit === 'sp' && candidate.fontScale === false) {
        continue;
      }
      if (hasFontScaleMetadata && unit === 'dp' && candidate.fontScale === true) {
        continue;
      }
      const converted = convertDimensionObject(candidate);
      if (converted !== undefined) {
        return unit === 'dp'
          ? createAndroidDimensionOutput(converted, 'dp')
          : createAndroidDimensionOutput(converted, 'sp');
      }
      continue;
    }

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return unit === 'dp'
        ? createAndroidDimensionOutput(candidate, 'dp')
        : createAndroidDimensionOutput(candidate, 'sp');
    }

    if (typeof candidate === 'string') {
      const parsed =
        unit === 'dp'
          ? parseAndroidDimensionString(candidate, 'dp')
          : parseAndroidDimensionString(candidate, 'sp');
      if (parsed) {
        return parsed;
      }
    }
  }

  return undefined;
}

function parseDimensionLike(value: unknown): DimensionSwiftUiTransformOutput | undefined {
  for (const candidate of createResolutionCandidates(value)) {
    if (isDimensionObject(candidate)) {
      const converted = convertDimensionObject(candidate);
      if (converted !== undefined) {
        return createDimensionOutput(converted);
      }
      continue;
    }

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return createDimensionOutput(candidate);
    }

    if (typeof candidate === 'string') {
      const parsed = parseDimensionString(candidate);
      if (parsed) {
        return parsed;
      }
    }
  }

  return undefined;
}

function parseAndroidLineHeight(
  value: unknown,
): TypographyAndroidMaterialLineHeightOutput | undefined {
  const dimension = parseAndroidDimensionLike(value, 'sp');
  if (dimension) {
    return { ...dimension } satisfies TypographyAndroidMaterialLineHeightOutput;
  }

  for (const candidate of createResolutionCandidates(value)) {
    const multiplier = parseAndroidLineHeightMultiplier(candidate);
    if (multiplier) {
      return multiplier;
    }
  }

  return undefined;
}

function parseLineHeight(value: unknown): TypographySwiftUiLineHeightOutput | undefined {
  const dimension = parseDimensionLike(value);
  if (dimension) {
    return { ...dimension } satisfies TypographySwiftUiLineHeightOutput;
  }

  for (const candidate of createResolutionCandidates(value)) {
    const multiplier = parseSwiftUiLineHeightMultiplier(candidate);
    if (multiplier) {
      return multiplier;
    }
  }

  return undefined;
}

function serialiseAndroidTypography(
  value: unknown,
): TypographyAndroidMaterialTransformOutput | undefined {
  if (isTypographyValue(value) === false) {
    return undefined;
  }

  const fontFamily = normaliseFontFamily(value.fontFamily);
  const fontWeight = normaliseFontWeight(value.fontWeight);
  const fontSize = parseAndroidDimensionLike(value.fontSize, 'sp');
  const lineHeight = parseAndroidLineHeight(value.lineHeight);
  const letterSpacing = parseAndroidDimensionLike(value.letterSpacing, 'sp');
  const paragraphSpacing = parseAndroidDimensionLike(value.paragraphSpacing, 'dp');
  const textCase = normaliseTextValue(value.textCase);
  const textTransform = normaliseTextValue(value.textTransform);

  const result: TypographyAndroidMaterialTransformOutput = {
    ...(fontFamily === undefined ? {} : { fontFamily }),
    ...(fontWeight === undefined ? {} : { fontWeight }),
    ...(fontSize === undefined ? {} : { fontSize }),
    ...(lineHeight === undefined ? {} : { lineHeight }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    ...(paragraphSpacing === undefined ? {} : { paragraphSpacing }),
    ...(textCase === undefined ? {} : { textCase }),
    ...(textTransform === undefined ? {} : { textTransform }),
  } satisfies TypographyAndroidMaterialTransformOutput;

  if (Object.keys(result).length === 0) {
    return undefined;
  }

  return result;
}

function createAndroidLineHeightMultiplier(
  value: number,
): TypographyAndroidMaterialLineHeightOutput | undefined {
  const normalised = normaliseMultiplier(value);
  if (normalised === undefined) {
    return undefined;
  }
  return {
    multiplier: normalised,
    literal: formatLiteral(normalised),
  } satisfies TypographyAndroidMaterialLineHeightOutput;
}

function createLineHeightMultiplier(value: number): TypographySwiftUiLineHeightOutput | undefined {
  const normalised = normaliseMultiplier(value);
  if (normalised === undefined) {
    return undefined;
  }
  return {
    multiplier: normalised,
    literal: formatLiteral(normalised),
  } satisfies TypographySwiftUiLineHeightOutput;
}

function parseAndroidLineHeightMultiplier(
  value: unknown,
): TypographyAndroidMaterialLineHeightOutput | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 8) {
      const dimension = parseAndroidDimensionLike(value, 'sp');
      if (dimension) {
        return { ...dimension } satisfies TypographyAndroidMaterialLineHeightOutput;
      }
      return undefined;
    }
    return createAndroidLineHeightMultiplier(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const compact = trimmed.replaceAll(/\s+/g, '');
    const percentMatch = PERCENT_PATTERN.exec(compact);
    if (percentMatch) {
      const [, numericSource] = percentMatch;
      if (numericSource === undefined) {
        return undefined;
      }
      const numeric = Number.parseFloat(numericSource);
      if (Number.isFinite(numeric)) {
        return createAndroidLineHeightMultiplier(numeric / 100);
      }
      return undefined;
    }

    const numericMatch = NUMERIC_PATTERN.exec(compact);
    if (numericMatch) {
      const [numericSource] = numericMatch;
      const numeric = Number.parseFloat(numericSource);
      if (Number.isFinite(numeric) === false) {
        return undefined;
      }
      if (numeric >= 8) {
        const dimension = parseAndroidDimensionLike(numeric, 'sp');
        if (dimension) {
          return { ...dimension } satisfies TypographyAndroidMaterialLineHeightOutput;
        }
        return undefined;
      }
      return createAndroidLineHeightMultiplier(numeric);
    }
  }

  return undefined;
}

function parseSwiftUiLineHeightMultiplier(
  value: unknown,
): TypographySwiftUiLineHeightOutput | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return createLineHeightMultiplier(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const compact = trimmed.replaceAll(/\s+/g, '');
    const percentMatch = PERCENT_PATTERN.exec(compact);
    if (percentMatch) {
      const [, numericSource] = percentMatch;
      if (numericSource === undefined) {
        return undefined;
      }
      const numeric = Number.parseFloat(numericSource);
      if (Number.isFinite(numeric)) {
        return createLineHeightMultiplier(numeric / 100);
      }
      return undefined;
    }

    const numericMatch = NUMERIC_PATTERN.exec(compact);
    if (numericMatch) {
      const [numericSource] = numericMatch;
      const numeric = Number.parseFloat(numericSource);
      if (Number.isFinite(numeric) === false) {
        return undefined;
      }
      if (numeric >= 8) {
        return createDimensionOutput(numeric);
      }
      return createLineHeightMultiplier(numeric);
    }
  }

  return undefined;
}

function parseAndroidDimensionString(
  value: string,
  unit: 'dp',
): DimensionAndroidDpTransformOutput | undefined;
function parseAndroidDimensionString(
  value: string,
  unit: 'sp',
): DimensionAndroidSpTransformOutput | undefined;
function parseAndroidDimensionString(
  value: string,
  unit: 'dp' | 'sp',
): DimensionAndroidDpTransformOutput | DimensionAndroidSpTransformOutput | undefined {
  const normalised = value.replaceAll(/\s+/g, '').trim();
  if (normalised.length === 0) {
    return undefined;
  }
  const match = DIMENSION_PATTERN.exec(normalised);
  if (!match) {
    return undefined;
  }
  const [, numericSource, unitSource] = match;
  if (numericSource === undefined) {
    return undefined;
  }
  const numeric = Number.parseFloat(numericSource);
  if (Number.isFinite(numeric) === false) {
    return undefined;
  }
  const declaredUnit = unitSource?.toLowerCase();
  if (declaredUnit === 'rem') {
    return unit === 'dp'
      ? createAndroidDimensionOutput(numeric * 16, 'dp')
      : createAndroidDimensionOutput(numeric * 16, 'sp');
  }
  return unit === 'dp'
    ? createAndroidDimensionOutput(numeric, 'dp')
    : createAndroidDimensionOutput(numeric, 'sp');
}

function parseDimensionString(value: string): DimensionSwiftUiTransformOutput | undefined {
  const normalised = value.replaceAll(/\s+/g, '').trim();
  if (normalised.length === 0) {
    return undefined;
  }
  const match = DIMENSION_PATTERN.exec(normalised);
  if (!match) {
    return undefined;
  }
  const [, numericSource, unitSource] = match;
  if (numericSource === undefined) {
    return undefined;
  }
  const numeric = Number.parseFloat(numericSource);
  if (Number.isFinite(numeric) === false) {
    return undefined;
  }
  const unit = unitSource?.toLowerCase();
  if (unit === 'rem') {
    return createDimensionOutput(numeric * 16);
  }
  return createDimensionOutput(numeric);
}

function createAndroidDimensionOutput(
  value: number,
  unit: 'dp',
): DimensionAndroidDpTransformOutput | undefined;
function createAndroidDimensionOutput(
  value: number,
  unit: 'sp',
): DimensionAndroidSpTransformOutput | undefined;
function createAndroidDimensionOutput(
  value: number,
  unit: 'dp' | 'sp',
): DimensionAndroidDpTransformOutput | DimensionAndroidSpTransformOutput | undefined {
  const normalised = normalisePoints(value);
  if (normalised === undefined) {
    return undefined;
  }
  if (unit === 'dp') {
    return {
      dp: normalised,
      literal: `${normalised}dp`,
    } satisfies DimensionAndroidDpTransformOutput;
  }
  return {
    sp: normalised,
    literal: `${normalised}sp`,
  } satisfies DimensionAndroidSpTransformOutput;
}

function createDimensionOutput(value: number): DimensionSwiftUiTransformOutput | undefined {
  const normalised = normalisePoints(value);
  if (normalised === undefined) {
    return undefined;
  }
  return {
    points: normalised,
    literal: formatLiteral(normalised),
  } satisfies DimensionSwiftUiTransformOutput;
}

function convertDimensionObject(value: LengthDimensionValue): number | undefined {
  if (Number.isFinite(value.value) === false) {
    return undefined;
  }
  if (value.unit === 'pixel' || value.unit === 'point') {
    return value.value;
  }
  if (value.unit === 'rem') {
    return value.value * 16;
  }
  return undefined;
}

function isDimensionObject(value: unknown): value is LengthDimensionValue {
  if (Object(value) !== value) {
    return false;
  }
  const candidate = value as DimensionValue;
  return (
    typeof candidate.unit === 'string' &&
    typeof candidate.value === 'number' &&
    typeof candidate.dimensionType === 'string' &&
    candidate.dimensionType === 'length'
  );
}

function normalisePoints(value: number): number | undefined {
  if (Number.isFinite(value) === false) {
    return undefined;
  }
  const rounded = Math.round(value * 1000) / 1000;
  if (Object.is(rounded, -0)) {
    return 0;
  }
  return rounded;
}

function normaliseMultiplier(value: number): number | undefined {
  if (Number.isFinite(value) === false) {
    return undefined;
  }
  const rounded = Math.round(value * 1000) / 1000;
  if (Object.is(rounded, -0)) {
    return 0;
  }
  return rounded;
}

function formatLiteral(value: number): string {
  if (Number.isInteger(value)) {
    return `${value}.0`;
  }
  return value.toString();
}

const DIMENSION_PATTERN = /^(-?\d+(?:\.\d+)?)(px|pt|rem)$/i;
const PERCENT_PATTERN = /^(-?\d+(?:\.\d+)?)%$/i;
const NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/;

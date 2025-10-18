import { inspect } from 'node:util';

import { colord, type Colord } from 'colord';

export { escapeHtml } from '@dtifx/core/reporting';
import type { TokenPointer, TokenSnapshot, TokenSourceLocation } from '../token-set.js';

/**
 * Formats an arbitrary token value for human-readable diagnostics.
 *
 * @param value - The value to format.
 * @returns The formatted representation of the value.
 */
export function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  return inspect(value, { depth: 4, sorted: true, compact: true }).trim();
}

/**
 * Formats an optional string, falling back to the literal `undefined`.
 *
 * @param value - The value to format.
 * @returns The formatted string.
 */
export function formatMaybeUndefined(value: string | undefined): string {
  return value ?? 'undefined';
}

/**
 * Formats an optional JSON pointer for display.
 *
 * @param value - The pointer to format.
 * @returns The formatted pointer string.
 */
export function formatPointer(value: string | undefined): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

/**
 * Formats a token value for inclusion in change summaries.
 *
 * @param token - The token snapshot being summarised.
 * @returns A concise string describing the token value.
 */
export function formatTokenValueForSummary(token: TokenSnapshot): string {
  if (token.value !== undefined) {
    if (typeof token.value === 'string') {
      return formatSingleQuoted(token.value);
    }

    return formatValue(token.value);
  }

  if (token.ref !== undefined) {
    return `ref ${formatPointer(token.ref)}`;
  }

  return 'undefined';
}

export interface TokenColor {
  readonly hex: string;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha?: number;
}

export interface CssDeclaration {
  readonly name: string;
  readonly value: string;
}

export interface TypographyPreview {
  readonly declarations: readonly CssDeclaration[];
  readonly label: string;
}

export interface DimensionPreview {
  readonly value: number;
  readonly unit: string;
  readonly label: string;
  readonly dimensionType: string;
  readonly fontScale?: boolean;
}

export interface DimensionComparison {
  readonly previous: DimensionPreview;
  readonly next: DimensionPreview;
  readonly delta: number;
  readonly unit: string;
  readonly percentChange?: number;
}

/**
 * Formats a collection of token pointers for presentation.
 *
 * @param pointers - The token pointers to display.
 * @returns The formatted pointer list.
 */
export function formatPointerList(pointers: readonly TokenPointer[]): string {
  if (pointers.length === 0) {
    return '[]';
  }

  const parts = pointers.map(
    (pointer) =>
      `{ uri: ${formatSingleQuoted(pointer.uri)}, pointer: ${formatSingleQuoted(pointer.pointer)} }`,
  );

  return `[${parts.join(', ')}]`;
}

/**
 * Formats a token source location into a readable path and position string.
 *
 * @param source - The token source metadata to format.
 * @returns The formatted source location.
 */
export function formatTokenSourceLocation(source: TokenSourceLocation): string {
  const path = formatTokenSourcePath(source);
  const position = `${source.line.toString()}:${source.column.toString()}`;

  if (path.length === 0) {
    return position;
  }

  return `${path}:${position}`;
}

function formatTokenSourcePath(source: TokenSourceLocation): string {
  const { uri } = source;

  if (!uri) {
    return '';
  }

  try {
    const parsed = new URL(uri);

    if (parsed.protocol === 'file:') {
      const pathname = decodeURIComponent(parsed.pathname);
      return pathname.startsWith('/') && pathname.length > 1 ? pathname : pathname;
    }

    return parsed.href;
  } catch {
    return uri.replace(/^file:\/\//, '');
  }
}

/**
 * Extracts colour metadata from a token snapshot when available.
 *
 * @param token - The token snapshot to inspect.
 * @returns The parsed colour information, if present.
 */
export function getTokenColor(token: TokenSnapshot): TokenColor | undefined {
  if (token.type === undefined || token.value === undefined) {
    return undefined;
  }

  if (token.type.toLowerCase() !== 'color') {
    return undefined;
  }

  const value = token.value;

  if (typeof value === 'string') {
    const instance = colord(value);
    return createTokenColorFromInstance(instance);
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const hex = record['hex'];

  if (typeof hex === 'string') {
    let instance = colord(hex);

    if (!instance.isValid()) {
      return undefined;
    }

    const alphaOverride = normalizeAlphaComponent(record['alpha']);

    if (alphaOverride !== undefined) {
      instance = instance.alpha(alphaOverride);
    }

    return createTokenColorFromInstance(instance);
  }

  const colorSpace =
    typeof record['colorSpace'] === 'string' ? (record['colorSpace'] as string) : undefined;
  const components = isReadonlyArray(record['components'])
    ? (record['components'] as readonly unknown[])
    : undefined;

  if (!colorSpace || !components || components.length < 3) {
    return undefined;
  }

  if (colorSpace.toLowerCase() !== 'srgb') {
    return undefined;
  }

  const red = normalizeSrgbComponent(components[0]);
  const green = normalizeSrgbComponent(components[1]);
  const blue = normalizeSrgbComponent(components[2]);

  if (red === undefined || green === undefined || blue === undefined) {
    return undefined;
  }

  const componentAlpha = normalizeAlphaComponent(components[3]);
  const overrideAlpha = normalizeAlphaComponent(record['alpha']);
  const alpha = overrideAlpha ?? componentAlpha;

  const instance = colord({
    r: red,
    g: green,
    b: blue,
    ...(alpha === undefined ? {} : { a: alpha }),
  });

  return createTokenColorFromInstance(instance);
}

function createTokenColorFromInstance(instance: Colord): TokenColor | undefined {
  if (!instance.isValid()) {
    return undefined;
  }

  const { r, g, b, a } = instance.toRgb();
  const alpha = clampAlpha(a ?? 1);
  const hex = instance.alpha(1).toHex().toUpperCase();

  return {
    hex,
    red: Math.round(r),
    green: Math.round(g),
    blue: Math.round(b),
    ...(alpha >= 1 ? {} : { alpha }),
  } satisfies TokenColor;
}

function normalizeSrgbComponent(component: unknown): number | undefined {
  if (typeof component !== 'number' || !Number.isFinite(component)) {
    return undefined;
  }

  const scaled = component >= 0 && component <= 1 ? component * 255 : component;

  if (!Number.isFinite(scaled)) {
    return undefined;
  }

  return clampByte(Math.round(scaled));
}

function normalizeAlphaComponent(alpha: unknown): number | undefined {
  if (typeof alpha !== 'number' || !Number.isFinite(alpha)) {
    return undefined;
  }

  if (alpha >= 0 && alpha <= 1) {
    return clampAlpha(alpha);
  }

  if (alpha >= 0 && alpha <= 255) {
    return clampAlpha(alpha / 255);
  }

  return undefined;
}

/**
 * Derives CSS preview information for typography tokens.
 *
 * @param token - The typography token snapshot to inspect.
 * @returns The preview declarations and label if derivable.
 */
export function getTypographyPreview(token: TokenSnapshot): TypographyPreview | undefined {
  if (!token.type || token.type.trim().length === 0) {
    return undefined;
  }

  if (token.type.trim().toLowerCase() !== 'typography') {
    return undefined;
  }

  if (!isRecord(token.value)) {
    return undefined;
  }

  const declarations: CssDeclaration[] = [];
  const labelParts: string[] = [];

  const valueRecord = token.value as Record<string, unknown>;

  const fontFamilies = normalizeTypographyFontFamilies(
    valueRecord['fontFamily'] ?? valueRecord['fontFamilies'],
  );

  if (fontFamilies && fontFamilies.length > 0) {
    declarations.push({
      name: 'font-family',
      value: formatCssFontFamily(fontFamilies),
    });
    labelParts.push(fontFamilies.join(', '));
  }

  const fontWeight = normalizeTypographyString(valueRecord['fontWeight'] ?? valueRecord['weight']);

  if (fontWeight) {
    declarations.push({ name: 'font-weight', value: fontWeight });
    labelParts.push(fontWeight);
  }

  const fontStyle = normalizeTypographyString(valueRecord['fontStyle']);

  if (fontStyle) {
    declarations.push({ name: 'font-style', value: fontStyle });
    labelParts.push(fontStyle);
  }

  const sizeLabelParts: string[] = [];

  const fontSize = normalizeTypographyDimension(valueRecord['fontSize'] ?? valueRecord['size']);

  if (fontSize) {
    declarations.push({ name: 'font-size', value: fontSize });
    sizeLabelParts.push(fontSize);
  }

  const lineHeight = normalizeTypographyDimension(
    valueRecord['lineHeight'] ?? valueRecord['leading'],
  );

  if (lineHeight) {
    declarations.push({ name: 'line-height', value: lineHeight });
    sizeLabelParts.push(lineHeight);
  }

  if (sizeLabelParts.length > 0) {
    labelParts.push(sizeLabelParts.join(' / '));
  }

  const letterSpacing = normalizeTypographyDimension(
    valueRecord['letterSpacing'] ?? valueRecord['tracking'],
  );

  if (letterSpacing) {
    declarations.push({ name: 'letter-spacing', value: letterSpacing });
    labelParts.push(`letter ${letterSpacing}`);
  }

  const textCase = normalizeTypographyString(
    valueRecord['textCase'] ?? valueRecord['textTransform'],
  );
  const textTransform = normalizeTextTransform(textCase);

  if (textTransform) {
    declarations.push({ name: 'text-transform', value: textTransform });
  }

  const textDecoration = normalizeTypographyString(valueRecord['textDecoration']);

  if (textDecoration) {
    declarations.push({ name: 'text-decoration', value: textDecoration });
    labelParts.push(textDecoration);
  }

  if (declarations.length === 0) {
    return undefined;
  }

  const label = labelParts.length > 0 ? labelParts.join(' · ') : 'Typography sample';

  return {
    declarations,
    label,
  };
}

/**
 * Derives preview information for dimension tokens.
 *
 * @param token - The dimension token snapshot to inspect.
 * @returns The preview metadata if available.
 */
export function getDimensionPreview(token: TokenSnapshot): DimensionPreview | undefined {
  if (!token.value) {
    return undefined;
  }

  if (!token.type || token.type.trim().length === 0) {
    return undefined;
  }

  const normalizedType = token.type.trim().toLowerCase();

  if (!DIMENSION_TOKEN_TYPES.has(normalizedType)) {
    return undefined;
  }

  const preview = createDimensionPreview(token.value);

  if (!preview) {
    return undefined;
  }

  return preview;
}

/**
 * Builds a comparison summary for dimension tokens present in both versions.
 *
 * @param previous - The baseline token snapshot.
 * @param next - The updated token snapshot.
 * @returns The comparison detailing previous, next, and delta values.
 */
export function getDimensionComparison(
  previous: TokenSnapshot,
  next: TokenSnapshot,
): DimensionComparison | undefined {
  const previousPreview = getDimensionPreview(previous);
  const nextPreview = getDimensionPreview(next);

  if (!previousPreview || !nextPreview) {
    return undefined;
  }

  if (
    previousPreview.unit !== nextPreview.unit ||
    previousPreview.fontScale !== nextPreview.fontScale
  ) {
    return undefined;
  }

  const delta = nextPreview.value - previousPreview.value;
  const percentChange =
    previousPreview.value === 0 ? undefined : (delta / previousPreview.value) * 100;

  return {
    previous: previousPreview,
    next: nextPreview,
    delta,
    unit: previousPreview.unit,
    ...(percentChange === undefined ? {} : { percentChange }),
  };
}

/**
 * Formats a number with its unit while preserving the sign.
 *
 * @param value - The numeric value to format.
 * @param unit - The associated unit string.
 * @returns The formatted dimension string.
 */
export function formatSignedDimension(value: number, unit: string): string {
  const sign = value >= 0 ? '+' : '-';
  const magnitude = formatNumeric(Math.abs(value));
  const suffix = unit.length > 0 ? unit : '';
  return `${sign}${magnitude}${suffix}`;
}

/**
 * Formats a fractional value as a signed percentage.
 *
 * @param value - The fractional value to convert.
 * @returns The formatted percentage string.
 */
export function formatSignedPercentage(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  const magnitude = formatNumeric(Math.abs(value));
  return `${sign}${magnitude}%`;
}

export interface TokenTypeGroup<T> {
  readonly key: string;
  readonly label: string;
  readonly entries: readonly T[];
}

/**
 * Normalises a token type string into a grouping key and display label.
 *
 * @param value - The raw token type string to normalise.
 * @returns The normalised token type metadata.
 */
export function normalizeTokenType(value: string | undefined): {
  key: string;
  label: string;
} {
  if (!value) {
    return { key: 'untyped', label: 'untyped' };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { key: 'untyped', label: 'untyped' };
  }

  const normalized = trimmed.toLowerCase();

  return { key: normalized, label: normalized };
}

/**
 * Groups entries by their token type using the normalised type label.
 *
 * @param entries - The entries to group.
 * @param getType - Selector returning the token type string for each entry.
 * @returns Groups keyed by token type with their corresponding entries.
 */
export function groupEntriesByTokenType<T>(
  entries: readonly T[],
  getType: (entry: T) => string | undefined,
): readonly TokenTypeGroup<T>[] {
  const groups = new Map<string, { label: string; entries: T[] }>();

  for (const entry of entries) {
    const { key, label } = normalizeTokenType(getType(entry));
    const bucket = groups.get(key);

    if (bucket) {
      bucket.entries.push(entry);
      continue;
    }

    groups.set(key, { label, entries: [entry] });
  }

  return [...groups.entries()]
    .map(
      ([key, bucket]): TokenTypeGroup<T> => ({
        key,
        label: bucket.label,
        entries: bucket.entries,
      }),
    )
    .toSorted((left, right) => left.label.localeCompare(right.label));
}

/**
 * Formats an alpha value between 0 and 1 as a percentage string.
 *
 * @param alpha - The alpha value to format.
 * @returns The formatted percentage.
 */
export function formatAlpha(alpha: number): string {
  const rounded = Math.round(alpha * 100) / 100;
  const text = rounded.toFixed(2);
  return text.replace(/\.00$/u, '').replace(/(\.\d)0$/u, '$1');
}

function isReadonlyArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

const DIMENSION_TOKEN_TYPES: ReadonlySet<string> = new Set([
  'dimension',
  'spacing',
  'sizing',
  'border-radius',
  'opacity',
  'lineheight',
  'line-height',
  'paragraph-spacing',
]);

function createDimensionPreview(value: unknown): DimensionPreview | undefined {
  const parsed = parseDimensionValue(value);

  if (!parsed) {
    return undefined;
  }

  return parsed;
}

function parseDimensionValue(value: unknown): DimensionPreview | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      value,
      unit: '',
      label: formatDimensionLabel(value, ''),
      dimensionType: 'length',
    };
  }

  if (typeof value === 'string') {
    return parseDimensionFromString(value);
  }

  if (isRecord(value)) {
    return parseDimensionFromRecord(value);
  }

  return undefined;
}

function parseDimensionFromString(value: string): DimensionPreview | undefined {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  const match = /^(-?\d+(?:\.\d+)?)([a-z%]*)$/iu.exec(trimmed);

  if (!match) {
    return undefined;
  }

  const numericText = match[1];
  const unitText = match[2];

  if (!numericText) {
    return undefined;
  }

  const numeric = Number.parseFloat(numericText);

  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  const unit = normalizeDimensionUnit(unitText);

  if (!isLengthUnit(unit)) {
    return undefined;
  }

  return {
    value: numeric,
    unit,
    label: formatDimensionLabel(numeric, unit),
    dimensionType: 'length',
  };
}

function parseDimensionFromRecord(record: Record<string, unknown>): DimensionPreview | undefined {
  const dimensionType = normalizeDimensionType(record['dimensionType']) ?? 'length';

  if (dimensionType !== 'length') {
    return undefined;
  }

  const fontScale = typeof record['fontScale'] === 'boolean' ? record['fontScale'] : undefined;

  const rawValue =
    record['value'] ??
    record['measure'] ??
    record['amount'] ??
    record['size'] ??
    record['number'] ??
    record['dimension'];

  const rawUnit =
    record['unit'] ?? record['units'] ?? record['measurement'] ?? record['dimensionUnit'];

  const unit = normalizeDimensionUnit(typeof rawUnit === 'string' ? rawUnit : undefined);

  if (!isLengthUnit(unit)) {
    return undefined;
  }

  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return {
      value: rawValue,
      unit,
      label: formatDimensionLabel(rawValue, unit),
      dimensionType,
      ...(fontScale === undefined ? {} : { fontScale }),
    };
  }

  if (typeof rawValue === 'string') {
    const parsed = parseDimensionFromString(rawValue);

    if (parsed) {
      if (unit.length > 0 && parsed.unit.length === 0) {
        return {
          value: parsed.value,
          unit,
          label: formatDimensionLabel(parsed.value, unit),
          dimensionType,
          ...(fontScale === undefined ? {} : { fontScale }),
        };
      }

      return {
        ...parsed,
        dimensionType,
        ...(fontScale === undefined ? {} : { fontScale }),
      };
    }
  }

  return undefined;
}

function normalizeDimensionUnit(unit: string | undefined): string {
  if (!unit) {
    return '';
  }

  const trimmed = unit.trim();

  if (trimmed.length === 0) {
    return '';
  }

  const lower = trimmed.toLowerCase();
  const normalized = DIMENSION_UNIT_ALIASES.get(lower);

  return normalized ?? lower;
}

function normalizeDimensionType(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.toLowerCase();
}

function isLengthUnit(unit: string): boolean {
  return LENGTH_UNITS.has(unit);
}

const DIMENSION_UNIT_ALIASES: ReadonlyMap<string, string> = new Map<string, string>([
  ['px', 'px'],
  ['pixel', 'px'],
  ['pixels', 'px'],
  ['pt', 'pt'],
  ['point', 'pt'],
  ['points', 'pt'],
  ['dp', 'dp'],
  ['rem', 'rem'],
  ['em', 'em'],
  ['vh', 'vh'],
  ['vw', 'vw'],
  ['percent', '%'],
  ['%', '%'],
  ['cm', 'cm'],
  ['mm', 'mm'],
  ['in', 'in'],
  ['inch', 'in'],
  ['inches', 'in'],
]);

const LENGTH_UNITS: ReadonlySet<string> = new Set([
  '',
  'px',
  'pt',
  'dp',
  'rem',
  'em',
  'vh',
  'vw',
  '%',
  'cm',
  'mm',
  'in',
]);

function formatDimensionLabel(value: number, unit: string): string {
  const magnitude = formatNumeric(value);
  return unit.length > 0 ? `${magnitude}${unit}` : magnitude;
}

function formatNumeric(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  const rounded = Math.round(value * 100) / 100;
  return rounded.toString();
}

function clampByte(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(255, value));
}

function formatSingleQuoted(value: string): string {
  const escaped = value
    .replaceAll(String.raw`\\`, String.raw`\\\\`)
    .replaceAll("'", String.raw`\\'`);
  return `'${escaped}'`;
}

function clampAlpha(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  const clamped = Math.max(0, Math.min(1, value));
  return clamped;
}

/**
 * Formats a token colour as a CSS colour string including alpha when present.
 *
 * @param color - The token colour to format.
 * @returns The CSS colour string.
 */
export function formatCssColor(color: TokenColor): string {
  const instance = colord({
    r: color.red,
    g: color.green,
    b: color.blue,
    ...(color.alpha === undefined ? {} : { a: color.alpha }),
  });

  if (!instance.isValid() || color.alpha === undefined || color.alpha >= 1) {
    return instance.isValid() ? instance.toHex().toUpperCase() : color.hex;
  }

  const { r, g, b, a } = instance.toRgb();
  const alpha = clampAlpha(a ?? color.alpha);
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${formatAlpha(alpha)})`;
}

/**
 * Formats a token colour into a descriptive label summarising its components.
 *
 * @param color - The token colour to describe.
 * @returns The formatted colour label.
 */
export function formatColorLabel(color: TokenColor): string {
  const instance = colord({
    r: color.red,
    g: color.green,
    b: color.blue,
    ...(color.alpha === undefined ? {} : { a: color.alpha }),
  });

  if (!instance.isValid()) {
    if (color.alpha === undefined || color.alpha >= 1) {
      return color.hex;
    }

    return `${color.hex}, alpha ${formatAlpha(color.alpha)}`;
  }

  const hex = instance.alpha(1).toHex().toUpperCase();

  if (color.alpha === undefined || color.alpha >= 1) {
    return hex;
  }

  const { a } = instance.toRgb();
  const alpha = clampAlpha(a ?? color.alpha);
  return `${hex}, alpha ${formatAlpha(alpha)}`;
}

function normalizeTypographyFontFamilies(value: unknown): readonly string[] | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    const families = value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return families.length > 0 ? families : undefined;
  }

  if (isReadonlyArray(value)) {
    const families = value
      .map((entry) => normalizeTypographyString(entry))
      .filter((entry): entry is string => entry !== undefined);

    return families.length > 0 ? families : undefined;
  }

  if (isRecord(value)) {
    return normalizeTypographyFontFamilies(value['value'] ?? value['$value']);
  }

  return undefined;
}

function normalizeTypographyString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function normalizeTypographyDimension(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (isRecord(value)) {
    const rawValue = value['value'] ?? value['$value'] ?? value['amount'];
    const unit = value['unit'] ?? value['$unit'];
    const normalizedValue = normalizeTypographyDimension(rawValue);

    if (!normalizedValue) {
      return undefined;
    }

    if (typeof unit === 'string') {
      const trimmedUnit = unit.trim();

      if (trimmedUnit.length > 0) {
        return `${normalizedValue}${trimmedUnit}`;
      }
    }

    return normalizedValue;
  }

  return undefined;
}

function normalizeTextTransform(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case 'uppercase':
    case 'lowercase':
    case 'capitalize':
    case 'none': {
      return normalized;
    }
    default: {
      return undefined;
    }
  }
}

function formatCssFontFamily(families: readonly string[]): string {
  return families
    .map((family) => formatCssFontFamilyName(family))
    .filter((family) => family.length > 0)
    .join(', ');
}

function formatCssFontFamilyName(family: string): string {
  const trimmed = family.trim();

  if (trimmed.length === 0) {
    return '';
  }

  if (/^[a-z0-9_-]+$/iu.test(trimmed)) {
    return trimmed;
  }

  const escaped = trimmed.replaceAll(/(["\\])/gu, String.raw`\\$1`);
  return `"${escaped}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return !Array.isArray(value);
}

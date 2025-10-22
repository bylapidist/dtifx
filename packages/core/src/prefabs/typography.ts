import {
  TokenPrefab,
  createInitialState,
  normaliseTokenPath,
  type TokenPathInput,
} from './token-prefab.js';
import type { TokenPath } from '../tokens/index.js';

export interface FontDimension {
  readonly dimensionType: 'length';
  readonly value: number;
  readonly unit: string;
  readonly fontScale?: boolean;
}

export type FontDimensionInput =
  | FontDimension
  | { readonly value: number; readonly unit: string; readonly fontScale?: boolean }
  | readonly [number, string];

export type FontMetric = FontDimension | 'normal';

export interface TypographyOptions {
  readonly typographyType?: string;
  readonly fontFamily: string;
  readonly fontSize: FontDimensionInput;
  readonly lineHeight?: number | FontDimensionInput;
  readonly letterSpacing?: FontMetric;
  readonly paragraphSpacing?: FontDimensionInput;
  readonly wordSpacing?: FontMetric;
  readonly fontWeight?: number | string;
  readonly fontStyle?: string;
}

export interface TypographyValue {
  readonly typographyType?: string;
  readonly fontFamily: string;
  readonly fontSize: FontDimension;
  readonly lineHeight?: number | FontDimension;
  readonly letterSpacing?: FontMetric;
  readonly paragraphSpacing?: FontDimension;
  readonly wordSpacing?: FontMetric;
  readonly fontWeight?: number | string;
  readonly fontStyle?: string;
}

export class TypographyTokenPrefab extends TokenPrefab<TypographyValue, TypographyTokenPrefab> {
  static create(path: TokenPathInput, options: TypographyOptions): TypographyTokenPrefab {
    const tokenPath = normaliseTokenPath(path);
    const value = normaliseTypography(options);
    return new TypographyTokenPrefab(tokenPath, createInitialState(value));
  }

  private constructor(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<TypographyValue>>,
  ) {
    super('typography', path, state);
  }

  protected create(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<TypographyValue>>,
  ): TypographyTokenPrefab {
    return new TypographyTokenPrefab(path, state);
  }

  get value(): TypographyValue {
    return this.state.value;
  }

  withTypographyType(type?: string): TypographyTokenPrefab {
    if (type === undefined) {
      return this.updateValue((value) => rebuildTypography(value, { clearTypographyType: true }));
    }

    return this.updateValue((value) =>
      rebuildTypography(value, { typographyType: normaliseTypographyType(type) }),
    );
  }

  withFontFamily(fontFamily: string): TypographyTokenPrefab {
    return this.updateValue((value) =>
      rebuildTypography(value, { fontFamily: normaliseFontFamily(fontFamily) }),
    );
  }

  withFontSize(fontSize: FontDimensionInput): TypographyTokenPrefab {
    return this.updateValue((value) =>
      rebuildTypography(value, { fontSize: normaliseFontDimension(fontSize) }),
    );
  }

  withLineHeight(lineHeight?: number | FontDimensionInput): TypographyTokenPrefab {
    if (lineHeight === undefined) {
      return this.updateValue((value) => rebuildTypography(value, { clearLineHeight: true }));
    }

    return this.updateValue((value) =>
      rebuildTypography(value, { lineHeight: normaliseLineHeight(lineHeight) }),
    );
  }

  withLetterSpacing(letterSpacing?: FontMetric): TypographyTokenPrefab {
    if (letterSpacing === undefined) {
      return this.updateValue((value) => rebuildTypography(value, { clearLetterSpacing: true }));
    }

    return this.updateValue((value) =>
      rebuildTypography(value, { letterSpacing: normaliseFontMetric(letterSpacing) }),
    );
  }

  withParagraphSpacing(spacing?: FontDimensionInput): TypographyTokenPrefab {
    if (spacing === undefined) {
      return this.updateValue((value) => rebuildTypography(value, { clearParagraphSpacing: true }));
    }

    return this.updateValue((value) =>
      rebuildTypography(value, { paragraphSpacing: normaliseFontDimension(spacing) }),
    );
  }

  withWordSpacing(wordSpacing?: FontMetric): TypographyTokenPrefab {
    if (wordSpacing === undefined) {
      return this.updateValue((value) => rebuildTypography(value, { clearWordSpacing: true }));
    }

    return this.updateValue((value) =>
      rebuildTypography(value, { wordSpacing: normaliseFontMetric(wordSpacing) }),
    );
  }

  withFontWeight(weight?: number | string): TypographyTokenPrefab {
    if (weight === undefined) {
      return this.updateValue((value) => rebuildTypography(value, { clearFontWeight: true }));
    }

    return this.updateValue((value) =>
      rebuildTypography(value, { fontWeight: normaliseFontWeight(weight) }),
    );
  }

  withFontStyle(style?: string): TypographyTokenPrefab {
    if (style === undefined) {
      return this.updateValue((value) => rebuildTypography(value, { clearFontStyle: true }));
    }

    return this.updateValue((value) =>
      rebuildTypography(value, { fontStyle: normaliseFontStyle(style) }),
    );
  }
}

export const Typography = {
  create: TypographyTokenPrefab.create,
};

interface TypographyOverrides {
  readonly typographyType?: string;
  readonly fontFamily?: string;
  readonly fontSize?: FontDimension;
  readonly lineHeight?: number | FontDimension;
  readonly letterSpacing?: FontMetric;
  readonly paragraphSpacing?: FontDimension;
  readonly wordSpacing?: FontMetric;
  readonly fontWeight?: number | string;
  readonly fontStyle?: string;
  readonly clearTypographyType?: boolean;
  readonly clearLineHeight?: boolean;
  readonly clearLetterSpacing?: boolean;
  readonly clearParagraphSpacing?: boolean;
  readonly clearWordSpacing?: boolean;
  readonly clearFontWeight?: boolean;
  readonly clearFontStyle?: boolean;
}

function rebuildTypography(
  value: TypographyValue,
  overrides: TypographyOverrides,
): TypographyValue {
  const typographyType =
    overrides.clearTypographyType === true
      ? undefined
      : (overrides.typographyType ?? value.typographyType);
  const lineHeight =
    overrides.clearLineHeight === true ? undefined : (overrides.lineHeight ?? value.lineHeight);
  const letterSpacing =
    overrides.clearLetterSpacing === true
      ? undefined
      : (overrides.letterSpacing ?? value.letterSpacing);
  const paragraphSpacing =
    overrides.clearParagraphSpacing === true
      ? undefined
      : (overrides.paragraphSpacing ?? value.paragraphSpacing);
  const wordSpacing =
    overrides.clearWordSpacing === true ? undefined : (overrides.wordSpacing ?? value.wordSpacing);
  const fontWeight =
    overrides.clearFontWeight === true ? undefined : (overrides.fontWeight ?? value.fontWeight);
  const fontStyle =
    overrides.clearFontStyle === true ? undefined : (overrides.fontStyle ?? value.fontStyle);

  return {
    fontFamily: overrides.fontFamily ?? value.fontFamily,
    fontSize: overrides.fontSize ?? value.fontSize,
    ...(typographyType === undefined ? {} : { typographyType }),
    ...(lineHeight === undefined ? {} : { lineHeight }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    ...(paragraphSpacing === undefined ? {} : { paragraphSpacing }),
    ...(wordSpacing === undefined ? {} : { wordSpacing }),
    ...(fontWeight === undefined ? {} : { fontWeight }),
    ...(fontStyle === undefined ? {} : { fontStyle }),
  };
}

function normaliseTypography(options: TypographyOptions): TypographyValue {
  const fontFamily = normaliseFontFamily(options.fontFamily);
  const fontSize = normaliseFontDimension(options.fontSize);

  const typographyType =
    options.typographyType === undefined
      ? undefined
      : normaliseTypographyType(options.typographyType);
  const lineHeight =
    options.lineHeight === undefined ? undefined : normaliseLineHeight(options.lineHeight);
  const letterSpacing =
    options.letterSpacing === undefined ? undefined : normaliseFontMetric(options.letterSpacing);
  const paragraphSpacing =
    options.paragraphSpacing === undefined
      ? undefined
      : normaliseFontDimension(options.paragraphSpacing);
  const wordSpacing =
    options.wordSpacing === undefined ? undefined : normaliseFontMetric(options.wordSpacing);
  const fontWeight =
    options.fontWeight === undefined ? undefined : normaliseFontWeight(options.fontWeight);
  const fontStyle =
    options.fontStyle === undefined ? undefined : normaliseFontStyle(options.fontStyle);

  return {
    fontFamily,
    fontSize,
    ...(typographyType === undefined ? {} : { typographyType }),
    ...(lineHeight === undefined ? {} : { lineHeight }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    ...(paragraphSpacing === undefined ? {} : { paragraphSpacing }),
    ...(wordSpacing === undefined ? {} : { wordSpacing }),
    ...(fontWeight === undefined ? {} : { fontWeight }),
    ...(fontStyle === undefined ? {} : { fontStyle }),
  };
}

function normaliseTypographyType(type: string): string {
  const trimmed = type.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Typography types cannot be empty.');
  }

  return trimmed.toLowerCase();
}

function normaliseFontFamily(family: string): string {
  const trimmed = family.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Font family cannot be empty.');
  }
  return trimmed;
}

function normaliseFontDimension(input: FontDimensionInput): FontDimension {
  if (Array.isArray(input)) {
    return createFontDimension(input[0], input[1]);
  }

  if (typeof input === 'object' && input !== null) {
    if ('dimensionType' in input) {
      return createFontDimension(input.value, input.unit, input.fontScale);
    }

    if ('value' in input && 'unit' in input) {
      return createFontDimension(
        input.value,
        input.unit,
        'fontScale' in input ? input.fontScale : undefined,
      );
    }
  }

  throw new TypeError('Font dimensions require a numeric value and unit.');
}

function createFontDimension(value: number, unit: string, fontScale?: boolean): FontDimension {
  const numericValue = Number.isFinite(value) ? value : 0;
  const trimmedUnit = unit.trim();
  if (trimmedUnit.length === 0) {
    throw new TypeError('Font dimensions require a unit.');
  }

  if (fontScale === undefined) {
    return {
      dimensionType: 'length',
      value: numericValue,
      unit: trimmedUnit.toLowerCase(),
    } satisfies FontDimension;
  }

  return {
    dimensionType: 'length',
    value: numericValue,
    unit: trimmedUnit.toLowerCase(),
    fontScale: Boolean(fontScale),
  } satisfies FontDimension;
}

function normaliseLineHeight(value: number | FontDimensionInput): number | FontDimension {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return Math.max(0, value);
    }

    return 1;
  }

  return normaliseFontDimension(value);
}

function normaliseFontMetric(metric: FontMetric): FontMetric {
  if (metric === 'normal') {
    return 'normal';
  }

  return normaliseFontDimension(metric);
}

function normaliseFontWeight(weight: number | string): number | string {
  if (typeof weight === 'number') {
    if (Number.isFinite(weight)) {
      return Math.max(0, weight);
    }

    return 400;
  }

  const trimmed = weight.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Font weight strings cannot be empty.');
  }
  return trimmed.toLowerCase();
}

function normaliseFontStyle(style: string): string {
  const trimmed = style.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Font style cannot be empty.');
  }
  return trimmed.toLowerCase();
}

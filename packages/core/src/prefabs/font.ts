import {
  TokenPrefab,
  createInitialState,
  normaliseTokenPath,
  type TokenPathInput,
} from './token-prefab.js';
import type { TokenPath } from '../tokens/index.js';

export interface FontMetrics {
  readonly ascent?: number;
  readonly descent?: number;
  readonly lineGap?: number;
  readonly unitsPerEm?: number;
}

export interface FontOptions {
  readonly fontType?: string;
  readonly family: string;
  readonly fallbacks?: Iterable<string>;
  readonly weight?: number | string;
  readonly style?: string;
  readonly display?: string;
  readonly metrics?: FontMetrics;
  readonly features?: Readonly<Record<string, string | number>>;
}

export interface FontValue {
  readonly fontType?: string;
  readonly family: string;
  readonly fallbacks: readonly string[];
  readonly weight?: number | string;
  readonly style?: string;
  readonly display?: string;
  readonly metrics?: FontMetrics;
  readonly features?: Readonly<Record<string, string | number>>;
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export class FontTokenPrefab extends TokenPrefab<FontValue, FontTokenPrefab> {
  static create(path: TokenPathInput, options: FontOptions): FontTokenPrefab {
    const tokenPath = normaliseTokenPath(path);
    const value = normaliseFontValue(options);
    return new FontTokenPrefab(tokenPath, createInitialState(value));
  }

  static fromFamily(
    path: TokenPathInput,
    family: string,
    fallbacks: Iterable<string> = [],
  ): FontTokenPrefab {
    return FontTokenPrefab.create(path, { family, fallbacks });
  }

  private constructor(path: TokenPath, state: ReturnType<typeof createInitialState<FontValue>>) {
    super('font', path, state);
  }

  protected create(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<FontValue>>,
  ): FontTokenPrefab {
    return new FontTokenPrefab(path, state);
  }

  get value(): FontValue {
    return this.state.value;
  }

  withFontType(fontType?: string): FontTokenPrefab {
    if (fontType === undefined) {
      return this.updateValue((current) =>
        rebuildFontValue(current, {
          clearFontType: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildFontValue(current, {
        fontType: normaliseFontType(fontType),
      }),
    );
  }

  withFamily(family: string): FontTokenPrefab {
    return this.updateValue((current) =>
      rebuildFontValue(current, {
        family: normaliseFontFamily(family),
      }),
    );
  }

  withFallbacks(fallbacks: Iterable<string>): FontTokenPrefab {
    return this.updateValue((current) =>
      rebuildFontValue(current, {
        fallbacks: normaliseFontFallbacks(fallbacks, current.family),
      }),
    );
  }

  addFallbacks(...fallbacks: readonly string[]): FontTokenPrefab {
    const combined = [...this.state.value.fallbacks, ...fallbacks];
    return this.withFallbacks(combined);
  }

  withWeight(weight?: number | string): FontTokenPrefab {
    if (weight === undefined) {
      return this.updateValue((current) =>
        rebuildFontValue(current, {
          clearWeight: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildFontValue(current, {
        weight: normaliseFontWeight(weight),
      }),
    );
  }

  withStyle(style?: string): FontTokenPrefab {
    if (style === undefined) {
      return this.updateValue((current) =>
        rebuildFontValue(current, {
          clearStyle: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildFontValue(current, {
        style: normaliseFontStyle(style),
      }),
    );
  }

  withDisplay(display?: string): FontTokenPrefab {
    if (display === undefined) {
      return this.updateValue((current) =>
        rebuildFontValue(current, {
          clearDisplay: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildFontValue(current, {
        display: normaliseFontDisplay(display),
      }),
    );
  }

  withMetrics(metrics?: FontMetrics): FontTokenPrefab {
    if (metrics === undefined) {
      return this.updateValue((current) =>
        rebuildFontValue(current, {
          clearMetrics: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildFontValue(current, {
        metrics: normaliseFontMetrics(metrics),
      }),
    );
  }

  withFeatures(features?: Readonly<Record<string, string | number>>): FontTokenPrefab {
    if (features === undefined) {
      return this.updateValue((current) =>
        rebuildFontValue(current, {
          clearFeatures: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildFontValue(current, {
        features: normaliseFontFeatures(features),
      }),
    );
  }

  setFeature(name: string, value: string | number | undefined): FontTokenPrefab {
    const featureName = normaliseFeatureName(name);

    if (value === undefined) {
      const existing = this.state.value.features ?? {};
      const remaining = { ...existing } as Record<string, string | number>;
      delete remaining[featureName];
      return this.withFeatures(Object.keys(remaining).length === 0 ? undefined : remaining);
    }

    return this.updateValue((current) => {
      const existing = current.features ?? {};
      const nextFeatures = {
        ...existing,
        [featureName]: normaliseFeatureValue(value),
      } as Readonly<Record<string, string | number>>;
      return rebuildFontValue(current, {
        features: normaliseFontFeatures(nextFeatures),
      });
    });
  }
}

export const Font = {
  create: FontTokenPrefab.create,
  fromFamily: FontTokenPrefab.fromFamily,
};

interface FontOverrides {
  readonly fontType?: string;
  readonly clearFontType?: boolean;
  readonly family?: string;
  readonly fallbacks?: readonly string[];
  readonly weight?: number | string;
  readonly clearWeight?: boolean;
  readonly style?: string;
  readonly clearStyle?: boolean;
  readonly display?: string;
  readonly clearDisplay?: boolean;
  readonly metrics?: FontMetrics;
  readonly clearMetrics?: boolean;
  readonly features?: Readonly<Record<string, string | number>>;
  readonly clearFeatures?: boolean;
}

function normaliseFontValue(options: FontOptions): FontValue {
  const family = normaliseFontFamily(options.family);
  const fallbacks = normaliseFontFallbacks(options.fallbacks ?? [], family);

  const result: Mutable<FontValue> = {
    family,
    fallbacks,
  };

  if (options.fontType !== undefined) {
    result.fontType = normaliseFontType(options.fontType);
  }

  if (options.weight !== undefined) {
    result.weight = normaliseFontWeight(options.weight);
  }

  if (options.style !== undefined) {
    result.style = normaliseFontStyle(options.style);
  }

  if (options.display !== undefined) {
    result.display = normaliseFontDisplay(options.display);
  }

  if (options.metrics !== undefined) {
    result.metrics = normaliseFontMetrics(options.metrics);
  }

  if (options.features !== undefined) {
    result.features = normaliseFontFeatures(options.features);
  }

  return result;
}

function rebuildFontValue(value: FontValue, overrides: FontOverrides): FontValue {
  const family = normaliseFontFamily(overrides.family ?? value.family);
  const fallbacks = normaliseFontFallbacks(overrides.fallbacks ?? value.fallbacks, family);

  let fontType = value.fontType;
  if (overrides.clearFontType === true) {
    fontType = undefined;
  } else if (overrides.fontType !== undefined) {
    fontType = normaliseFontType(overrides.fontType);
  }

  let weight = value.weight;
  if (overrides.clearWeight === true) {
    weight = undefined;
  } else if (overrides.weight !== undefined) {
    weight = normaliseFontWeight(overrides.weight);
  }

  let style = value.style;
  if (overrides.clearStyle === true) {
    style = undefined;
  } else if (overrides.style !== undefined) {
    style = normaliseFontStyle(overrides.style);
  }

  let display = value.display;
  if (overrides.clearDisplay === true) {
    display = undefined;
  } else if (overrides.display !== undefined) {
    display = normaliseFontDisplay(overrides.display);
  }

  let metrics = value.metrics;
  if (overrides.clearMetrics === true) {
    metrics = undefined;
  } else if (overrides.metrics !== undefined) {
    metrics = normaliseFontMetrics(overrides.metrics);
  }

  let features = value.features;
  if (overrides.clearFeatures === true) {
    features = undefined;
  } else if (overrides.features !== undefined) {
    features = normaliseFontFeatures(overrides.features);
  }

  const result: Mutable<FontValue> = {
    family,
    fallbacks,
  };

  if (fontType) {
    result.fontType = fontType;
  }

  if (weight !== undefined) {
    result.weight = weight;
  }

  if (style !== undefined) {
    result.style = style;
  }

  if (display !== undefined) {
    result.display = display;
  }

  if (metrics !== undefined) {
    result.metrics = metrics;
  }

  if (features !== undefined) {
    result.features = features;
  }

  return result;
}

function normaliseFontType(fontType: string): string {
  const trimmed = fontType.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Font type cannot be empty.');
  }
  return trimmed;
}

function normaliseFontFamily(family: string): string {
  const trimmed = family.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Font family cannot be empty.');
  }
  return trimmed;
}

function normaliseFontFallbacks(fallbacks: Iterable<string>, family?: string): readonly string[] {
  const unique = new Set<string>();
  for (const fallback of fallbacks) {
    const trimmed = fallback.trim();
    if (trimmed.length > 0 && trimmed !== family) {
      unique.add(trimmed);
    }
  }
  return [...unique];
}

function normaliseFontWeight(weight: number | string): number | string {
  if (typeof weight === 'number') {
    if (!Number.isFinite(weight)) {
      throw new TypeError('Font weight numbers must be finite.');
    }
    return weight;
  }

  const trimmed = weight.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Font weight strings cannot be empty.');
  }
  return trimmed;
}

function normaliseFontStyle(style: string): string {
  const trimmed = style.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Font style cannot be empty.');
  }
  return trimmed;
}

function normaliseFontDisplay(display: string): string {
  const trimmed = display.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Font display cannot be empty.');
  }
  return trimmed;
}

function normaliseFontMetrics(metrics: FontMetrics): FontMetrics {
  const ascent =
    metrics.ascent === undefined ? undefined : normaliseMetricNumber('ascent', metrics.ascent);
  const descent =
    metrics.descent === undefined ? undefined : normaliseMetricNumber('descent', metrics.descent);
  const lineGap =
    metrics.lineGap === undefined ? undefined : normaliseMetricNumber('lineGap', metrics.lineGap);
  const unitsPerEm =
    metrics.unitsPerEm === undefined
      ? undefined
      : normaliseMetricNumber('unitsPerEm', metrics.unitsPerEm);

  const result: FontMetrics = {
    ...(ascent === undefined ? {} : { ascent }),
    ...(descent === undefined ? {} : { descent }),
    ...(lineGap === undefined ? {} : { lineGap }),
    ...(unitsPerEm === undefined ? {} : { unitsPerEm }),
  };

  return result;
}

function normaliseMetricNumber(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return value;
}

function normaliseFontFeatures(
  features: Readonly<Record<string, string | number>>,
): Readonly<Record<string, string | number>> {
  const entries = Object.entries(features).map(
    ([featureName, featureValue]) =>
      [normaliseFeatureName(featureName), normaliseFeatureValue(featureValue)] as const,
  );
  return Object.fromEntries(entries);
}

function normaliseFeatureName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Font feature name cannot be empty.');
  }
  return trimmed;
}

function normaliseFeatureValue(value: string | number): string | number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Font feature values must be finite numbers.');
    }
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Font feature values cannot be empty.');
  }
  return trimmed;
}

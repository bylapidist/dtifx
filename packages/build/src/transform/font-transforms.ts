import { defineTransform } from './transform-registry.js';
import type { TransformDefinition } from './transform-registry.js';
import { TRANSFORM_GROUP_WEB_BASE } from './transform-groups.js';
import type { FontValue } from '../types/token-value-types.js';

export interface FontCssTransformOutput {
  readonly css: string;
  readonly family: string;
  readonly fallbacks?: readonly string[];
  readonly fontStyle?: string;
  readonly fontWeight?: string;
  readonly fontType?: string;
}

interface NormalisedFontValue {
  readonly family: string;
  readonly fallbacks?: readonly string[];
  readonly fontStyle?: string;
  readonly fontWeight?: string;
  readonly fontType: string;
}

export const fontToCssTransform = defineTransform({
  name: 'font.toCss',
  group: TRANSFORM_GROUP_WEB_BASE,
  selector: { types: ['font'] },
  run: ({ value }) => {
    const normalised = normaliseFontValue(value);
    if (!normalised) {
      return;
    }

    const families = [normalised.family, ...(normalised.fallbacks ?? [])];

    const css = families.join(', ');

    const extras: Partial<FontCssTransformOutput> = {};
    if (normalised.fallbacks) {
      Object.assign(extras, { fallbacks: normalised.fallbacks });
    }
    if (normalised.fontStyle) {
      Object.assign(extras, { fontStyle: normalised.fontStyle });
    }
    if (normalised.fontWeight) {
      Object.assign(extras, { fontWeight: normalised.fontWeight });
    }

    return {
      css,
      family: normalised.family,
      fontType: normalised.fontType,
      ...extras,
    } satisfies FontCssTransformOutput;
  },
});

/**
 * Builds the set of font transforms exposed to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of serialising font values.
 */
export function createFontTransforms(): readonly TransformDefinition[] {
  return [fontToCssTransform];
}

function normaliseFontValue(value: unknown): NormalisedFontValue | undefined {
  if (!isFontValue(value)) {
    return undefined;
  }

  const family = normaliseFamily(value.family);
  if (!family) {
    return undefined;
  }

  const fallbacks = normaliseFallbacks(value.fallbacks);
  const fontStyle = normaliseString(value.style);
  const fontWeight = normaliseWeight(value.weight);
  const fontType = normaliseString(value.fontType);

  if (!fontType) {
    return undefined;
  }

  return {
    family,
    ...(fallbacks ? { fallbacks } : {}),
    ...(fontStyle ? { fontStyle } : {}),
    ...(fontWeight ? { fontWeight } : {}),
    fontType,
  } satisfies NormalisedFontValue;
}

function isFontValue(value: unknown): value is FontValue {
  return Object(value) === value;
}

function normaliseFamily(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normaliseFallbacks(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const names = value
    .map((entry) => normaliseFamily(entry))
    .filter((entry): entry is string => entry !== undefined);

  return names.length > 0 ? names : undefined;
}

function normaliseString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normaliseWeight(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  return normaliseString(value);
}

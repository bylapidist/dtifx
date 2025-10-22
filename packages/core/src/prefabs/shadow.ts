import {
  TokenPrefab,
  createInitialState,
  normaliseTokenPath,
  type TokenPathInput,
} from './token-prefab.js';
import {
  darkenColorValue,
  lightenColorValue,
  toColorValue,
  type ColorLike,
  type ColorValue,
} from './color.js';
import type { TokenPath } from '../tokens/index.js';

export interface LengthDimension {
  readonly dimensionType: 'length';
  readonly value: number;
  readonly unit: string;
  readonly fontScale?: boolean;
}

export type LengthInput =
  | LengthDimension
  | { readonly value: number; readonly unit: string; readonly fontScale?: boolean }
  | readonly [number, string];

export interface ShadowLayer {
  readonly shadowType: string;
  readonly offsetX: LengthDimension;
  readonly offsetY: LengthDimension;
  readonly blur: LengthDimension;
  readonly spread?: LengthDimension;
  readonly color: ColorValue;
}

export type ShadowValue = readonly ShadowLayer[];

export interface ShadowLayerInput {
  readonly shadowType: string;
  readonly offsetX: LengthInput;
  readonly offsetY: LengthInput;
  readonly blur: LengthInput;
  readonly spread?: LengthInput;
  readonly color: ColorLike;
}

export class ShadowTokenPrefab extends TokenPrefab<ShadowValue, ShadowTokenPrefab> {
  static create(path: TokenPathInput, layers: readonly ShadowLayerInput[]): ShadowTokenPrefab {
    if (layers.length === 0) {
      throw new TypeError('Shadow tokens require at least one layer.');
    }

    const tokenPath = normaliseTokenPath(path);
    const value = normaliseShadowLayers(layers);
    return new ShadowTokenPrefab(tokenPath, createInitialState(value));
  }

  private constructor(path: TokenPath, state: ReturnType<typeof createInitialState<ShadowValue>>) {
    super('shadow', path, state);
  }

  protected create(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<ShadowValue>>,
  ): ShadowTokenPrefab {
    return new ShadowTokenPrefab(path, state);
  }

  get value(): ShadowValue {
    return this.state.value;
  }

  addLayer(layer: ShadowLayerInput): ShadowTokenPrefab {
    return this.updateValue((value) => [...value, normaliseShadowLayer(layer)]);
  }

  withLayers(layers: readonly ShadowLayerInput[]): ShadowTokenPrefab {
    if (layers.length === 0) {
      throw new TypeError('Shadow tokens require at least one layer.');
    }

    return this.updateValue(() => normaliseShadowLayers(layers));
  }

  lighten(amount: number): ShadowTokenPrefab {
    const delta = Math.abs(amount);
    return this.updateValue((value) =>
      value.map((layer) => ({
        ...layer,
        color: lightenColorValue(layer.color, delta),
      })),
    );
  }

  darken(amount: number): ShadowTokenPrefab {
    const delta = Math.abs(amount);
    return this.updateValue((value) =>
      value.map((layer) => ({
        ...layer,
        color: darkenColorValue(layer.color, delta),
      })),
    );
  }
}

export const Shadow = {
  create: ShadowTokenPrefab.create,
};

function normaliseShadowLayers(layers: readonly ShadowLayerInput[]): ShadowValue {
  return layers.map((layer) => normaliseShadowLayer(layer));
}

function normaliseShadowLayer(layer: ShadowLayerInput): ShadowLayer {
  const shadowType = normaliseShadowType(layer.shadowType);
  const offsetX = normaliseLength(layer.offsetX);
  const offsetY = normaliseLength(layer.offsetY);
  const blur = normaliseLength(layer.blur);
  const color = toColorValue(layer.color);

  if (layer.spread === undefined) {
    return {
      shadowType,
      offsetX,
      offsetY,
      blur,
      color,
    } satisfies ShadowLayer;
  }

  return {
    shadowType,
    offsetX,
    offsetY,
    blur,
    color,
    spread: normaliseLength(layer.spread),
  } satisfies ShadowLayer;
}

function normaliseShadowType(shadowType: string): string {
  const trimmed = shadowType.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Shadow types cannot be empty.');
  }
  return trimmed.toLowerCase();
}

function normaliseLength(input: LengthInput): LengthDimension {
  if (Array.isArray(input)) {
    return createLengthDimension(input[0], input[1]);
  }

  if (typeof input === 'object' && input !== null) {
    if ('dimensionType' in input) {
      return createLengthDimension(input.value, input.unit, input.fontScale);
    }

    if ('value' in input && 'unit' in input) {
      return createLengthDimension(
        input.value,
        input.unit,
        'fontScale' in input ? input.fontScale : undefined,
      );
    }
  }

  throw new TypeError('Shadow dimensions require a numeric value and unit.');
}

function createLengthDimension(value: number, unit: string, fontScale?: boolean): LengthDimension {
  const numericValue = Number.isFinite(value) ? value : 0;
  const trimmedUnit = unit.trim();
  if (trimmedUnit.length === 0) {
    throw new TypeError('Shadow dimensions require a unit.');
  }

  const dimension: LengthDimension = {
    dimensionType: 'length',
    value: numericValue,
    unit: trimmedUnit.toLowerCase(),
  };

  if (fontScale === undefined) {
    return dimension;
  }

  return {
    ...dimension,
    fontScale: Boolean(fontScale),
  } satisfies LengthDimension;
}

import {
  TokenPrefab,
  createInitialState,
  normaliseTokenPath,
  type TokenPathInput,
} from './token-prefab.js';
import type { TokenPath } from '../tokens/index.js';

export type PanelLayerKind = 'fill' | 'stroke' | 'shadow';

export interface PanelLayer {
  readonly kind: PanelLayerKind;
  readonly token: string;
  readonly opacity?: number;
  readonly width?: number;
}

export type PanelLayerInput = PanelLayer;

export interface PanelSpace {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type PanelSpaceInput =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | PanelSpace;

export interface PanelOptions {
  readonly panelType?: string;
  readonly layers?: Iterable<PanelLayerInput>;
  readonly radius?: PanelSpaceInput;
  readonly padding?: PanelSpaceInput;
}

export interface PanelValue {
  readonly panelType?: string;
  readonly layers: readonly PanelLayer[];
  readonly radius?: PanelSpace;
  readonly padding?: PanelSpace;
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export class PanelTokenPrefab extends TokenPrefab<PanelValue, PanelTokenPrefab> {
  static create(path: TokenPathInput, options: PanelOptions = {}): PanelTokenPrefab {
    const tokenPath = normaliseTokenPath(path);
    const value = normalisePanelValue(options);
    return new PanelTokenPrefab(tokenPath, createInitialState(value));
  }

  private constructor(path: TokenPath, state: ReturnType<typeof createInitialState<PanelValue>>) {
    super('panel', path, state);
  }

  protected create(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<PanelValue>>,
  ): PanelTokenPrefab {
    return new PanelTokenPrefab(path, state);
  }

  get value(): PanelValue {
    return this.state.value;
  }

  withPanelType(panelType?: string): PanelTokenPrefab {
    if (panelType === undefined) {
      return this.updateValue((current) =>
        rebuildPanelValue(current, {
          clearPanelType: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildPanelValue(current, {
        panelType: normalisePanelType(panelType),
      }),
    );
  }

  withLayers(layers: Iterable<PanelLayerInput>): PanelTokenPrefab {
    return this.updateValue((current) =>
      rebuildPanelValue(current, {
        layers: normalisePanelLayers(layers),
      }),
    );
  }

  addLayer(layer: PanelLayerInput): PanelTokenPrefab {
    const combined = [...this.state.value.layers, layer];
    return this.withLayers(combined);
  }

  withRadius(radius?: PanelSpaceInput): PanelTokenPrefab {
    if (radius === undefined) {
      return this.updateValue((current) =>
        rebuildPanelValue(current, {
          clearRadius: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildPanelValue(current, {
        radius: normalisePanelSpace(radius, 'radius'),
      }),
    );
  }

  withPadding(padding?: PanelSpaceInput): PanelTokenPrefab {
    if (padding === undefined) {
      return this.updateValue((current) =>
        rebuildPanelValue(current, {
          clearPadding: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildPanelValue(current, {
        padding: normalisePanelSpace(padding, 'padding'),
      }),
    );
  }
}

export const Panel = {
  create: PanelTokenPrefab.create,
};

interface PanelOverrides {
  readonly panelType?: string;
  readonly clearPanelType?: boolean;
  readonly layers?: readonly PanelLayer[];
  readonly radius?: PanelSpace;
  readonly clearRadius?: boolean;
  readonly padding?: PanelSpace;
  readonly clearPadding?: boolean;
}

function normalisePanelValue(options: PanelOptions): PanelValue {
  const layers = normalisePanelLayers(options.layers ?? []);

  const result: Mutable<PanelValue> = {
    layers,
  };

  if (options.panelType !== undefined) {
    result.panelType = normalisePanelType(options.panelType);
  }

  if (options.radius !== undefined) {
    result.radius = normalisePanelSpace(options.radius, 'radius');
  }

  if (options.padding !== undefined) {
    result.padding = normalisePanelSpace(options.padding, 'padding');
  }

  return result;
}

function rebuildPanelValue(value: PanelValue, overrides: PanelOverrides): PanelValue {
  let panelType = value.panelType;
  if (overrides.clearPanelType === true) {
    panelType = undefined;
  } else if (overrides.panelType !== undefined) {
    panelType = normalisePanelType(overrides.panelType);
  }

  const layers = normalisePanelLayers(overrides.layers ?? value.layers);

  let radius = value.radius;
  if (overrides.clearRadius === true) {
    radius = undefined;
  } else if (overrides.radius !== undefined) {
    radius = normalisePanelSpace(overrides.radius, 'radius');
  }

  let padding = value.padding;
  if (overrides.clearPadding === true) {
    padding = undefined;
  } else if (overrides.padding !== undefined) {
    padding = normalisePanelSpace(overrides.padding, 'padding');
  }

  const result: Mutable<PanelValue> = {
    layers,
  };

  if (panelType !== undefined) {
    result.panelType = panelType;
  }

  if (radius !== undefined) {
    result.radius = radius;
  }

  if (padding !== undefined) {
    result.padding = padding;
  }

  return result;
}

function normalisePanelType(panelType: string): string {
  const trimmed = panelType.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Panel type cannot be empty.');
  }
  return trimmed;
}

function normalisePanelLayers(layers: Iterable<PanelLayerInput>): readonly PanelLayer[] {
  const result: PanelLayer[] = [];
  for (const layer of layers) {
    result.push(normalisePanelLayer(layer));
  }
  return result;
}

function normalisePanelLayer(layer: PanelLayerInput): PanelLayer {
  const result: Mutable<PanelLayer> = {
    kind: normaliseLayerKind(layer.kind),
    token: normaliseLayerToken(layer.token),
  };

  if (layer.opacity !== undefined) {
    result.opacity = normaliseOpacity(layer.opacity);
  }

  if (layer.width !== undefined) {
    result.width = normaliseLayerWidth(layer.width);
  }

  return result;
}

function normaliseLayerKind(kind: PanelLayerKind): PanelLayerKind {
  if (kind !== 'fill' && kind !== 'stroke' && kind !== 'shadow') {
    throw new TypeError(`Unsupported panel layer kind: ${kind}`);
  }
  return kind;
}

function normaliseLayerToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Panel layer tokens cannot be empty.');
  }
  return trimmed;
}

function normaliseOpacity(opacity: number): number {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new TypeError('Panel layer opacity must be a finite number between 0 and 1.');
  }
  return opacity;
}

function normaliseLayerWidth(width: number): number {
  if (!Number.isFinite(width) || width < 0) {
    throw new TypeError('Panel layer width must be a non-negative finite number.');
  }
  return width;
}

function normalisePanelSpace(input: PanelSpaceInput, label: 'radius' | 'padding'): PanelSpace {
  if (typeof input === 'number') {
    return createPanelSpace(input, input, input, input);
  }

  if (Array.isArray(input)) {
    if (input.length === 2) {
      const [vertical, horizontal] = input;
      return createPanelSpace(vertical, horizontal, vertical, horizontal);
    }

    if (input.length === 3) {
      const [top, horizontal, bottom] = input;
      return createPanelSpace(top, horizontal, bottom, horizontal);
    }

    if (input.length === 4) {
      const [top, right, bottom, left] = input;
      return createPanelSpace(top, right, bottom, left);
    }

    throw new TypeError(`Panel ${label} arrays must contain 2, 3, or 4 entries.`);
  }

  if (isPanelSpace(input)) {
    return createPanelSpace(input.top, input.right, input.bottom, input.left);
  }

  throw new TypeError(`Unsupported panel ${label} value.`);
}

function createPanelSpace(top: number, right: number, bottom: number, left: number): PanelSpace {
  return {
    top: normaliseSpaceDimension('top', top),
    right: normaliseSpaceDimension('right', right),
    bottom: normaliseSpaceDimension('bottom', bottom),
    left: normaliseSpaceDimension('left', left),
  } satisfies PanelSpace;
}

function normaliseSpaceDimension(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`Panel ${name} value must be a non-negative finite number.`);
  }
  return value;
}

function isPanelSpace(value: unknown): value is PanelSpace {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    'top' in candidate &&
    'right' in candidate &&
    'bottom' in candidate &&
    'left' in candidate &&
    typeof candidate['top'] === 'number' &&
    typeof candidate['right'] === 'number' &&
    typeof candidate['bottom'] === 'number' &&
    typeof candidate['left'] === 'number'
  );
}

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

export type GradientType = 'linear' | 'radial' | 'conic';
export type GradientPosition = number | string;

export interface GradientStop {
  readonly position: GradientPosition;
  readonly color: ColorValue;
  readonly hint?: GradientPosition;
}

export interface GradientStopInput {
  readonly position: GradientPosition;
  readonly color: ColorLike;
  readonly hint?: GradientPosition;
}

export interface GradientOptions {
  readonly angle?: number | string;
  readonly center?: GradientCenterInput;
  readonly shape?: string;
}

export type GradientCenter = { readonly x: number; readonly y: number } | string;
export type GradientCenterInput = GradientCenter;

export interface GradientValue {
  readonly gradientType: GradientType;
  readonly stops: readonly GradientStop[];
  readonly angle?: number | string;
  readonly center?: GradientCenter;
  readonly shape?: string;
}

export class GradientTokenPrefab extends TokenPrefab<GradientValue, GradientTokenPrefab> {
  static create(
    path: TokenPathInput,
    gradientType: GradientType,
    stops: readonly GradientStopInput[],
    options: GradientOptions = {},
  ): GradientTokenPrefab {
    const tokenPath = normaliseTokenPath(path);
    const value = normaliseGradientValue(gradientType, stops, options);
    return new GradientTokenPrefab(tokenPath, createInitialState(value));
  }

  static linear(
    path: TokenPathInput,
    stops: readonly GradientStopInput[],
    options: GradientOptions = {},
  ): GradientTokenPrefab {
    return GradientTokenPrefab.create(path, 'linear', stops, options);
  }

  static radial(
    path: TokenPathInput,
    stops: readonly GradientStopInput[],
    options: GradientOptions = {},
  ): GradientTokenPrefab {
    return GradientTokenPrefab.create(path, 'radial', stops, options);
  }

  static conic(
    path: TokenPathInput,
    stops: readonly GradientStopInput[],
    options: GradientOptions = {},
  ): GradientTokenPrefab {
    return GradientTokenPrefab.create(path, 'conic', stops, options);
  }

  private constructor(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<GradientValue>>,
  ) {
    super('gradient', path, state);
  }

  protected create(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<GradientValue>>,
  ): GradientTokenPrefab {
    return new GradientTokenPrefab(path, state);
  }

  get value(): GradientValue {
    return this.state.value;
  }

  addStop(stop: GradientStopInput): GradientTokenPrefab {
    return this.updateValue((value) =>
      rebuildGradient(value, {
        stops: [...value.stops, normaliseStop(stop)],
      }),
    );
  }

  withStops(stops: readonly GradientStopInput[]): GradientTokenPrefab {
    return this.updateValue((value) =>
      rebuildGradient(value, {
        stops: normaliseStops(stops),
      }),
    );
  }

  withAngle(angle?: number | string): GradientTokenPrefab {
    if (angle === undefined) {
      return this.updateValue((value) => rebuildGradient(value, { clearAngle: true }));
    }

    return this.updateValue((value) =>
      rebuildGradient(value, {
        angle: normaliseAngle(angle),
      }),
    );
  }

  withCenter(center?: GradientCenterInput): GradientTokenPrefab {
    if (center === undefined) {
      return this.updateValue((value) => rebuildGradient(value, { clearCenter: true }));
    }

    return this.updateValue((value) =>
      rebuildGradient(value, {
        center: normaliseCenter(center),
      }),
    );
  }

  withShape(shape?: string): GradientTokenPrefab {
    if (shape === undefined) {
      return this.updateValue((value) => rebuildGradient(value, { clearShape: true }));
    }

    return this.updateValue((value) =>
      rebuildGradient(value, {
        shape: normaliseShape(shape),
      }),
    );
  }

  lighten(amount: number): GradientTokenPrefab {
    const delta = Math.abs(amount);
    return this.updateValue((value) =>
      rebuildGradient(value, {
        stops: value.stops.map((stop) => ({
          ...stop,
          color: lightenColorValue(stop.color, delta),
        })),
      }),
    );
  }

  darken(amount: number): GradientTokenPrefab {
    const delta = Math.abs(amount);
    return this.updateValue((value) =>
      rebuildGradient(value, {
        stops: value.stops.map((stop) => ({
          ...stop,
          color: darkenColorValue(stop.color, delta),
        })),
      }),
    );
  }
}

export const Gradient = {
  create: GradientTokenPrefab.create,
  linear: GradientTokenPrefab.linear,
  radial: GradientTokenPrefab.radial,
  conic: GradientTokenPrefab.conic,
};

function normaliseGradientValue(
  gradientType: GradientType,
  stops: readonly GradientStopInput[],
  options: GradientOptions,
): GradientValue {
  if (stops.length < 2) {
    throw new TypeError('Gradients require at least two color stops.');
  }

  const normalisedStops = normaliseStops(stops);
  const angle = options.angle === undefined ? undefined : normaliseAngle(options.angle);
  const center = options.center === undefined ? undefined : normaliseCenter(options.center);
  const shape = options.shape === undefined ? undefined : normaliseShape(options.shape);

  return {
    gradientType,
    stops: normalisedStops,
    ...(angle === undefined ? {} : { angle }),
    ...(center === undefined ? {} : { center }),
    ...(shape === undefined ? {} : { shape }),
  };
}

function normaliseStops(stops: readonly GradientStopInput[]): readonly GradientStop[] {
  return sortGradientStops(stops.map((stop) => normaliseStop(stop)));
}

function normaliseStop(stop: GradientStopInput): GradientStop {
  const position = normalisePosition(stop.position);
  const color = toColorValue(stop.color);

  if (stop.hint === undefined) {
    return {
      position,
      color,
    } satisfies GradientStop;
  }

  return {
    position,
    color,
    hint: normalisePosition(stop.hint),
  } satisfies GradientStop;
}

function normalisePosition(position: GradientPosition): GradientPosition {
  if (typeof position === 'number') {
    return clamp01(position);
  }

  const trimmed = position.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Gradient positions cannot be empty strings.');
  }

  return trimmed;
}

function normaliseAngle(angle: number | string): number | string {
  if (typeof angle === 'number') {
    if (Number.isFinite(angle)) {
      return angle;
    }

    throw new TypeError('Gradient angles must be finite numbers.');
  }

  const trimmed = angle.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Gradient angles cannot be empty strings.');
  }
  return trimmed;
}

function normaliseCenter(center: GradientCenterInput): GradientCenter {
  if (typeof center === 'string') {
    const trimmed = center.trim();
    if (trimmed.length === 0) {
      throw new TypeError('Gradient center strings cannot be empty.');
    }
    return trimmed;
  }

  const x = normaliseCoordinate(center.x);
  const y = normaliseCoordinate(center.y);
  return { x, y };
}

function normaliseShape(shape: string): string {
  const trimmed = shape.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Gradient shapes cannot be empty.');
  }
  return trimmed.toLowerCase();
}

function normaliseCoordinate(value: number): number {
  if (Number.isFinite(value)) {
    return value;
  }

  return 0;
}

interface GradientOverrides {
  readonly stops?: readonly GradientStop[];
  readonly angle?: number | string;
  readonly center?: GradientCenter;
  readonly shape?: string;
  readonly clearAngle?: boolean;
  readonly clearCenter?: boolean;
  readonly clearShape?: boolean;
}

function rebuildGradient(value: GradientValue, overrides: GradientOverrides): GradientValue {
  const stops = overrides.stops ? sortGradientStops(overrides.stops) : value.stops;
  const angle = overrides.clearAngle === true ? undefined : (overrides.angle ?? value.angle);
  const center = overrides.clearCenter === true ? undefined : (overrides.center ?? value.center);
  const shape = overrides.clearShape === true ? undefined : (overrides.shape ?? value.shape);

  return {
    gradientType: value.gradientType,
    stops,
    ...(angle === undefined ? {} : { angle }),
    ...(center === undefined ? {} : { center }),
    ...(shape === undefined ? {} : { shape }),
  };
}

function sortGradientStops(stops: readonly GradientStop[]): readonly GradientStop[] {
  return [...stops].toSorted((left, right) =>
    compareGradientPositions(left.position, right.position),
  );
}

function compareGradientPositions(left: GradientPosition, right: GradientPosition): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return 0;
}

function clamp01(value: number): number {
  if (Number.isFinite(value)) {
    if (value <= 0) {
      return 0;
    }

    if (value >= 1) {
      return 1;
    }

    return value;
  }

  return 0;
}

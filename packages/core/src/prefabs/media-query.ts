import {
  TokenPrefab,
  createInitialState,
  normaliseTokenPath,
  type TokenPathInput,
} from './token-prefab.js';
import type { TokenPath } from '../tokens/index.js';

export type MediaConstraintComparison = 'min' | 'max' | 'exact';

export interface MediaQueryConstraintInput {
  readonly feature: string;
  readonly value?: string | number;
  readonly unit?: string;
  readonly comparison?: MediaConstraintComparison;
}

export interface MediaQueryConstraint {
  readonly feature: string;
  readonly value?: string | number;
  readonly unit?: string;
  readonly comparison: MediaConstraintComparison;
}

export interface MediaQueryOptions {
  readonly mediaType?: string;
  readonly constraints?: Iterable<MediaQueryConstraintInput>;
}

export interface MediaQueryValue {
  readonly mediaType?: string;
  readonly constraints: readonly MediaQueryConstraint[];
  readonly query: string;
}

export interface WidthRangeOptions {
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export class MediaQueryTokenPrefab extends TokenPrefab<MediaQueryValue, MediaQueryTokenPrefab> {
  static create(path: TokenPathInput, options: MediaQueryOptions = {}): MediaQueryTokenPrefab {
    const tokenPath = normaliseTokenPath(path);
    const value = normaliseMediaQueryValue(options);
    return new MediaQueryTokenPrefab(tokenPath, createInitialState(value));
  }

  static forWidthRange(
    path: TokenPathInput,
    options: WidthRangeOptions & Omit<MediaQueryOptions, 'constraints'> = {},
  ): MediaQueryTokenPrefab {
    const constraints: MediaQueryConstraintInput[] = [];
    if (options.min !== undefined) {
      constraints.push({
        feature: 'width',
        comparison: 'min',
        value: options.min,
        unit: options.unit ?? 'px',
      });
    }
    if (options.max !== undefined) {
      constraints.push({
        feature: 'width',
        comparison: 'max',
        value: options.max,
        unit: options.unit ?? 'px',
      });
    }

    if (constraints.length === 0) {
      throw new TypeError('Width range prefabs require at least a min or max value.');
    }

    const createOptions: Mutable<Partial<MediaQueryOptions>> = {};
    createOptions.constraints = constraints;

    if (options.mediaType !== undefined) {
      createOptions.mediaType = options.mediaType;
    }

    return MediaQueryTokenPrefab.create(path, createOptions as MediaQueryOptions);
  }

  private constructor(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<MediaQueryValue>>,
  ) {
    super('media-query', path, state);
  }

  protected create(
    path: TokenPath,
    state: ReturnType<typeof createInitialState<MediaQueryValue>>,
  ): MediaQueryTokenPrefab {
    return new MediaQueryTokenPrefab(path, state);
  }

  get value(): MediaQueryValue {
    return this.state.value;
  }

  withMediaType(mediaType?: string): MediaQueryTokenPrefab {
    if (mediaType === undefined) {
      return this.updateValue((current) =>
        rebuildMediaQueryValue(current, {
          clearMediaType: true,
        }),
      );
    }

    return this.updateValue((current) =>
      rebuildMediaQueryValue(current, {
        mediaType: normaliseMediaType(mediaType),
      }),
    );
  }

  withConstraints(constraints: Iterable<MediaQueryConstraintInput>): MediaQueryTokenPrefab {
    return this.updateValue((current) =>
      rebuildMediaQueryValue(current, {
        constraints: normaliseConstraints(constraints),
      }),
    );
  }

  addConstraint(constraint: MediaQueryConstraintInput): MediaQueryTokenPrefab {
    const combined = [...this.state.value.constraints, normaliseConstraint(constraint)];
    return this.withConstraints(combined);
  }

  withWidthRange(options: WidthRangeOptions): MediaQueryTokenPrefab {
    const constraints: MediaQueryConstraintInput[] = [];
    const unit = options.unit ?? 'px';

    if (options.min !== undefined) {
      constraints.push({ feature: 'width', comparison: 'min', value: options.min, unit });
    }

    if (options.max !== undefined) {
      constraints.push({ feature: 'width', comparison: 'max', value: options.max, unit });
    }

    if (constraints.length === 0) {
      throw new TypeError('Width ranges require at least a min or max value.');
    }

    const existing = this.state.value.constraints.filter(
      (constraint) => constraint.feature !== 'width',
    );
    return this.withConstraints([...existing, ...constraints]);
  }
}

export const MediaQuery = {
  create: MediaQueryTokenPrefab.create,
  forWidthRange: MediaQueryTokenPrefab.forWidthRange,
};

interface MediaQueryOverrides {
  readonly mediaType?: string;
  readonly constraints?: readonly MediaQueryConstraint[];
  readonly clearMediaType?: boolean;
}

/**
 * Validates whether a candidate media feature name conforms to CSS naming conventions.
 *
 * @param feature - The feature string to validate.
 * @returns `true` when the name is syntactically valid.
 */
export function isValidMediaFeatureName(feature: string): boolean {
  return /^[a-z][a-z0-9-]*$/iu.test(feature.trim());
}

function normaliseMediaQueryValue(options: MediaQueryOptions): MediaQueryValue {
  const mediaType =
    options.mediaType === undefined ? undefined : normaliseMediaType(options.mediaType);
  const constraints = normaliseConstraints(options.constraints ?? []);
  const query = buildMediaQuery(mediaType, constraints);

  const result: Mutable<MediaQueryValue> = {
    constraints,
    query,
  };

  if (mediaType !== undefined) {
    result.mediaType = mediaType;
  }

  return result;
}

function rebuildMediaQueryValue(
  value: MediaQueryValue,
  overrides: MediaQueryOverrides,
): MediaQueryValue {
  let mediaType = value.mediaType;
  if (overrides.clearMediaType === true) {
    mediaType = undefined;
  } else if (overrides.mediaType !== undefined) {
    mediaType = normaliseMediaType(overrides.mediaType);
  }

  const constraints = overrides.constraints ?? value.constraints;
  const query = buildMediaQuery(mediaType, constraints);

  const result: Mutable<MediaQueryValue> = {
    constraints,
    query,
  };

  if (mediaType !== undefined) {
    result.mediaType = mediaType;
  }

  return result;
}

function normaliseMediaType(mediaType: string): string {
  const trimmed = mediaType.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Media types cannot be empty.');
  }
  return trimmed;
}

function normaliseConstraints(
  constraints: Iterable<MediaQueryConstraintInput>,
): readonly MediaQueryConstraint[] {
  const result: MediaQueryConstraint[] = [];
  for (const constraint of constraints) {
    result.push(normaliseConstraint(constraint));
  }
  return result;
}

function normaliseConstraint(constraint: MediaQueryConstraintInput): MediaQueryConstraint {
  const feature = normaliseFeature(constraint.feature);
  const comparison = constraint.comparison ?? 'exact';

  if (comparison !== 'exact' && comparison !== 'min' && comparison !== 'max') {
    throw new TypeError(`Unsupported media constraint comparison: ${comparison}`);
  }

  const value =
    constraint.value === undefined ? undefined : normaliseConstraintValue(constraint.value);
  const unit = constraint.unit === undefined ? undefined : normaliseUnit(constraint.unit);

  if ((comparison === 'min' || comparison === 'max') && value === undefined) {
    throw new TypeError(`${comparison}-constraints require a value.`);
  }

  const result: Mutable<MediaQueryConstraint> = {
    feature,
    comparison,
  };

  if (value !== undefined) {
    result.value = value;
  }

  if (unit !== undefined) {
    result.unit = unit;
  }

  return result;
}

function normaliseFeature(feature: string): string {
  const trimmed = feature.trim();
  if (!isValidMediaFeatureName(trimmed)) {
    throw new TypeError(`Invalid media feature name: ${feature}`);
  }
  return trimmed.toLowerCase();
}

function normaliseConstraintValue(value: string | number): string | number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Media constraint numbers must be finite.');
    }
    return value;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Media constraint values cannot be empty.');
  }
  return trimmed;
}

function normaliseUnit(unit: string): string {
  const trimmed = unit.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Media constraint units cannot be empty.');
  }
  return trimmed;
}

function buildMediaQuery(
  mediaType: string | undefined,
  constraints: readonly MediaQueryConstraint[],
): string {
  const type = mediaType ?? 'all';
  if (constraints.length === 0) {
    return type;
  }

  const parts = constraints.map((constraint) => formatConstraint(constraint));
  return `${type} and ${parts.join(' and ')}`;
}

function formatConstraint(constraint: MediaQueryConstraint): string {
  const { feature, comparison, value, unit } = constraint;
  if (comparison === 'exact') {
    if (value === undefined) {
      return `(${feature})`;
    }
    return `(${feature}: ${formatConstraintValue(value, unit)})`;
  }

  if (value === undefined) {
    throw new TypeError(`${comparison}-constraints require a value.`);
  }

  return `(${comparison}-${feature}: ${formatConstraintValue(value, unit)})`;
}

function formatConstraintValue(value: string | number, unit: string | undefined): string {
  if (typeof value === 'number') {
    return `${value}${unit ?? ''}`;
  }
  return unit ? `${value}${unit}` : value;
}

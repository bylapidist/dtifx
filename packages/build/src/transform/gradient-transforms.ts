import { defineTransform } from './transform-registry.js';
import type { TransformDefinition } from './transform-registry.js';
import {
  TRANSFORM_GROUP_ANDROID_MATERIAL,
  TRANSFORM_GROUP_IOS_SWIFTUI,
  TRANSFORM_GROUP_WEB_BASE,
} from './transform-groups.js';
import type { GradientValue } from '../types/token-value-types.js';
import type { TokenSnapshot } from '../session/resolution-session.js';
import { resolveColorCssMetadata } from './color-reference.js';

export interface GradientCssTransformOutput {
  readonly css: string;
}

export interface GradientSwiftUiStopOutput {
  readonly color: string;
  readonly location?: number;
  readonly easing?: string;
}

export interface GradientSwiftUiTransformOutput {
  readonly kind: 'linear' | 'radial' | 'conic';
  readonly angle?: number;
  readonly stops: readonly GradientSwiftUiStopOutput[];
}

export interface GradientAndroidMaterialStopOutput {
  readonly color: string;
  readonly position?: number;
  readonly easing?: string;
}

export interface GradientAndroidMaterialTransformOutput {
  readonly kind: 'linear' | 'radial' | 'conic';
  readonly angle?: number;
  readonly stops: readonly GradientAndroidMaterialStopOutput[];
}

/**
 * Transform definition that converts gradient tokens into CSS gradients.
 */
export const gradientToCssTransform = defineTransform({
  name: 'gradient.toCss',
  group: TRANSFORM_GROUP_WEB_BASE,
  selector: { types: ['gradient'] },
  run: ({ value, snapshot }) => {
    if (!isGradientValue(value)) {
      return;
    }

    const gradient = value as GradientTransformValue;

    const formattedStops = gradient.stops
      .map((stop, index) => {
        const position = formatCssStopPosition(stop.position);
        const suffix = position === undefined ? '' : ` ${position}`;
        const metadata = resolveColorCssMetadata(stop.color, snapshot, ['stops', index, 'color']);
        const color = metadata ? metadata.srgbHex : normaliseColorLiteral(stop.color);
        if (!color) {
          return;
        }
        return `${color}${suffix}`;
      })
      .filter((entry): entry is string => entry !== undefined);

    if (formattedStops.length === 0) {
      return;
    }

    const stops = formattedStops.join(', ');
    const orientation = formatCssGradientOrientation(gradient);
    const prefix = orientation ? `${orientation}, ` : '';
    return {
      css: `${gradient.kind}-gradient(${prefix}${stops})`,
    } satisfies GradientCssTransformOutput;
  },
});

export const gradientToSwiftUiTransform = defineTransform({
  name: 'gradient.toSwiftUI',
  group: TRANSFORM_GROUP_IOS_SWIFTUI,
  selector: { types: ['gradient'] },
  run: ({ value, snapshot }) => {
    if (!isGradientValue(value)) {
      return;
    }

    const gradient = value as GradientTransformValue;

    if (gradient.kind === 'conic') {
      throw new TypeError(
        `gradient.toSwiftUI supports linear and radial gradients. ` +
          `Token ${snapshot.pointer} uses unsupported kind \"conic\".`,
      );
    }

    const stops = gradient.stops
      .map((stop, index) =>
        normaliseSwiftUiStop(stop as GradientTransformStopValue, snapshot, index),
      )
      .filter((stop): stop is GradientSwiftUiStopOutput => stop !== undefined);

    if (stops.length === 0) {
      return;
    }

    const angle = normaliseAngle(gradient.angle);

    return {
      kind: gradient.kind,
      ...(angle === undefined ? {} : { angle }),
      stops,
    } satisfies GradientSwiftUiTransformOutput;
  },
});

export const gradientToAndroidMaterialTransform = defineTransform({
  name: 'gradient.toAndroidMaterial',
  group: TRANSFORM_GROUP_ANDROID_MATERIAL,
  selector: { types: ['gradient'] },
  run: ({ value, snapshot }) => {
    if (!isGradientValue(value)) {
      return;
    }

    const gradient = value as GradientTransformValue;

    if (gradient.kind === 'conic') {
      throw new TypeError(
        `gradient.toAndroidMaterial supports linear and radial gradients. ` +
          `Token ${snapshot.pointer} uses unsupported kind \"conic\".`,
      );
    }

    const stops = gradient.stops
      .map((stop, index) =>
        normaliseAndroidStop(stop as GradientTransformStopValue, snapshot, index),
      )
      .filter((stop): stop is GradientAndroidMaterialStopOutput => stop !== undefined);

    if (stops.length === 0) {
      return;
    }

    const angle = normaliseAngle(gradient.angle);

    return {
      kind: gradient.kind,
      ...(angle === undefined ? {} : { angle }),
      stops,
    } satisfies GradientAndroidMaterialTransformOutput;
  },
});

/**
 * Builds the set of gradient transforms available to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of serialising gradient tokens.
 */
export function createGradientTransforms(): readonly TransformDefinition[] {
  return [gradientToCssTransform];
}

/**
 * Builds the set of SwiftUI oriented gradient transforms available to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of serialising gradient tokens for SwiftUI.
 */
export function createIosSwiftUiGradientTransforms(): readonly TransformDefinition[] {
  return [gradientToSwiftUiTransform];
}

/**
 * Builds the set of Android oriented gradient transforms available to the registry.
 * @returns {readonly TransformDefinition[]} Transform definitions capable of serialising gradient tokens for Android Material targets.
 */
export function createAndroidMaterialGradientTransforms(): readonly TransformDefinition[] {
  return [gradientToAndroidMaterialTransform];
}

interface GradientTransformStopValue {
  readonly color: unknown;
  readonly position?: number | string;
  readonly easing?: unknown;
}

type GradientTransformValue = GradientValue & {
  readonly kind: 'linear' | 'radial' | 'conic';
  readonly stops: readonly GradientTransformStopValue[];
  readonly direction?: string;
  readonly angle?: unknown;
};

/**
 * Determines whether the provided value describes a supported {@link GradientValue}.
 * @param {unknown} value - Candidate gradient token value.
 * @returns {value is GradientTransformValue} `true` when the value exposes gradient kind and stops.
 */
function isGradientValue(value: unknown): value is GradientTransformValue {
  if (Object(value) === value) {
    const candidate = value as GradientValue;
    const isSupportedKind =
      candidate.kind === 'linear' || candidate.kind === 'radial' || candidate.kind === 'conic';
    if (isSupportedKind && Array.isArray(candidate.stops)) {
      return candidate.stops.every(
        (stop) =>
          Object(stop) === stop &&
          isSupportedColorCandidate((stop as GradientTransformStopValue).color) &&
          (isValidStopPosition((stop as GradientTransformStopValue).position) ||
            (stop as GradientTransformStopValue).position === undefined) &&
          (isValidStopEasing((stop as GradientTransformStopValue).easing) ||
            (stop as GradientTransformStopValue).easing === undefined),
      );
    }
  }
  return false;
}

function formatCssStopPosition(position: unknown): string | undefined {
  if (typeof position === 'number' && Number.isFinite(position)) {
    return `${position}%`;
  }
  if (typeof position === 'string') {
    const trimmed = position.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return undefined;
}

function formatCssGradientOrientation(gradient: GradientTransformValue): string | undefined {
  if (typeof gradient.direction === 'string') {
    const trimmed = gradient.direction.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  if (gradient.kind === 'linear') {
    return 'to bottom';
  }
  return undefined;
}

function normaliseSwiftUiStop(
  stop: GradientTransformStopValue,
  snapshot: TokenSnapshot,
  index: number,
): GradientSwiftUiStopOutput | undefined {
  const normalised = normaliseGradientStop(stop, snapshot, index);
  if (normalised === undefined) {
    return undefined;
  }

  const { color, location, easing } = normalised;

  return {
    color,
    ...(location === undefined ? {} : { location }),
    ...(easing === undefined ? {} : { easing }),
  } satisfies GradientSwiftUiStopOutput;
}

function normaliseAndroidStop(
  stop: GradientTransformStopValue,
  snapshot: TokenSnapshot,
  index: number,
): GradientAndroidMaterialStopOutput | undefined {
  const normalised = normaliseGradientStop(stop, snapshot, index);
  if (normalised === undefined) {
    return undefined;
  }

  const { color, location, easing } = normalised;

  return {
    color,
    ...(location === undefined ? {} : { position: location }),
    ...(easing === undefined ? {} : { easing }),
  } satisfies GradientAndroidMaterialStopOutput;
}

function normaliseGradientStop(
  stop: GradientTransformStopValue,
  snapshot: TokenSnapshot,
  index: number,
):
  | {
      readonly color: string;
      readonly location?: number;
      readonly easing?: string;
    }
  | undefined {
  const color = normaliseStopColor(stop.color, snapshot, index);
  if (!color) {
    return undefined;
  }

  const location = normaliseStopLocation(stop.position);
  const easing = normaliseStopEasing(stop.easing);

  return {
    color,
    ...(location === undefined ? {} : { location }),
    ...(easing === undefined ? {} : { easing }),
  };
}

function normaliseStopLocation(position: unknown): number | undefined {
  if (typeof position === 'number' && Number.isFinite(position)) {
    return clampLocation(position > 1 ? position / 100 : position);
  }
  if (typeof position === 'string') {
    const trimmed = position.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    const percentMatch = /^-?\d+(?:\.\d+)?%$/.exec(trimmed);
    if (percentMatch) {
      const numeric = Number.parseFloat(trimmed.slice(0, -1));
      if (Number.isFinite(numeric)) {
        return clampLocation(numeric / 100);
      }
      return undefined;
    }
    const numeric = Number.parseFloat(trimmed);
    if (Number.isFinite(numeric)) {
      return clampLocation(numeric > 1 ? numeric / 100 : numeric);
    }
  }
  return undefined;
}

function normaliseStopEasing(easing: unknown): string | undefined {
  if (typeof easing === 'string') {
    const trimmed = easing.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return undefined;
}

function normaliseAngle(angle: unknown): number | undefined {
  if (typeof angle === 'number' && Number.isFinite(angle)) {
    return clampAngle(angle);
  }
  if (typeof angle === 'string') {
    const trimmed = angle.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    const degreesMatch = /^-?\d+(?:\.\d+)?(?:deg)?$/.exec(trimmed.replaceAll(/\s+/g, ''));
    if (degreesMatch) {
      const numeric = Number.parseFloat(trimmed);
      if (Number.isFinite(numeric)) {
        return clampAngle(numeric);
      }
    }
  }
  return undefined;
}

function clampLocation(value: number): number {
  if (Number.isNaN(value) || Number.isFinite(value) === false) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Math.round(value * 1e6) / 1e6;
}

function clampAngle(value: number): number | undefined {
  if (Number.isFinite(value) === false) {
    return undefined;
  }
  return Math.round(value * 1e3) / 1e3;
}

function isValidStopPosition(position: unknown): boolean {
  if (position === undefined) {
    return true;
  }
  if (typeof position === 'number') {
    return Number.isFinite(position);
  }
  if (typeof position === 'string') {
    return position.trim().length > 0;
  }
  return false;
}

function isValidStopEasing(easing: unknown): boolean {
  if (easing === undefined) {
    return true;
  }
  if (typeof easing === 'string') {
    return easing.trim().length > 0;
  }
  return false;
}
function isSupportedColorCandidate(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (value && typeof value === 'object') {
    return true;
  }
  return false;
}

function normaliseStopColor(
  value: unknown,
  snapshot: TokenSnapshot,
  index: number,
): string | undefined {
  const metadata = resolveColorCssMetadata(value, snapshot, ['stops', index, 'color']);
  if (metadata) {
    return metadata.srgbHex;
  }
  return normaliseColorLiteral(value);
}

function normaliseColorLiteral(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

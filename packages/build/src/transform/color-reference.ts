import type { TokenSnapshot } from '../session/resolution-session.js';
import {
  parseColorValue,
  toColorCssOutput,
  type ColorCssMetadata,
  type ColorValue,
} from '@dtifx/core/policy';

type ColorPathSegment = string | number;

type ColorPath = readonly ColorPathSegment[];

/**
 * Resolves DTIF color references and inline values into CSS metadata derived from {@link ColorValue} structures.
 *
 * @param source - The raw color candidate provided to the transform.
 * @param snapshot - Token snapshot containing resolved token data that can be used for alias lookup.
 * @param path - JSON pointer segments identifying the color field relative to the token value.
 * @returns Color metadata ready for CSS serialisation when available.
 */
export function resolveColorCssMetadata(
  source: unknown,
  snapshot: TokenSnapshot | undefined,
  path: ColorPath,
): ColorCssMetadata | undefined {
  const fromSource = normaliseColorMetadata(source);
  if (fromSource) {
    return fromSource;
  }

  if (!snapshot) {
    return undefined;
  }

  const candidateSources =
    path.length === 0
      ? []
      : [
          getNestedValue(snapshot.resolution?.value, path),
          getNestedValue(snapshot.value, path),
          getNestedValue(snapshot.raw, path),
          getNestedValue(snapshot.token?.value, path),
        ];

  for (const candidate of candidateSources) {
    if (candidate === undefined) {
      continue;
    }
    const metadata = normaliseColorMetadata(candidate);
    if (metadata) {
      return metadata;
    }
  }

  return undefined;
}

function normaliseColorMetadata(value: unknown): ColorCssMetadata | undefined {
  const colorValue = extractColorValue(value, new Set());
  if (!colorValue) {
    return undefined;
  }
  try {
    return toColorCssOutput(colorValue);
  } catch {
    return undefined;
  }
}

function extractColorValue(value: unknown, seen: Set<object>): ColorValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  const objectValue = value as Record<string, unknown>;
  if (seen.has(objectValue)) {
    return undefined;
  }
  seen.add(objectValue);

  const parsed = parseColorValue(objectValue);
  if (parsed) {
    return parsed;
  }

  const nestedCandidates: readonly unknown[] = [
    objectValue['$value'],
    objectValue['value'],
    objectValue['$resolved'],
    objectValue['resolved'],
    objectValue['$ref'],
    objectValue['ref'],
  ];

  for (const candidate of nestedCandidates) {
    if (candidate === undefined) {
      continue;
    }

    if (typeof candidate === 'object' && candidate !== null) {
      const resolved = extractColorValue(candidate, seen);
      if (resolved) {
        return resolved;
      }
      continue;
    }
  }

  return undefined;
}

function getNestedValue(value: unknown, path: ColorPath): unknown {
  let current = value;
  for (const segment of path) {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
      continue;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    const record = current as Record<string, unknown>;
    current = record[segment];
  }
  return current;
}

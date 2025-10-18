import type { JsonPointer } from '@lapidist/dtif-parser';

import { getDecodedPointerSegments } from './token-pointer.js';

/**
 * Generates a unique Android resource name for the provided pointer while tracking collisions.
 *
 * @param {JsonPointer} pointer - JSON pointer identifying the token.
 * @param {Set<string>} seen - Collection of resource names that have already been emitted.
 * @returns {string} A unique resource name suitable for Android XML artifacts.
 */
export function createUniqueAndroidResourceName(pointer: JsonPointer, seen: Set<string>): string {
  const baseName = createAndroidResourceName(pointer);
  if (seen.has(baseName) === false) {
    seen.add(baseName);
    return baseName;
  }

  let suffix = 2;
  let candidate = `${baseName}_${suffix}`;
  while (seen.has(candidate)) {
    suffix += 1;
    candidate = `${baseName}_${suffix}`;
  }

  seen.add(candidate);
  return candidate;
}

/**
 * Derives an Android resource name from a JSON pointer.
 *
 * @param {JsonPointer} pointer - JSON pointer identifying the token.
 * @returns {string} A resource name derived from pointer segments.
 */
export function createAndroidResourceName(pointer: JsonPointer): string {
  const segments = getDecodedPointerSegments(pointer)
    .map((segment) => normaliseResourceSegment(segment))
    .filter((segment) => segment.length > 0);

  let name = segments.length === 0 ? 'token' : segments.join('_');
  name = name.replaceAll(/_{2,}/g, '_').replaceAll(/^_+|_+$/g, '');

  if (name.length === 0) {
    name = 'token';
  }

  if (!/^[a-z]/.test(name)) {
    name = `token_${name}`;
  }

  name = name.replaceAll(/[^a-z0-9_]/g, '_');
  name = name.replaceAll(/_{2,}/g, '_').replaceAll(/^_+|_+$/g, '');

  if (name.length === 0) {
    return 'token';
  }

  if (!/^[a-z]/.test(name)) {
    return `token_${name}`;
  }

  return name;
}

function normaliseResourceSegment(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }

  const separated = trimmed
    .replaceAll(/([a-z\d])([A-Z])/g, '$1_$2')
    .replaceAll(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .replaceAll(/([0-9])([A-Za-z])/g, '$1_$2')
    .replaceAll(/([A-Za-z])([0-9])/g, '$1_$2');

  return separated.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_');
}

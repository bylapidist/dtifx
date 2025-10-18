import type { JsonPointer } from '@lapidist/dtif-parser';

import { getDecodedPointerSegments } from './token-pointer.js';

/**
 * Generates a Swift identifier for a given JSON pointer and ensures uniqueness within a scope.
 *
 * @param {JsonPointer} pointer - JSON pointer representing the token.
 * @param {Set<string>} seen - Collection tracking identifiers that have been emitted.
 * @returns {string} A unique Swift identifier suitable for use as a static property name.
 */
export function createUniqueSwiftPropertyIdentifier(
  pointer: JsonPointer,
  seen: Set<string>,
): string {
  const baseName = createSwiftIdentifier(pointer, false);
  if (!seen.has(baseName)) {
    seen.add(baseName);
    return baseName;
  }

  let suffix = 2;
  let candidate = `${baseName}${suffix}`;
  while (seen.has(candidate)) {
    suffix += 1;
    candidate = `${baseName}${suffix}`;
  }

  seen.add(candidate);
  return candidate;
}

function createSwiftIdentifier(pointer: JsonPointer, capitaliseFirst: boolean): string {
  const segments = getDecodedPointerSegments(pointer)
    .flatMap((segment) => splitSegment(segment))
    .map((segment) => normaliseIdentifierSegment(segment))
    .filter((segment) => segment.length > 0);

  let identifier = segments.length === 0 ? 'Token' : segments.join('');
  identifier = identifier.replaceAll(/[^A-Za-z0-9_]/g, '');

  if (identifier.length === 0) {
    identifier = 'Token';
  }

  if (!/^[A-Za-z_]/.test(identifier)) {
    identifier = `Token${identifier}`;
  }

  if (capitaliseFirst) {
    return capitalise(identifier);
  }

  return decapitalise(identifier);
}

function splitSegment(value: string): readonly string[] {
  const cleaned = value.replaceAll(/[^A-Za-z0-9]+/g, ' ').trim();
  if (cleaned.length === 0) {
    return [];
  }

  const words: string[] = [];
  for (const token of cleaned.split(/\s+/)) {
    if (token.length === 0) {
      continue;
    }
    words.push(...splitCamelCase(token));
  }
  return words;
}

function splitCamelCase(value: string): readonly string[] {
  const parts: string[] = [];
  let current = '';

  for (const char of value) {
    const isUppercase = char >= 'A' && char <= 'Z';
    const isDigit = char >= '0' && char <= '9';

    if (current.length === 0) {
      current = char;
      continue;
    }

    const previous = current.at(-1)!;
    const previousIsUpper = previous >= 'A' && previous <= 'Z';
    const previousIsDigit = previous >= '0' && previous <= '9';

    if (isDigit) {
      if (previousIsDigit) {
        current += char;
      } else {
        parts.push(current);
        current = char;
      }
      continue;
    }

    if (isUppercase && (!previousIsUpper || (previousIsUpper && current.length > 1))) {
      parts.push(current);
      current = char;
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

function normaliseIdentifierSegment(value: string): string {
  if (value.length === 0) {
    return '';
  }
  const lower = value.toLowerCase();
  return lower[0]?.toUpperCase() + lower.slice(1);
}

function capitalise(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function decapitalise(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}

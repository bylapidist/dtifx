import {
  decodeJsonPointerSegment,
  splitJsonPointer,
  type JsonPointer,
} from '@lapidist/dtif-parser';

/**
 * Splits a JSON pointer into its decoded path segments.
 *
 * @param {JsonPointer} pointer - JSON pointer to split into segments.
 * @returns {readonly string[]} Decoded pointer segments in the order they appear in the pointer.
 */
export function getDecodedPointerSegments(pointer: JsonPointer): readonly string[] {
  return splitJsonPointer(pointer);
}

/**
 * Decodes a JSON pointer segment by reversing escape sequences.
 *
 * @param {string} segment - Encoded JSON pointer segment.
 * @returns {string} The decoded segment with escaped characters restored.
 */
export function decodePointerSegment(segment: string): string {
  return decodeJsonPointerSegment(segment);
}

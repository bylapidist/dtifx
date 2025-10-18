import { describe, expect, it } from 'vitest';

import { decodePointerSegment, getDecodedPointerSegments } from './token-pointer.js';

describe('getDecodedPointerSegments', () => {
  it('returns an empty array for the root pointer', () => {
    expect(getDecodedPointerSegments('#' as const)).toStrictEqual([]);
    expect(getDecodedPointerSegments('' as const)).toStrictEqual([]);
  });

  it('decodes pointer segments and removes the leading slash', () => {
    expect(getDecodedPointerSegments('/design-tokens/~0~/spacing~1large' as const)).toStrictEqual([
      'design-tokens',
      '~~',
      'spacing/large',
    ]);
  });
});

describe('decodePointerSegment', () => {
  it('reverses JSON pointer escape sequences', () => {
    expect(decodePointerSegment('foo~0bar~1baz')).toBe('foo~bar/baz');
  });
});

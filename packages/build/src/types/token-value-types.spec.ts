import { describe, expect, it } from 'vitest';

import { isTokenTypeIdentifier } from './token-value-types.js';

describe('isTokenTypeIdentifier', () => {
  const supportedTypes = [
    'border',
    'color',
    'component',
    'cursor',
    'dimension',
    'duration',
    'easing',
    'elevation',
    'filter',
    'font',
    'fontFace',
    'gradient',
    'line-height',
    'motion',
    'opacity',
    'shadow',
    'strokeStyle',
    'typography',
    'z-index',
  ] as const;

  it('accepts every registered DTIF token type identifier', () => {
    for (const type of supportedTypes) {
      expect(isTokenTypeIdentifier(type)).toBe(true);
    }
  });

  it('rejects legacy identifiers', () => {
    expect(isTokenTypeIdentifier('string')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { isTokenTypeIdentifier } from './token-types.js';

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

  it('identifies supported token types', () => {
    for (const type of supportedTypes) {
      expect(isTokenTypeIdentifier(type)).toBe(true);
    }
  });

  it('rejects unknown identifiers', () => {
    expect(isTokenTypeIdentifier('string')).toBe(false);
  });
});

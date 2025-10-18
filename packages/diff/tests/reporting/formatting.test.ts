import { describe, expect, test } from 'vitest';

import {
  formatColorLabel,
  formatCssColor,
  getTokenColor,
  type TokenColor,
} from '../../src/reporting/formatting.js';
import type { TokenSnapshot } from '../../src/token-set.js';

describe('getTokenColor', () => {
  const baseToken: Pick<
    TokenSnapshot,
    'id' | 'path' | 'extensions' | 'source' | 'references' | 'resolutionPath' | 'appliedAliases'
  > = {
    id: '#/color/test',
    path: ['color', 'test'],
    extensions: {},
    source: { uri: 'memory://test', line: 1, column: 1 },
    references: [],
    resolutionPath: [],
    appliedAliases: [],
  };

  function createColorToken(value: unknown): TokenSnapshot {
    return {
      ...baseToken,
      type: 'color',
      value,
    } satisfies TokenSnapshot;
  }

  test('parses hexadecimal colour strings', () => {
    const token = createColorToken('#abc123');
    const color = getTokenColor(token);

    expect(color).toEqual({
      hex: '#ABC123',
      red: 171,
      green: 193,
      blue: 35,
    });

    expect(formatCssColor(assertTokenColor(color))).toBe('#ABC123');
    expect(formatColorLabel(assertTokenColor(color))).toBe('#ABC123');
  });

  test('normalises SRGB components and alpha overrides', () => {
    const token = createColorToken({
      colorSpace: 'srgb',
      components: [0.2, 0.4, 0.6, 0.8],
      alpha: 0.5,
    });

    const color = getTokenColor(token);

    expect(color).toEqual({
      hex: '#336699',
      red: 51,
      green: 102,
      blue: 153,
      alpha: 0.5,
    });

    expect(formatCssColor(assertTokenColor(color))).toBe('rgba(51, 102, 153, 0.5)');
    expect(formatColorLabel(assertTokenColor(color))).toBe('#336699, alpha 0.5');
  });
});

function assertTokenColor(color: TokenColor | undefined): TokenColor {
  expect(color).toBeDefined();
  return color as TokenColor;
}

import { describe, expect, test } from 'vitest';

import {
  formatColorLabel,
  formatCssColor,
  formatMaybeUndefined,
  formatPointer,
  formatPointerList,
  formatTokenSourceLocation,
  formatTokenValueForSummary,
  formatValue,
  formatAlpha,
  formatSignedDimension,
  formatSignedPercentage,
  getDimensionComparison,
  getDimensionPreview,
  getTokenColor,
  groupEntriesByTokenType,
  normalizeTokenType,
  type TokenColor,
} from '../../src/reporting/formatting.js';
import type { TokenPointer, TokenSnapshot, TokenSourceLocation } from '../../src/token-set.js';

const baseSnapshot: Pick<
  TokenSnapshot,
  'id' | 'path' | 'extensions' | 'source' | 'references' | 'resolutionPath' | 'appliedAliases'
> = {
  id: '#/tokens/example',
  path: ['tokens', 'example'],
  extensions: {},
  source: { uri: 'memory://test', line: 1, column: 1 },
  references: [],
  resolutionPath: [],
  appliedAliases: [],
};

function createToken(overrides: Partial<TokenSnapshot> = {}): TokenSnapshot {
  return {
    ...baseSnapshot,
    type: 'color',
    ...overrides,
  } satisfies TokenSnapshot;
}

describe('formatting primitives', () => {
  test('formatValue returns quoted strings and inspects objects', () => {
    expect(formatValue('plain')).toBe('"plain"');
    expect(formatValue({ foo: 1, bar: 'baz' })).toBe("{ bar: 'baz', foo: 1 }");
  });

  test('formatMaybeUndefined and formatPointer format missing values', () => {
    expect(formatMaybeUndefined('value')).toBe('value');
    let missingValue: string | undefined;
    expect(formatMaybeUndefined(missingValue)).toBe('undefined');

    expect(formatPointer('/design/tokens')).toBe('"/design/tokens"');
    let missingPointer: string | undefined;
    expect(formatPointer(missingPointer)).toBe('undefined');
  });

  test('formatTokenValueForSummary prefers values, then refs, then falls back', () => {
    expect(formatTokenValueForSummary(createToken({ value: 'primary' }))).toBe("'primary'");
    expect(formatTokenValueForSummary(createToken({ value: { foo: 1 } }))).toBe('{ foo: 1 }');
    const summaryWithRef = formatTokenValueForSummary(createToken({ ref: '#/typography/body' }));
    expect(summaryWithRef).toBe('ref "#/typography/body"');
    const summaryWithoutValue = formatTokenValueForSummary(createToken());
    expect(summaryWithoutValue).toBe('undefined');
  });

  test('formatPointerList renders pointer arrays', () => {
    const pointers: TokenPointer[] = [
      { uri: 'file:///tokens.json', pointer: '#/color/base' },
      { uri: 'memory://inline', pointer: '#/color/alt' },
    ];

    expect(formatPointerList(pointers)).toBe(
      "[{ uri: 'file:///tokens.json', pointer: '#/color/base' }, { uri: 'memory://inline', pointer: '#/color/alt' }]",
    );
    expect(formatPointerList([])).toBe('[]');
  });

  test('formatTokenSourceLocation normalises paths and URIs', () => {
    const noUri: TokenSourceLocation = { uri: '' as string, line: 5, column: 7 };
    const fileUri: TokenSourceLocation = {
      uri: 'file:///Users/example/tokens.json',
      line: 10,
      column: 2,
    };
    const remoteUri: TokenSourceLocation = {
      uri: 'https://example.com/tokens.json',
      line: 3,
      column: 4,
    };
    const invalidUri: TokenSourceLocation = { uri: 'file://%zz', line: 1, column: 2 };

    expect(formatTokenSourceLocation(noUri)).toBe('5:7');
    expect(formatTokenSourceLocation(fileUri)).toBe('/Users/example/tokens.json:10:2');
    expect(formatTokenSourceLocation(remoteUri)).toBe('https://example.com/tokens.json:3:4');
    expect(formatTokenSourceLocation(invalidUri)).toBe('%zz:1:2');
  });
});

describe('dimension helpers', () => {
  test('getDimensionPreview extracts values from supported tokens', () => {
    const preview = getDimensionPreview(createToken({ type: 'dimension', value: '12px' }));

    expect(preview).toEqual({
      value: 12,
      unit: 'px',
      label: '12px',
      dimensionType: 'length',
    });

    expect(getDimensionPreview(createToken({ type: 'color', value: '12px' }))).toBeUndefined();
    expect(getDimensionPreview(createToken({ type: 'dimension' }))).toBeUndefined();
  });

  test('getDimensionComparison derives deltas and percent changes for matching previews', () => {
    const previous = createToken({ type: 'dimension', value: '10px' });
    const next = createToken({ type: 'dimension', value: '15px' });
    const mismatch = createToken({ type: 'dimension', value: '1rem' });

    expect(getDimensionComparison(previous, mismatch)).toBeUndefined();

    const comparison = getDimensionComparison(previous, next);
    expect(comparison).toEqual({
      previous: { value: 10, unit: 'px', label: '10px', dimensionType: 'length' },
      next: { value: 15, unit: 'px', label: '15px', dimensionType: 'length' },
      delta: 5,
      unit: 'px',
      percentChange: 50,
    });

    const zeroBaseline = getDimensionComparison(
      createToken({ type: 'dimension', value: '0px' }),
      createToken({ type: 'dimension', value: '4px' }),
    );
    expect(zeroBaseline).toEqual({
      previous: { value: 0, unit: 'px', label: '0px', dimensionType: 'length' },
      next: { value: 4, unit: 'px', label: '4px', dimensionType: 'length' },
      delta: 4,
      unit: 'px',
    });
  });

  test('formatSignedDimension and formatSignedPercentage include explicit signs', () => {
    expect(formatSignedDimension(12, 'px')).toBe('+12px');
    expect(formatSignedDimension(-1.5, 'em')).toBe('-1.5em');
    expect(formatSignedDimension(0, '')).toBe('+0');

    expect(formatSignedPercentage(0.25)).toBe('+0.25%');
    expect(formatSignedPercentage(-1)).toBe('-1%');
  });
});

describe('token type grouping', () => {
  test('normalizeTokenType and groupEntriesByTokenType collapse whitespace and undefined values', () => {
    let missingType: string | undefined;
    expect(normalizeTokenType(missingType)).toEqual({ key: 'untyped', label: 'untyped' });
    expect(normalizeTokenType('   ')).toEqual({ key: 'untyped', label: 'untyped' });
    expect(normalizeTokenType(' Color ')).toEqual({ key: 'color', label: 'color' });

    const entries: Array<{ id: string; type?: string }> = [
      { id: 'a', type: 'Color' },
      { id: 'b' },
      { id: 'c', type: 'color' },
    ];

    const groups = groupEntriesByTokenType(entries, (entry) => entry.type);

    expect(groups).toEqual([
      { key: 'color', label: 'color', entries: [entries[0]!, entries[2]!] },
      { key: 'untyped', label: 'untyped', entries: [entries[1]!] },
    ]);
  });

  test('formatAlpha trims trailing zeros', () => {
    expect(formatAlpha(1)).toBe('1');
    expect(formatAlpha(0.8)).toBe('0.8');
    expect(formatAlpha(0.1234)).toBe('0.12');
  });
});

describe('getTokenColor', () => {
  test('parses hexadecimal colour strings', () => {
    const token = createToken({ value: '#abc123' });
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
    const token = createToken({
      value: {
        colorSpace: 'srgb',
        components: [0.2, 0.4, 0.6, 0.8],
        alpha: 0.5,
      },
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

  test('returns undefined for non-colour tokens or missing values', () => {
    const tokenWithoutType = { ...createToken({ value: '#abc123' }) };
    delete (tokenWithoutType as { type?: string }).type;

    expect(getTokenColor(tokenWithoutType as TokenSnapshot)).toBeUndefined();
    expect(getTokenColor(createToken({ type: 'dimension', value: '#abc123' }))).toBeUndefined();
    expect(getTokenColor(createToken())).toBeUndefined();
  });

  test('returns undefined for invalid colour representations', () => {
    expect(getTokenColor(createToken({ value: 'not-a-colour' }))).toBeUndefined();
    expect(getTokenColor(createToken({ value: { hex: '#zzzzzz' } }))).toBeUndefined();
    expect(
      getTokenColor(
        createToken({ value: { colorSpace: 'display-p3', components: [0.1, 0.2, 0.3] } }),
      ),
    ).toBeUndefined();
    expect(
      getTokenColor(
        createToken({ value: { colorSpace: 'srgb', components: ['a', 0.2, 0.3] as unknown[] } }),
      ),
    ).toBeUndefined();
  });

  test('applies override alpha when provided', () => {
    const token = createToken({
      value: {
        colorSpace: 'srgb',
        components: [16, 32, 64, 128],
        alpha: 200,
      },
    });

    const color = assertTokenColor(getTokenColor(token));

    expect(color.hex).toBe('#102040');
    expect(color.red).toBe(16);
    expect(color.green).toBe(32);
    expect(color.blue).toBe(64);
    expect(color.alpha).toBeDefined();
    expect(color.alpha).toBeCloseTo(200 / 255, 3);
  });
});

function assertTokenColor(color: TokenColor | undefined): TokenColor {
  expect(color).toBeDefined();
  return color as TokenColor;
}

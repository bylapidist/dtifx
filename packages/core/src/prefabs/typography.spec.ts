import { describe, expect, it } from 'vitest';

import { Typography } from './typography.js';

describe('TypographyTokenPrefab', () => {
  it('normalises font metadata and dimensions', () => {
    const typography = Typography.create(['text', 'body'], {
      typographyType: ' Body ',
      fontFamily: '  Inter  ',
      fontSize: [16, 'PX'],
      lineHeight: -0.5,
      letterSpacing: { value: 0.05, unit: 'EM' },
      paragraphSpacing: { value: 12, unit: 'PT' },
      wordSpacing: 'normal',
      fontWeight: ' SemiBold ',
      fontStyle: ' Italic ',
    });

    expect(typography.value.typographyType).toBe('body');
    expect(typography.value.fontFamily).toBe('Inter');
    expect(typography.value.fontSize.unit).toBe('px');
    expect(typography.value.lineHeight).toBe(0);
    expect(typography.value.letterSpacing).toEqual({
      dimensionType: 'length',
      value: 0.05,
      unit: 'em',
    });
    expect(typography.value.paragraphSpacing).toEqual({
      dimensionType: 'length',
      value: 12,
      unit: 'pt',
    });
    expect(typography.value.wordSpacing).toBe('normal');
    expect(typography.value.fontWeight).toBe('semibold');
    expect(typography.value.fontStyle).toBe('italic');
  });

  it('supports removing optional fields', () => {
    const typography = Typography.create(['text', 'body'], {
      fontFamily: 'Inter',
      fontSize: [16, 'px'],
      lineHeight: 1.4,
    }).withLineHeight();

    expect(typography.value.lineHeight).toBeUndefined();
  });
});

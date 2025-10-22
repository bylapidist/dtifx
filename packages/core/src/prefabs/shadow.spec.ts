import { describe, expect, it } from 'vitest';

import { Shadow } from './shadow.js';

describe('ShadowTokenPrefab', () => {
  it('normalises layer metadata and dimensions', () => {
    const shadow = Shadow.create(
      ['shadows', 'card'],
      [
        {
          shadowType: ' CSS.BOX-SHADOW ',
          offsetX: [0, 'px'],
          offsetY: [2, 'PX'],
          blur: [4, 'px'],
          spread: [1, 'PX'],
          color: '#000000',
        },
      ],
    );

    const [layer] = shadow.value;
    expect(layer.shadowType).toBe('css.box-shadow');
    expect(layer.offsetY.unit).toBe('px');
    expect(layer.spread?.unit).toBe('px');
  });

  it('lightens and darkens shadow layers', () => {
    const shadow = Shadow.create(
      ['shadows', 'card'],
      [
        {
          shadowType: 'css.box-shadow',
          offsetX: [0, 'px'],
          offsetY: [2, 'px'],
          blur: [4, 'px'],
          color: '#202020',
        },
      ],
    );

    const lighter = shadow.lighten(0.5);
    expect(lighter.value[0]?.color.hex).toBe('#303030');

    const darker = shadow.darken(0.25);
    expect(darker.value[0]?.color.hex).toBe('#181818');
  });

  it('requires at least one layer', () => {
    expect(() => Shadow.create(['shadows', 'card'], [])).toThrowErrorMatchingInlineSnapshot(
      '[TypeError: Shadow tokens require at least one layer.]',
    );
  });
});

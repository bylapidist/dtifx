import { describe, expect, it } from 'vitest';

import { Color } from './color.js';
import { Gradient } from './gradient.js';

describe('GradientTokenPrefab', () => {
  it('normalises metadata and stop values', () => {
    const gradient = Gradient.linear(
      ['gradients', 'background'],
      [
        { position: 0, color: '#336699' },
        { position: 1, color: '#112233' },
      ],
      { angle: ' 45deg ', shape: ' ELLIPSE ', center: { x: 0.25, y: 0.75 } },
    );

    expect(gradient.value.angle).toBe('45deg');
    expect(gradient.value.shape).toBe('ellipse');
    expect(gradient.value.center).toEqual({ x: 0.25, y: 0.75 });
    expect(gradient.value.stops).toHaveLength(2);
    expect(gradient.value.stops[0]?.position).toBe(0);
  });

  it('lightens gradient stops using color lightness adjustment', () => {
    const gradient = Gradient.linear(
      ['gradients', 'background'],
      [
        { position: 0, color: '#336699' },
        { position: 1, color: '#112233' },
      ],
    );

    const lighter = gradient.lighten(0.1);
    const [first, second] = lighter.value.stops;
    expect(first?.color.hex).toBe('#3870A8');
    expect(second?.color.hex).toBe('#132538');
  });

  it('adds stops in order', () => {
    const base = Gradient.linear(
      ['gradients', 'background'],
      [
        { position: 0, color: '#000000' },
        { position: 1, color: '#ffffff' },
      ],
    );

    const augmented = base.addStop({
      position: 0.5,
      color: Color.fromHex(['palette', 'accent', 'primary'], '#ff0000'),
    });
    expect(augmented.value.stops).toHaveLength(3);
    expect(augmented.value.stops[1]?.position).toBe(0.5);
  });

  it('throws when fewer than two stops are provided', () => {
    expect(() =>
      Gradient.linear(['gradients', 'background'], [{ position: 0, color: '#000000' }]),
    ).toThrowErrorMatchingInlineSnapshot(
      '[TypeError: Gradients require at least two color stops.]',
    );
  });
});

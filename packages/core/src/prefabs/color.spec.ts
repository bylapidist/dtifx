import { describe, expect, it } from 'vitest';

import { Color } from './color.js';

describe('ColorTokenPrefab', () => {
  it('lightens srgb colors using the color library', () => {
    const base = Color.fromHex(['palette', 'accent', 'primary'], '#336699');
    const lighter = base.lighten(0.2);

    expect(base.value.hex).toBe('#336699');
    expect(lighter.value.hex).toBe('#3D7AB8');
    const [r, g, b] = lighter.value.components;
    expect(r).toBeCloseTo(0.24, 5);
    expect(g).toBeCloseTo(0.48, 5);
    expect(b).toBeCloseTo(0.72, 5);
  });

  it('darkens srgb colors using the color library', () => {
    const base = Color.fromHex(['palette', 'accent', 'primary'], '#336699');
    const darker = base.darken(0.1);

    expect(darker.value.hex).toBe('#2E5C8A');
    const [r, g, b] = darker.value.components;
    expect(r).toBeCloseTo(0.18, 5);
    expect(g).toBeCloseTo(0.36, 5);
    expect(b).toBeCloseTo(0.54, 5);
  });

  it('applies alpha channels and produces consistent hex output', () => {
    const color = Color.fromHex(['palette', 'accent', 'primary'], '#000000').withAlpha(0.5);
    expect(color.value.alpha).toBe(0.5);
    expect(color.value.hex).toBe('#00000080');
  });
});

import { describe, expect, it } from 'vitest';

import { PanelTokenPrefab } from './panel.js';

describe('PanelTokenPrefab', () => {
  it('normalises panel layers and tokens', () => {
    const prefab = PanelTokenPrefab.create(['components', 'card'], {
      panelType: 'surface',
      layers: [
        { kind: 'fill', token: '  color.surface ' },
        { kind: 'shadow', token: ' elevation.low ', opacity: 0.5 },
      ],
    });

    expect(prefab.value.panelType).toBe('surface');
    expect(prefab.value.layers).toEqual([
      { kind: 'fill', token: 'color.surface' },
      { kind: 'shadow', token: 'elevation.low', opacity: 0.5 },
    ]);
  });

  it('applies padding and radius helpers', () => {
    const prefab = PanelTokenPrefab.create(['components', 'sheet']);
    const updated = prefab.withPadding([8, 16]).withRadius([4, 4, 8, 8]);

    expect(updated.value.padding).toEqual({ top: 8, right: 16, bottom: 8, left: 16 });
    expect(updated.value.radius).toEqual({ top: 4, right: 4, bottom: 8, left: 8 });

    const cleared = updated.withPadding().withRadius();
    expect(cleared.value.padding).toBeUndefined();
    expect(cleared.value.radius).toBeUndefined();
  });

  it('throws for unsupported layer kinds', () => {
    expect(() =>
      PanelTokenPrefab.create(['components', 'bad'], {
        layers: [{ kind: 'texture' as never, token: 'pattern' }],
      }),
    ).toThrowError(TypeError);
  });
});

import { describe, expect, it } from 'vitest';

import { FontTokenPrefab } from './font.js';

describe('FontTokenPrefab', () => {
  it('normalises families and fallbacks', () => {
    const prefab = FontTokenPrefab.fromFamily(['fonts', 'heading'], '  Inter  ', [
      '  system-ui  ',
      '  Inter  ',
    ]);

    expect(prefab.value.family).toBe('Inter');
    expect(prefab.value.fallbacks).toEqual(['system-ui']);
  });

  it('merges fallbacks and removes duplicates', () => {
    const prefab = FontTokenPrefab.fromFamily(['fonts', 'body'], 'Source Sans Pro');
    const updated = prefab.addFallbacks('system-ui', '  Georgia  ', 'system-ui');

    expect(updated.value.fallbacks).toEqual(['system-ui', 'Georgia']);
    expect(prefab.value.fallbacks).toEqual([]);
  });

  it('clears optional metadata when undefined is provided', () => {
    const prefab = FontTokenPrefab.create(['fonts', 'caption'], {
      family: 'Source Code Pro',
      weight: 600,
      style: 'italic',
      display: 'swap',
    });

    const cleared = prefab.withWeight().withStyle().withDisplay();
    expect(cleared.value.weight).toBeUndefined();
    expect(cleared.value.style).toBeUndefined();
    expect(cleared.value.display).toBeUndefined();
  });

  it('applies metrics and features through fluent helpers', () => {
    const prefab = FontTokenPrefab.fromFamily(['fonts', 'ui'], 'Inter');
    const updated = prefab
      .withMetrics({ ascent: 0.9, descent: -0.2 })
      .setFeature('liga', 1)
      .setFeature('kern', 'on');

    expect(updated.value.metrics).toEqual({ ascent: 0.9, descent: -0.2 });
    expect(updated.value.features).toEqual({ liga: 1, kern: 'on' });

    const removed = updated.setFeature('liga', undefined);
    expect(removed.value.features).toEqual({ kern: 'on' });
  });

  it('throws when the family name is empty', () => {
    expect(() => FontTokenPrefab.fromFamily(['fonts', 'broken'], '   ')).toThrowError(TypeError);
  });
});

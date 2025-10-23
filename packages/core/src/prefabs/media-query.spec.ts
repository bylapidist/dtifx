import { describe, expect, it } from 'vitest';

import { MediaQueryTokenPrefab } from './media-query.js';

describe('MediaQueryTokenPrefab', () => {
  it('creates queries from structured constraints', () => {
    const prefab = MediaQueryTokenPrefab.create(['queries', 'tablet'], {
      mediaType: 'screen',
      constraints: [
        { feature: 'width', comparison: 'min', value: 768, unit: 'px' },
        { feature: 'prefers-color-scheme', value: 'dark' },
      ],
    });

    expect(prefab.value.query).toBe(
      'screen and (min-width: 768px) and (prefers-color-scheme: dark)',
    );
  });

  it('adds constraints via fluent helpers', () => {
    const prefab = MediaQueryTokenPrefab.create(['queries', 'hover'], {
      constraints: [],
    });

    const updated = prefab.addConstraint({ feature: 'hover', value: 'hover' });
    expect(updated.value.constraints).toEqual([
      { feature: 'hover', comparison: 'exact', value: 'hover' },
    ]);
    expect(updated.value.query).toBe('all and (hover: hover)');
  });

  it('replaces width constraints when withWidthRange is used', () => {
    const prefab = MediaQueryTokenPrefab.create(['queries', 'range'], {
      constraints: [{ feature: 'height', comparison: 'min', value: 600, unit: 'px' }],
    });

    const updated = prefab.withWidthRange({ min: 320, max: 960 });
    expect(updated.value.query).toBe(
      'all and (min-height: 600px) and (min-width: 320px) and (max-width: 960px)',
    );
  });

  it('throws for invalid feature names', () => {
    expect(() =>
      MediaQueryTokenPrefab.create(['queries', 'broken'], {
        constraints: [{ feature: '123invalid', value: 'bad' }],
      }),
    ).toThrowError(TypeError);
  });

  it('throws when width ranges omit both min and max', () => {
    const prefab = MediaQueryTokenPrefab.create(['queries', 'empty']);
    expect(() => prefab.withWidthRange({})).toThrowError(TypeError);
    expect(() => MediaQueryTokenPrefab.forWidthRange(['queries', 'missing'], {})).toThrowError(
      TypeError,
    );
  });
});

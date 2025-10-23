import { describe, expect, it } from 'vitest';

import { ImageTokenPrefab } from './image.js';

describe('ImageTokenPrefab', () => {
  it('builds responsive sources with default ratios', () => {
    const prefab = ImageTokenPrefab.responsive(['media', 'hero'], 'hero.png', {
      alt: 'Hero illustration',
    });

    expect(prefab.value.sources).toEqual([
      { src: 'hero.png', pixelRatio: 1 },
      { src: 'hero@2x.png', pixelRatio: 2 },
    ]);
    expect(prefab.value.alt).toBe('Hero illustration');
  });

  it('clears optional metadata when undefined is provided', () => {
    const prefab = ImageTokenPrefab.create(['media', 'logo'], {
      alt: 'Company logo',
      placeholder: 'logo.svg',
      sources: [{ src: 'logo.svg' }],
    });

    const cleared = prefab.withAlt().withPlaceholder();
    expect(cleared.value.alt).toBeUndefined();
    expect(cleared.value.placeholder).toBeUndefined();
  });

  it('adds additional sources while removing duplicates', () => {
    const prefab = ImageTokenPrefab.create(['media', 'icon'], {
      sources: [{ src: 'icon.png', pixelRatio: 1 }],
    });

    const updated = prefab.addSources(
      { src: 'icon.png', pixelRatio: 2 },
      { src: 'icon@3x.png', pixelRatio: 3 },
    );
    expect(updated.value.sources).toEqual([
      { src: 'icon.png', pixelRatio: 1 },
      { src: 'icon@3x.png', pixelRatio: 3 },
    ]);
  });

  it('throws when an invalid pixel ratio is provided', () => {
    expect(() =>
      ImageTokenPrefab.create(['media', 'bad'], {
        sources: [{ src: 'broken.png', pixelRatio: 0 }],
      }),
    ).toThrowError(TypeError);
  });
});

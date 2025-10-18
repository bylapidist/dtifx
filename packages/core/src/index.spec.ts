import { describe, expect, it } from 'vitest';

import { describe as describeManifest, createPlaceholderManifest, manifest } from './index.js';

describe('core manifest placeholder', () => {
  it('exposes a frozen manifest instance', () => {
    expect(Object.isFrozen(manifest)).toBe(true);
  });

  it('returns a shallow copy from describe()', () => {
    const snapshot = describeManifest();

    expect(snapshot).toEqual(manifest);
    expect(snapshot).not.toBe(manifest);
  });

  it('freezes custom placeholder manifests', () => {
    const custom = createPlaceholderManifest({
      name: '@dtifx/example',
      summary: 'example placeholder',
    });

    expect(Object.isFrozen(custom)).toBe(true);
    expect(custom.name).toBe('@dtifx/example');
  });
});

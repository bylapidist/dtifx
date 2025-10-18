import { describe, expect, it } from 'vitest';

import { describe as describeManifest, manifest } from './index.js';

describe('@dtifx/audit placeholder', () => {
  it('protects manifest data via freezing', () => {
    expect(Object.isFrozen(manifest)).toBe(true);
  });

  it('returns a snapshot copy when described', () => {
    const snapshot = describeManifest();

    expect(snapshot).toEqual(manifest);
    expect(snapshot).not.toBe(manifest);
  });
});

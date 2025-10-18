import { describe, expect, it } from 'vitest';

import { loadPackageDescription } from '@dtifx/core/testing';

import { manifest } from './manifest.js';

const packageJsonUrl = new URL('../package.json', import.meta.url);

describe('audit manifest metadata', () => {
  it('matches the package description', async () => {
    const description = await loadPackageDescription(packageJsonUrl);

    expect(manifest.summary).toBeTruthy();
    expect(description).toBe(manifest.summary);
  });
});

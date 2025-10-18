import { describe, expect, it } from 'vitest';

import { loadPackageDescription } from './testing/manifest-metadata.js';
import { manifest } from './index.js';

const packageJsonUrl = new URL('../package.json', import.meta.url);

describe('core manifest metadata', () => {
  it('matches the package description', async () => {
    const description = await loadPackageDescription(packageJsonUrl);

    expect(manifest.summary).toBeTruthy();
    expect(description).toBe(manifest.summary);
  });
});

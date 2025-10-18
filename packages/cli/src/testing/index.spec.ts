import { describe, expect, it } from 'vitest';

describe('@dtifx/cli/testing entry point', () => {
  it('supports importing testing utilities', async () => {
    // eslint-disable-next-line @nx/enforce-module-boundaries
    await expect(import('@dtifx/cli/testing')).resolves.toHaveProperty('createMemoryCliIo');
  });
});

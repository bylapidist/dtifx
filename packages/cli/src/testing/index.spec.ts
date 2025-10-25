import { describe, expect, it } from 'vitest';

import * as testing from './index.js';
import { createMemoryCliIo } from './memory-cli-io.js';

describe('testing utilities public API', () => {
  it('re-exports the in-memory CLI IO helpers', () => {
    expect(testing.createMemoryCliIo).toBe(createMemoryCliIo);
  });
});

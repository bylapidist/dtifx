import { describe, expect, it } from 'vitest';

import { createMemoryCliIo } from './memory-cli-io.js';

describe('createMemoryCliIo', () => {
  it('captures output buffers and recorded exit codes', () => {
    const io = createMemoryCliIo();

    io.writeOut('hello');
    io.writeErr('error');

    expect(io.stdoutBuffer).toBe('hello');
    expect(io.stderrBuffer).toBe('error');
    expect(io.exitCodes).toEqual([]);

    expect(() => io.exit(2)).toThrow(/process exit called with code 2/);
    expect(io.exitCodes).toEqual([2]);
  });
});

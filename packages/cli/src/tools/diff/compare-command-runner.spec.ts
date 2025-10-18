import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import process from 'node:process';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';

describe('executeDiffCompareCommand', () => {
  let originalExitCode: number | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.resetModules();
  });

  it('reports a friendly error when the diff module is unavailable', async () => {
    const module = await import('./compare-command-runner.js');
    module.__testing.setDiffModuleImporter(async () => {
      const missing = new Error('Cannot find module') as { code?: string };
      missing.code = 'ERR_MODULE_NOT_FOUND';
      throw missing;
    });
    const io = createMemoryCliIo();
    const command = new Command('compare');

    await module.executeDiffCompareCommand({
      previous: undefined,
      next: undefined,
      command,
      io,
    });

    expect(io.stderrBuffer).toContain('Please install @dtifx/diff');
    expect(process.exitCode).toBe(1);
    module.__testing.setDiffModuleImporter();
  });
});

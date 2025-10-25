import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractCommandModule } from './extract-command-module.js';
import { createExtractCliKernel, runExtractCli } from './run-extract-cli.js';

const createCliKernelMock = vi.hoisted(() => vi.fn());

vi.mock('../../kernel/cli-kernel.js', () => ({
  createCliKernel: createCliKernelMock,
}));

describe('extract CLI entrypoints', () => {
  beforeEach(() => {
    createCliKernelMock.mockReset();
  });

  it('registers the extract command module when creating kernels', () => {
    const kernel = { register: vi.fn(), run: vi.fn() };
    createCliKernelMock.mockReturnValue(kernel);

    const result = createExtractCliKernel({ programName: 'dtifx', version: '0.0.0-test' });

    expect(createCliKernelMock).toHaveBeenCalledWith({
      programName: 'dtifx',
      version: '0.0.0-test',
    });
    expect(kernel.register).toHaveBeenCalledWith(extractCommandModule);
    expect(result).toBe(kernel);
  });

  it('runs the CLI kernel with provided arguments', async () => {
    const run = vi.fn().mockResolvedValue(42);
    const kernel = { register: vi.fn(), run };
    createCliKernelMock.mockReturnValue(kernel);

    const exitCode = await runExtractCli({
      argv: ['node', 'dtifx', 'extract', '--help'],
      programName: 'dtifx',
      version: '1.2.3',
      description: 'Extract tokens',
    });

    expect(createCliKernelMock).toHaveBeenCalledWith({
      programName: 'dtifx',
      version: '1.2.3',
      description: 'Extract tokens',
      io: undefined,
    });
    expect(run).toHaveBeenCalledWith(['node', 'dtifx', 'extract', '--help']);
    expect(exitCode).toBe(42);
  });
});

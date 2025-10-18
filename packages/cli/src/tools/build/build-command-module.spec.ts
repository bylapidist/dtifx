import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCliKernel } from '../../kernel/cli-kernel.js';
import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { buildCommandModule } from './build-command-module.js';

vi.mock('./generate-command-runner.js', () => ({
  executeBuildGenerateCommand: vi.fn(() => Promise.resolve()),
}));

vi.mock('./inspect-command-runner.js', () => ({
  executeBuildInspectCommand: vi.fn(() => Promise.resolve()),
}));

vi.mock('./validate-command-runner.js', () => ({
  executeBuildValidateCommand: vi.fn(() => Promise.resolve()),
}));

vi.mock('./watch-command-runner.js', () => ({
  executeBuildWatchCommand: vi.fn(() => Promise.resolve()),
}));

const loadGenerateRunner = async () => {
  const module = await import('./generate-command-runner.js');
  return { executeBuildGenerateCommand: vi.mocked(module.executeBuildGenerateCommand) };
};

const loadInspectRunner = async () => {
  const module = await import('./inspect-command-runner.js');
  return { executeBuildInspectCommand: vi.mocked(module.executeBuildInspectCommand) };
};

const loadValidateRunner = async () => {
  const module = await import('./validate-command-runner.js');
  return { executeBuildValidateCommand: vi.mocked(module.executeBuildValidateCommand) };
};

const loadWatchRunner = async () => {
  const module = await import('./watch-command-runner.js');
  return { executeBuildWatchCommand: vi.mocked(module.executeBuildWatchCommand) };
};

describe('buildCommandModule', () => {
  const kernelOptions = {
    programName: 'dtifx',
    version: '0.0.0-test',
  } as const;

  beforeEach(async () => {
    const { executeBuildGenerateCommand } = await loadGenerateRunner();
    executeBuildGenerateCommand.mockReset();
    const { executeBuildValidateCommand } = await loadValidateRunner();
    executeBuildValidateCommand.mockReset();
    const { executeBuildWatchCommand } = await loadWatchRunner();
    executeBuildWatchCommand.mockReset();
  });

  it('prints help output when build is invoked without a subcommand', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(buildCommandModule);

    const exitCode = await kernel.run(['node', 'dtifx', 'build']);

    expect(exitCode).toBe(0);
    expect(io.stdoutBuffer).toContain('Usage: dtifx build');
  });

  it('runs the generate command through the shared workflow', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(buildCommandModule);

    const { executeBuildGenerateCommand } = await loadGenerateRunner();

    const exitCode = await kernel.run(['node', 'dtifx', 'build', 'generate', '--json-logs']);

    expect(exitCode).toBe(0);
    expect(executeBuildGenerateCommand).toHaveBeenCalledTimes(1);
  });

  it('runs the validate command through the shared workflow', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(buildCommandModule);

    const { executeBuildGenerateCommand } = await loadGenerateRunner();
    const { executeBuildInspectCommand } = await loadInspectRunner();
    const { executeBuildValidateCommand } = await loadValidateRunner();

    const exitCode = await kernel.run(['node', 'dtifx', 'build', 'validate', '--json-logs']);

    expect(exitCode).toBe(0);
    expect(executeBuildValidateCommand).toHaveBeenCalledTimes(1);
    expect(executeBuildGenerateCommand).not.toHaveBeenCalled();
    expect(executeBuildInspectCommand).not.toHaveBeenCalled();
  });

  it('runs the inspect command through the shared workflow', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(buildCommandModule);

    const { executeBuildGenerateCommand } = await loadGenerateRunner();
    const { executeBuildInspectCommand } = await loadInspectRunner();

    const exitCode = await kernel.run(['node', 'dtifx', 'build', 'inspect', '--json']);

    expect(exitCode).toBe(0);
    expect(executeBuildInspectCommand).toHaveBeenCalledTimes(1);
    expect(executeBuildGenerateCommand).not.toHaveBeenCalled();
  });

  it('runs the watch command through the shared workflow', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    kernel.register(buildCommandModule);

    const { executeBuildWatchCommand } = await loadWatchRunner();

    const exitCode = await kernel.run(['node', 'dtifx', 'build', 'watch']);

    expect(exitCode).toBe(0);
    expect(executeBuildWatchCommand).toHaveBeenCalledTimes(1);
  });
});

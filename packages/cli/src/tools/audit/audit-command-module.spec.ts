import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import process from 'node:process';

import { createCliKernel } from '../../kernel/cli-kernel.js';
import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { auditCommandModule } from './audit-command-module.js';

const { loadAuditModuleMock } = vi.hoisted(() => ({
  loadAuditModuleMock: vi.fn(),
}));

vi.mock('./audit-command-runner.js', () => ({
  executeAuditCommand: vi.fn(() => Promise.resolve()),
}));

vi.mock('./audit-module-loader.js', () => ({
  loadAuditModule: (...args: Parameters<typeof loadAuditModuleMock>) =>
    loadAuditModuleMock(...args),
}));

const loadAuditRunner = async () => {
  const module = await import('./audit-command-runner.js');
  return { executeAuditCommand: vi.mocked(module.executeAuditCommand) };
};

describe('auditCommandModule', () => {
  const kernelOptions = {
    programName: 'dtifx',
    version: '0.0.0-test',
  } as const;
  let originalExitCode: number | undefined;

  beforeEach(async () => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    const { executeAuditCommand } = await loadAuditRunner();
    executeAuditCommand.mockReset();
    loadAuditModuleMock.mockReset();
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('runs the audit workflow via the run subcommand', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    loadAuditModuleMock.mockResolvedValue({});

    kernel.register(auditCommandModule);

    const { executeAuditCommand } = await loadAuditRunner();

    const exitCode = await kernel.run(['node', 'dtifx', 'audit', 'run']);

    expect(exitCode).toBe(0);
    expect(executeAuditCommand).toHaveBeenCalledTimes(1);
    const [request] = executeAuditCommand.mock.calls[0] ?? [];
    expect(request).toBeDefined();
    expect(request?.io).toBe(io);
    expect(request?.command).toBeInstanceOf(Command);
    expect(request?.command.name()).toBe('run');
    expect(request?.dependencies?.auditModule).toBeDefined();
  });

  it('supports audit options defined on the parent command', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    loadAuditModuleMock.mockResolvedValue({});
    kernel.register(auditCommandModule);

    const { executeAuditCommand } = await loadAuditRunner();

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'audit',
      '--json-logs',
      'run',
      '--reporter',
      'json',
    ]);

    expect(exitCode).toBe(0);
    expect(executeAuditCommand).toHaveBeenCalledTimes(1);
    const [request] = executeAuditCommand.mock.calls[0] ?? [];
    expect(request).toBeDefined();
    expect(request?.command.parent?.getOptionValueSource?.('jsonLogs')).toBe('cli');
    const { resolveAuditCliOptions } = await import('./options.js');
    const resolved = resolveAuditCliOptions(request!.command);
    expect(resolved).toMatchObject({
      jsonLogs: true,
      reporter: 'json',
    });
  });

  it('reports a friendly error when the audit module is missing', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...kernelOptions, io });

    loadAuditModuleMock.mockImplementation(async ({ io: commandIo }) => {
      commandIo.writeErr('The "@dtifx/audit" package is required. Please install @dtifx/audit.\n');
      return;
    });

    kernel.register(auditCommandModule);

    const { executeAuditCommand } = await loadAuditRunner();

    const exitCode = await kernel.run(['node', 'dtifx', 'audit', 'run']);

    expect(exitCode).toBe(1);
    expect(executeAuditCommand).not.toHaveBeenCalled();
    expect(io.stderrBuffer).toContain('Please install @dtifx/audit');
    expect(process.exitCode).toBeUndefined();
  });
});

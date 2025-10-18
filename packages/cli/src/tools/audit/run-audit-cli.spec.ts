import process from 'node:process';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./audit-command-module.js', () => {
  const registerMock = vi.fn();
  return {
    auditCommandModule: {
      id: 'audit.workflows',
      register: registerMock,
    },
    registerMock,
  };
});

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { createAuditCliKernel, runAuditCli } from './run-audit-cli.js';

const loadRegisterMock = async () => {
  const module = (await import('./audit-command-module.js')) as {
    registerMock: ReturnType<typeof vi.fn>;
  };
  return vi.mocked(module.registerMock);
};

describe('runAuditCli', () => {
  beforeEach(async () => {
    const registerMock = await loadRegisterMock();
    registerMock.mockReset();
  });

  it('registers the audit command module when creating the kernel', async () => {
    const registerMock = await loadRegisterMock();
    const io = createMemoryCliIo();

    createAuditCliKernel({ programName: 'dtifx', version: '0.0.0-test', io });

    expect(registerMock).toHaveBeenCalledTimes(1);
  });

  it('runs the CLI kernel with the provided argv', async () => {
    const registerMock = await loadRegisterMock();
    registerMock.mockImplementation((program) => {
      program.command('noop').action(() => {});
    });

    const io = createMemoryCliIo();
    const exitCode = await runAuditCli({
      programName: 'dtifx',
      version: '0.0.0-test',
      io,
      argv: ['node', 'dtifx', 'noop'],
    });

    expect(exitCode).toBe(0);
  });

  it('returns a non-zero code when the command sets process.exitCode', async () => {
    const registerMock = await loadRegisterMock();
    registerMock.mockImplementation((program) => {
      program.command('fail').action(() => {
        process.exitCode = 1;
      });
    });

    const io = createMemoryCliIo();
    const exitCode = await runAuditCli({
      programName: 'dtifx',
      version: '0.0.0-test',
      io,
      argv: ['node', 'dtifx', 'fail'],
    });

    expect(exitCode).toBe(1);
    expect(process.exitCode).toBeUndefined();
  });
});

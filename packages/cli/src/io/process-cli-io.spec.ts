import { describe, expect, it, vi } from 'vitest';

import { createProcessCliIo } from './process-cli-io.js';

const createStubProcess = () => {
  const stdout = { write: vi.fn() } as unknown as NodeJS.WriteStream;
  const stderr = { write: vi.fn() } as unknown as NodeJS.WriteStream;
  const stdin = {} as NodeJS.ReadStream;
  const exit = vi.fn() as unknown as NodeJS.Process['exit'];

  return {
    stdin,
    stdout,
    stderr,
    exit,
    exitCode: undefined as number | undefined,
  } as unknown as NodeJS.Process & { exitCode: number | undefined };
};

describe('createProcessCliIo', () => {
  it('adapts the provided process IO streams', () => {
    const stubProcess = createStubProcess();
    const io = createProcessCliIo({ process: stubProcess });

    io.writeOut('hello');
    io.writeErr('oops');
    io.exit(5);

    expect(io.stdin).toBe(stubProcess.stdin);
    expect(io.stdout).toBe(stubProcess.stdout);
    expect(io.stderr).toBe(stubProcess.stderr);
    expect(stubProcess.stdout.write).toHaveBeenCalledWith('hello');
    expect(stubProcess.stderr.write).toHaveBeenCalledWith('oops');
    expect(stubProcess.exit).toHaveBeenCalledWith(5);
  });

  it('reuses a non-zero exitCode when exiting with zero', () => {
    const stubProcess = createStubProcess();
    stubProcess.exitCode = 3;
    const io = createProcessCliIo({ process: stubProcess });

    io.exit(0);

    expect(stubProcess.exit).toHaveBeenCalledWith(3);
  });

  it('prefers the explicit exit code when process exitCode is zero', () => {
    const stubProcess = createStubProcess();
    stubProcess.exitCode = 0;
    const io = createProcessCliIo({ process: stubProcess });

    io.exit(0);

    expect(stubProcess.exit).toHaveBeenCalledWith(0);
  });
});

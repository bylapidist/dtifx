import { describe, expect, it, vi } from 'vitest';

vi.mock('@dtifx/core', () => ({}));
vi.mock('@dtifx/audit', () => ({}));
vi.mock('@dtifx/build', () => ({}));
vi.mock('@dtifx/diff', () => ({}));

import { createCliKernel } from './index.js';
import type { CliGlobalOptions } from './kernel/types.js';
import { createMemoryCliIo } from './testing/memory-cli-io.js';

describe('CLI kernel', () => {
  const baseOptions = {
    programName: 'dtifx',
    version: '0.0.0-test',
  } as const;

  it('executes registered command actions', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...baseOptions, io });

    kernel.register({
      id: 'hello-command',
      register(command, context) {
        command
          .command('hello')
          .description('Prints a friendly greeting.')
          .action(() => {
            context.io.writeOut('Hello from the CLI kernel!');
          });
      },
    });

    const exitCode = await kernel.run(['node', 'dtifx', 'hello']);

    expect(exitCode).toBe(0);
    expect(io.stdoutBuffer).toContain('Hello from the CLI kernel!');
  });

  it('makes global options available to command modules', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...baseOptions, io });
    let observedOptions: CliGlobalOptions | undefined;

    kernel.register({
      id: 'inspect-globals',
      register(command, context) {
        command.command('inspect-globals').action(() => {
          observedOptions = context.getGlobalOptions();
        });
      },
    });

    await kernel.run(['node', 'dtifx', '--telemetry', 'off', '--json-logs', 'inspect-globals']);

    expect(observedOptions).toEqual({ telemetry: 'disabled', logFormat: 'json' });
  });

  it('reports unexpected errors to stderr and propagates a failure code', async () => {
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ ...baseOptions, io });

    kernel.register({
      id: 'explode',
      register(command) {
        command.command('explode').action(() => {
          throw new Error('boom');
        });
      },
    });

    const exitCode = await kernel.run(['node', 'dtifx', 'explode']);

    expect(exitCode).toBe(1);
    expect(io.stderrBuffer).toContain('boom');
  });
});

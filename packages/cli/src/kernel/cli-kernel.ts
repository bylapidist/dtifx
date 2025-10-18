import process from 'node:process';

import { CommanderError } from 'commander';

import { createCommanderProgram } from '../framework/commander/program.js';
import {
  createDefaultGlobalOptions,
  readGlobalOptions,
} from '../framework/commander/global-options.js';
import { createProcessCliIo } from '../io/process-cli-io.js';
import { formatCliError } from '../utils/format-cli-error.js';
import type {
  CliCommandModule,
  CliKernel,
  CliKernelContext,
  CliKernelOptions,
  CliGlobalOptions,
} from './types.js';

const readNonZeroProcessExitCode = (): number | undefined => {
  const exitCode = process.exitCode;
  if (typeof exitCode !== 'number') {
    return undefined;
  }

  return exitCode === 0 ? undefined : exitCode;
};

const readCommanderExitCode = (error: CommanderError): number | undefined => {
  const { exitCode } = error;
  if (typeof exitCode === 'number') {
    return exitCode;
  }

  if (typeof exitCode === 'string') {
    const parsedExitCode = Number.parseInt(exitCode, 10);
    return Number.isNaN(parsedExitCode) ? undefined : parsedExitCode;
  }

  return undefined;
};

export const createCliKernel = (options: CliKernelOptions): CliKernel => {
  const io = options.io ?? createProcessCliIo();
  const program = createCommanderProgram({
    name: options.programName,
    version: options.version,
    description: options.description,
    io,
  });

  const state: { globalOptions: CliGlobalOptions } = {
    globalOptions: createDefaultGlobalOptions(),
  };

  const context: CliKernelContext = {
    io,
    getGlobalOptions: () => state.globalOptions,
  };

  program.hook('preAction', () => {
    state.globalOptions = readGlobalOptions(program);
  });

  const runProgram = async (argv: readonly string[]): Promise<void> => {
    const args = [...argv];
    if (args.length === 0) {
      throw new Error('Argument vector must include at least the node executable.');
    }

    await program.parseAsync(args, { from: 'node' });
    state.globalOptions = readGlobalOptions(program);
  };

  return {
    register(module: CliCommandModule): CliKernel {
      module.register(program, context);
      return this;
    },
    async run(argv: readonly string[] = process.argv): Promise<number> {
      const previousExitCode = process.exitCode;

      try {
        await runProgram(argv);

        const processExitCode = readNonZeroProcessExitCode();
        return processExitCode ?? 0;
      } catch (error) {
        if (error instanceof CommanderError) {
          const processExitCode = readNonZeroProcessExitCode();
          const commanderExitCode = readCommanderExitCode(error);
          return processExitCode ?? commanderExitCode ?? 1;
        }

        const message = formatCliError(error);
        const needsNewline = message.endsWith('\n') ? '' : '\n';
        io.writeErr(`${message}${needsNewline}`);

        const processExitCode = readNonZeroProcessExitCode();
        return processExitCode ?? 1;
      } finally {
        process.exitCode = previousExitCode;
      }
    },
  };
};

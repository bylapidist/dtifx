import { Command } from 'commander';

import type { CliIo } from '../../io/cli-io.js';
import { registerGlobalOptions } from './global-options.js';

export interface CommanderProgramOptions {
  readonly name: string;
  readonly version: string;
  readonly description?: string | undefined;
  readonly io: CliIo;
}

export const createCommanderProgram = (options: CommanderProgramOptions): Command => {
  const program = new Command();

  program
    .name(options.name)
    .configureHelp({
      sortOptions: true,
    })
    .description(options.description ?? '')
    .version(options.version)
    .configureOutput({
      writeOut: (str: string) => options.io.writeOut(str),
      writeErr: (str: string) => options.io.writeErr(str),
      outputError: (str: string) => {
        options.io.writeErr(str);
      },
    })
    .enablePositionalOptions()
    .showHelpAfterError('(add --help for usage information)');

  registerGlobalOptions(program);
  program.exitOverride();

  return program;
};

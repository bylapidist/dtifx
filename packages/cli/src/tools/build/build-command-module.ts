import type { Command } from 'commander';

import type { CliCommandModule } from '../../kernel/types.js';
import { registerBuildGlobalOptions } from './options.js';
import { executeBuildGenerateCommand } from './generate-command-runner.js';
import { executeBuildInspectCommand } from './inspect-command-runner.js';
import { executeBuildValidateCommand } from './validate-command-runner.js';
import { executeBuildWatchCommand } from './watch-command-runner.js';

export const buildCommandModule: CliCommandModule = {
  id: 'build.workflows',
  register(program, context) {
    const buildCommand = program
      .command('build')
      .summary('Run DTIF build workflows.')
      .description('Execute DTIF build tooling.');

    buildCommand.helpOption('-h, --help', 'Display build command help.');
    registerBuildGlobalOptions(buildCommand);

    buildCommand.action(() => {
      buildCommand.help();
    });

    const validateCommand = buildCommand
      .command('validate')
      .summary('Plan sources and validate DTIF documents.')
      .description('Plan sources and validate DTIF documents without generating artifacts.');

    registerBuildGlobalOptions(validateCommand);
    validateCommand.allowUnknownOption(true);
    validateCommand.allowExcessArguments(true);
    validateCommand.action(async (_options: unknown, command: Command) => {
      await executeBuildValidateCommand({ command, io: context.io });
    });

    const generateCommand = buildCommand
      .command('generate')
      .summary('Execute the full DTIF build pipeline.')
      .description('Run the full build pipeline and write formatter artifacts to disk.');

    registerBuildGlobalOptions(generateCommand);
    generateCommand.allowUnknownOption(true);
    generateCommand.allowExcessArguments(true);
    generateCommand.action(async (_options: unknown, command: Command) => {
      await executeBuildGenerateCommand({ command, io: context.io });
    });

    const inspectCommand = buildCommand
      .command('inspect')
      .summary('Inspect resolved token snapshots for debugging.')
      .description('Inspect resolved tokens and optionally filter by pointer or token type.');

    inspectCommand
      .option('-p, --pointer <jsonPointer>', 'Filter tokens by JSON pointer prefix.')
      .option('-t, --type <tokenType>', 'Filter tokens by resolved $type value.')
      .option('--json', 'Emit JSON instead of human-readable output.', false);

    registerBuildGlobalOptions(inspectCommand);
    inspectCommand.allowUnknownOption(true);
    inspectCommand.allowExcessArguments(true);
    inspectCommand.action(async (_options: unknown, command: Command) => {
      await executeBuildInspectCommand({ command, io: context.io });
    });

    const watchCommand = buildCommand
      .command('watch')
      .summary('Watch DTIF sources and rebuild artifacts incrementally.')
      .description('Watch DTIF sources and regenerate artifacts when files change.');

    registerBuildGlobalOptions(watchCommand);
    watchCommand.allowUnknownOption(true);
    watchCommand.allowExcessArguments(true);
    watchCommand.action(async (_options: unknown, command: Command) => {
      await executeBuildWatchCommand({ command, io: context.io });
    });
  },
};

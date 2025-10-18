import process from 'node:process';

import type { Command } from 'commander';

import type { CliCommandModule } from '../../kernel/types.js';
import { registerAuditCliOptions } from './options.js';
import { executeAuditCommand } from './audit-command-runner.js';
import { loadAuditModule } from './audit-module-loader.js';

export const auditCommandModule: CliCommandModule = {
  id: 'audit.workflows',
  register(program, context) {
    const auditCommand = program
      .command('audit')
      .summary('Evaluate governance policies against resolved tokens.')
      .description('Run policy audits against resolved tokens without executing formatters.');

    auditCommand.helpOption('-h, --help', 'Display audit command help.');
    registerAuditCliOptions(auditCommand);
    auditCommand.action(() => {
      auditCommand.help();
    });

    const runCommand = auditCommand
      .command('run')
      .summary('Execute the audit workflow against resolved token snapshots.')
      .description('Resolve tokens and evaluate governance policies using configured reporters.');

    registerAuditCliOptions(runCommand);
    runCommand.allowUnknownOption(true);
    runCommand.allowExcessArguments(true);
    runCommand.action(async (_options: unknown, command: Command) => {
      const auditModule = await loadAuditModule({ io: context.io });
      if (auditModule) {
        await executeAuditCommand({
          command,
          io: context.io,
          dependencies: { auditModule },
        });
      } else {
        process.exitCode = 1;
      }
    });
  },
};

export { loadAuditModule } from './audit-module-loader.js';

import path from 'node:path';
import process from 'node:process';

import type { CliCommandModule } from '../../kernel/types.js';

interface DscpGenerateOptions {
  readonly from?: string;
  readonly out?: string;
}

export const dscpCommandModule: CliCommandModule = {
  id: 'dscp.workflows',
  register(program, context) {
    const dscpCommand = program
      .command('dscp')
      .summary('Generate DSCP design system documents.')
      .description('Generate canonical DESIGN_SYSTEM.md from a dtifx build output.');

    dscpCommand.helpOption('-h, --help', 'Display dscp command help.');

    dscpCommand.action(() => {
      dscpCommand.help();
    });

    const generateCommand = dscpCommand
      .command('generate')
      .summary('Generate DESIGN_SYSTEM.md from a dtifx build output directory.')
      .description(
        'Reads the token snapshot produced by `dtifx build generate` and writes ' +
          'a canonical DSCP v1 DESIGN_SYSTEM.md file.',
      );

    generateCommand
      .option(
        '--from <dir>',
        'Path to the dtifx build output directory containing tokens.json.',
        'tokens/build',
      )
      .option(
        '--out <file>',
        'Output file path for the generated DESIGN_SYSTEM.md.',
        'DESIGN_SYSTEM.md',
      );

    generateCommand.action(async (options: DscpGenerateOptions) => {
      const fromDir = path.resolve(process.cwd(), options.from ?? 'tokens/build');
      const outFile = path.resolve(process.cwd(), options.out ?? 'DESIGN_SYSTEM.md');

      try {
        const { generate } = await import('@dtifx/dscp');
        await generate({ from: fromDir, out: outFile });
        context.io.writeOut(`DESIGN_SYSTEM.md generated → ${outFile}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        context.io.writeErr(`dscp generate failed: ${message}`);
        process.exitCode = 1;
      }
    });
  },
};

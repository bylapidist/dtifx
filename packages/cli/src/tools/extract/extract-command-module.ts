import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { formatUnknownError } from '@dtifx/core';
import { CommanderError } from 'commander';

import type { CliCommandModule } from '../../kernel/types.js';

interface FigmaCommandOptions {
  readonly file: string;
  readonly token?: string;
  readonly node: string[];
  readonly output?: string;
  readonly pretty?: boolean;
  readonly apiBase?: string;
}

const collectRepeatableOption = (value: string, previous: string[]): string[] => {
  previous.push(value);
  return previous;
};

const resolveDefaultOutputPath = (fileKey: string): string => {
  return path.resolve(process.cwd(), path.join('tokens', `${fileKey}.figma.json`));
};

const ensureDirectory = async (targetPath: string): Promise<void> => {
  const directory = path.dirname(targetPath);
  await fs.mkdir(directory, { recursive: true });
};

const resolveFigmaToken = (options: FigmaCommandOptions): string => {
  const token = options.token ?? process.env['FIGMA_ACCESS_TOKEN'];
  if (!token) {
    throw new CommanderError(
      1,
      'FIGMA_TOKEN_MISSING',
      'Figma personal access token is required. Provide --token or set FIGMA_ACCESS_TOKEN.',
    );
  }
  return token;
};

export const extractCommandModule: CliCommandModule = {
  id: 'extract.providers',
  register(program, context) {
    const extractCommand = program
      .command('extract')
      .summary('Generate DTIF token documents from design providers.')
      .description(
        'Authenticate with design APIs and convert their nodes into DTIF token documents.',
      );

    extractCommand.helpOption('-h, --help', 'Display extractor command help.');

    const figmaCommand = extractCommand
      .command('figma')
      .summary('Extract tokens from a Figma file.')
      .description('Fetch Figma style nodes and emit a DTIF token document.');

    figmaCommand
      .requiredOption('--file <key>', 'Figma file key to extract.')
      .option('--token <token>', 'Figma personal access token. Defaults to FIGMA_ACCESS_TOKEN.')
      .option(
        '--node <id>',
        'Restrict extraction to specific node ids (repeatable).',
        collectRepeatableOption,
        [],
      )
      .option('--output <file>', 'Destination path for the generated DTIF document.')
      .option('--api-base <url>', 'Override the Figma API base URL (used for testing).')
      .option('--no-pretty', 'Disable pretty-printed JSON output.');

    figmaCommand.action(async (options: FigmaCommandOptions) => {
      try {
        const accessToken = resolveFigmaToken(options);
        const pretty = options.pretty !== false;
        const outputPath = path.resolve(options.output ?? resolveDefaultOutputPath(options.file));
        const { extractFigmaTokens } = await import('@dtifx/extractors');
        const extractorOptions = {
          fileKey: options.file,
          personalAccessToken: accessToken,
          ...(options.node.length > 0 ? { nodeIds: options.node } : {}),
          ...(options.apiBase ? { apiBaseUrl: options.apiBase } : {}),
          fetch: globalThis.fetch,
        } satisfies Parameters<typeof extractFigmaTokens>[0];
        const { document, warnings } = await extractFigmaTokens(extractorOptions);

        await ensureDirectory(outputPath);
        const payload = pretty
          ? `${JSON.stringify(document, undefined, 2)}\n`
          : JSON.stringify(document);
        await fs.writeFile(outputPath, payload, 'utf8');

        context.io.writeOut(`Extracted Figma tokens to ${outputPath}\n`);
        for (const warning of warnings) {
          context.io.writeErr(`Warning: ${warning.message}\n`);
        }
      } catch (error) {
        if (error instanceof CommanderError) {
          const message = error.message.trim();
          if (message.length > 0) {
            context.io.writeErr(`${message}\n`);
          }
          throw error;
        }
        const message = formatUnknownError(error);
        context.io.writeErr(`Failed to extract Figma tokens: ${message}\n`);
        throw new CommanderError(1, 'FIGMA_EXTRACTION_FAILED', message);
      }
    });
  },
};

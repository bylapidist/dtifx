import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

import type { Command } from 'commander';

import type { CliCommandModule } from '../../kernel/types.js';
import type { PackageManager } from './scaffold.js';
import { scaffoldWorkspace } from './scaffold.js';

interface InitCommandOptions {
  readonly packageManager?: string;
  readonly sampleData?: boolean;
  readonly git?: boolean;
  readonly yes?: boolean;
}

const packageManagers: readonly PackageManager[] = ['pnpm', 'npm', 'yarn', 'bun'];

const isPackageManager = (value: string): value is PackageManager => {
  return packageManagers.includes(value as PackageManager);
};

const sanitizeSegment = (segment: string): string => {
  return segment
    .toLowerCase()
    .replaceAll(/[^a-z0-9._~-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

const sanitizePackageName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'dtifx-workspace';
  }

  if (trimmed.startsWith('@')) {
    const [scope, pkg] = trimmed.slice(1).split('/');
    const sanitizedScope = sanitizeSegment(scope ?? '');
    const sanitizedPackage = sanitizeSegment(pkg ?? '');
    if (sanitizedScope && sanitizedPackage) {
      return `@${sanitizedScope}/${sanitizedPackage}`;
    }
    if (sanitizedScope) {
      return `@${sanitizedScope}/${sanitizedPackage || 'dtifx-workspace'}`;
    }
  }

  const sanitized = sanitizeSegment(trimmed);
  return sanitized.length > 0 ? sanitized : 'dtifx-workspace';
};

const askQuestion = async (
  prompt: string,
  defaultValue: string,
  readline: ReturnType<typeof createInterface>,
): Promise<string> => {
  const suffix = defaultValue.length > 0 ? ` (${defaultValue})` : '';
  const answer = await readline.question(`${prompt}${suffix}: `);
  const trimmed = answer.trim();
  return trimmed.length > 0 ? trimmed : defaultValue;
};

const askPackageManager = async (
  defaultValue: PackageManager,
  readline: ReturnType<typeof createInterface>,
): Promise<PackageManager> => {
  const choices = packageManagers.join('/');
  while (true) {
    const answer = await readline.question(`Package manager [${choices}] (${defaultValue}): `);
    const trimmed = answer.trim();
    if (trimmed.length === 0) {
      return defaultValue;
    }

    if (isPackageManager(trimmed.toLowerCase())) {
      return trimmed.toLowerCase() as PackageManager;
    }

    readline.write(`Please choose one of: ${choices}.\n`);
  }
};

const askBoolean = async (
  prompt: string,
  defaultValue: boolean,
  readline: ReturnType<typeof createInterface>,
): Promise<boolean> => {
  const hint = defaultValue ? 'Y/n' : 'y/N';
  while (true) {
    const answer = await readline.question(`${prompt} [${hint}]: `);
    const normalized = answer.trim().toLowerCase();
    if (normalized.length === 0) {
      return defaultValue;
    }

    if (normalized === 'y' || normalized === 'yes') {
      return true;
    }

    if (normalized === 'n' || normalized === 'no') {
      return false;
    }

    readline.write('Please answer yes or no.\n');
  }
};

export const initCommandModule: CliCommandModule = {
  id: 'init.scaffold',
  register(program, context) {
    const initCommand = program
      .command('init')
      .summary('Scaffold a DTIFx workspace with optional sample data.')
      .description('Create a new DTIFx workspace with configuration, tokens, and integrations.');

    initCommand
      .argument('[project-name]', 'Directory for the new workspace.')
      .option('-p, --package-manager <manager>', 'Package manager to use (pnpm, npm, yarn, bun).')
      .option('--no-sample-data', 'Skip sample tokens and integration stubs.')
      .option('--no-git', 'Skip git initialisation.')
      .option('--yes', 'Accept defaults and skip interactive prompts.', false);

    initCommand.action(
      async (projectName: string | undefined, options: InitCommandOptions, command: Command) => {
        const cwd = process.cwd();
        const defaultDirectoryName = projectName
          ? path.basename(path.resolve(cwd, projectName))
          : 'dtifx-workspace';

        const defaultDisplayName = defaultDirectoryName;
        const defaultPackageManager: PackageManager =
          options.packageManager && isPackageManager(options.packageManager)
            ? (options.packageManager as PackageManager)
            : 'pnpm';
        const defaultSampleData = options.sampleData ?? true;
        const defaultGit = options.git ?? true;

        if (options.packageManager && !isPackageManager(options.packageManager)) {
          command.error(`Unknown package manager: ${options.packageManager}`);
          return;
        }

        if (options.yes) {
          const displayName = defaultDisplayName;
          const packageName = sanitizePackageName(displayName);
          const destination = path.resolve(cwd, projectName ?? packageName);
          await scaffoldWorkspace({
            metadata: {
              name: packageName,
              displayName,
              packageManager: defaultPackageManager,
              includeSampleData: defaultSampleData,
              initializeGit: defaultGit,
              destination,
            },
            io: context.io,
          });
          return;
        }

        const readline = createInterface({
          input: context.io.stdin,
          output: context.io.stdout,
          terminal: true,
        });

        try {
          const displayName = await askQuestion('Workspace name', defaultDisplayName, readline);
          const packageManager = await askPackageManager(defaultPackageManager, readline);
          const includeSampleData = await askBoolean(
            'Include sample data?',
            defaultSampleData,
            readline,
          );
          const initializeGit = await askBoolean(
            'Initialise git repository?',
            defaultGit,
            readline,
          );

          const packageName = sanitizePackageName(displayName);
          const destination = path.resolve(cwd, projectName ?? packageName);

          await scaffoldWorkspace({
            metadata: {
              name: packageName,
              displayName,
              packageManager,
              includeSampleData,
              initializeGit,
              destination,
            },
            io: context.io,
          });
        } finally {
          readline.close();
        }
      },
    );
  },
};

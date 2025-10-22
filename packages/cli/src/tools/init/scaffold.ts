import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import type { CliIo } from '../../io/cli-io.js';

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

export interface InitMetadata {
  readonly name: string;
  readonly displayName: string;
  readonly packageManager: PackageManager;
  readonly includeSampleData: boolean;
  readonly initializeGit: boolean;
  readonly destination: string;
}

export interface ScaffoldWorkspaceOptions {
  readonly metadata: InitMetadata;
  readonly io: CliIo;
  readonly runCommand?: RunCommand | undefined;
  readonly templateRoot?: string | undefined;
}

type RunCommand = (
  command: string,
  args: readonly string[],
  options: { readonly cwd: string },
) => Promise<void>;

const packageManagerTags: Record<PackageManager, string> = {
  pnpm: 'pnpm@9',
  npm: 'npm@10',
  yarn: 'yarn@4',
  bun: 'bun@1',
};

const packageManagerInstallArgs: Record<PackageManager, readonly string[]> = {
  pnpm: ['install'],
  npm: ['install'],
  yarn: ['install'],
  bun: ['install'],
};

const isEnoent = (error: unknown): error is NodeJS.ErrnoException => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
};

const ensureEmptyDirectory = async (destination: string): Promise<void> => {
  try {
    const stats = await stat(destination);
    if (!stats.isDirectory()) {
      throw new Error(`Destination ${destination} exists and is not a directory.`);
    }

    const entries = await readdir(destination);
    if (entries.length > 0) {
      throw new Error(`Destination ${destination} is not empty.`);
    }
  } catch (error) {
    if (isEnoent(error)) {
      await mkdir(destination, { recursive: true });
      return;
    }

    throw error;
  }
};

const applyReplacements = (content: string, replacements: Record<string, string>): string => {
  let result = content;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.split(token).join(value);
  }

  return result;
};

const copyTemplateDirectory = async (
  source: string,
  destination: string,
  replacements: Record<string, string>,
): Promise<void> => {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const outputName =
      entry.isFile() && entry.name.endsWith('.template')
        ? entry.name.slice(0, -'.template'.length)
        : entry.name;
    const destinationPath = path.join(destination, outputName);

    if (entry.isDirectory()) {
      await copyTemplateDirectory(sourcePath, destinationPath, replacements);
      continue;
    }

    if (entry.isFile()) {
      const content = await readFile(sourcePath, 'utf8');
      const rendered = applyReplacements(content, replacements);
      await writeFile(destinationPath, rendered, 'utf8');
    }
  }
};

const findTemplatesRoot = async (override?: string | undefined): Promise<string> => {
  if (override) {
    return override;
  }

  const templateCandidates: string[] = [];
  let directory = path.dirname(fileURLToPath(import.meta.url));

  for (let index = 0; index < 6; index += 1) {
    const candidate = path.join(directory, 'templates');
    templateCandidates.push(candidate);
    directory = path.dirname(directory);
  }

  for (const candidate of templateCandidates) {
    try {
      const stats = await stat(candidate);
      if (stats.isDirectory()) {
        return candidate;
      }
    } catch (error) {
      if (isEnoent(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Unable to locate CLI template assets.');
};

const createDefaultRunCommand =
  (io: CliIo): RunCommand =>
  (command, args, options) => {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        stdio: 'pipe',
        env: process.env,
      });

      child.stdout?.on('data', (chunk: Buffer | string) => {
        io.writeOut(typeof chunk === 'string' ? chunk : chunk.toString());
      });

      child.stderr?.on('data', (chunk: Buffer | string) => {
        io.writeErr(typeof chunk === 'string' ? chunk : chunk.toString());
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`Command ${command} ${args.join(' ')} exited with code ${code}.`));
      });
    });
  };

export const scaffoldWorkspace = async (options: ScaffoldWorkspaceOptions): Promise<void> => {
  const { metadata, io } = options;
  const runCommand = options.runCommand ?? createDefaultRunCommand(io);
  const templateRoot = await findTemplatesRoot(options.templateRoot);

  await ensureEmptyDirectory(metadata.destination);

  const replacements: Record<string, string> = {
    __PROJECT_NAME__: metadata.displayName,
    '**PROJECT_NAME**': metadata.displayName,
    __PACKAGE_NAME__: metadata.name,
    __PACKAGE_MANAGER_TAG__: packageManagerTags[metadata.packageManager],
  };

  io.writeOut(`Scaffolding DTIFx workspace in ${metadata.destination}\n`);

  const baseTemplate = path.join(templateRoot, 'base');
  await copyTemplateDirectory(baseTemplate, metadata.destination, replacements);

  if (metadata.includeSampleData) {
    const sampleTemplate = path.join(templateRoot, 'sample-data');
    await copyTemplateDirectory(sampleTemplate, metadata.destination, replacements);
  }

  const installArgs = packageManagerInstallArgs[metadata.packageManager];
  io.writeOut(`\nInstalling dependencies with ${metadata.packageManager}…\n`);
  try {
    await runCommand(metadata.packageManager, installArgs, { cwd: metadata.destination });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to install dependencies with ${metadata.packageManager}: ${message}`, {
      cause: error instanceof Error ? error : undefined,
    });
  }

  if (metadata.initializeGit) {
    io.writeOut('\nInitialising Git repository…\n');
    try {
      await runCommand('git', ['init'], { cwd: metadata.destination });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialise Git repository: ${message}`, {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  io.writeOut('\nDTIFx workspace ready!\n');
};

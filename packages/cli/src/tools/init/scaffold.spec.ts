import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { scaffoldWorkspace } from './scaffold.js';

describe('scaffoldWorkspace', () => {
  const templateRoot = fileURLToPath(new URL('../../../templates', import.meta.url));
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(tmpdir(), 'dtifx-init-'));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('copies templates, installs dependencies, and initialises git', async () => {
    const destination = path.join(workspaceRoot, 'demo-project');
    const commands: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    const io = createMemoryCliIo();

    await scaffoldWorkspace({
      metadata: {
        name: 'demo-project',
        displayName: 'Demo Project',
        packageManager: 'pnpm',
        includeSampleData: true,
        initializeGit: true,
        destination,
      },
      io,
      runCommand: async (command, args, options) => {
        commands.push({ command, args, cwd: options.cwd });
      },
      templateRoot,
    });

    const files = await readdir(destination);
    expect(files).toEqual(
      expect.arrayContaining(['README.md', 'package.json', 'dtifx.config.mjs']),
    );

    const packageManifest = JSON.parse(
      await readFile(path.join(destination, 'package.json'), 'utf8'),
    ) as {
      readonly name: string;
      readonly packageManager: string;
    };
    expect(packageManifest.name).toBe('demo-project');
    expect(packageManifest.packageManager).toContain('pnpm');

    const readme = await readFile(path.join(destination, 'README.md'), 'utf8');
    expect(readme).toContain('Demo Project');

    await expect(stat(path.join(destination, 'tokens', 'foundation.json'))).resolves.toBeDefined();
    await expect(stat(path.join(destination, 'tokens', 'product.json'))).resolves.toBeDefined();

    expect(commands).toEqual([
      { command: 'pnpm', args: ['install'], cwd: destination },
      { command: 'git', args: ['init'], cwd: destination },
    ]);
    expect(io.stdoutBuffer).toContain('Scaffolding DTIFx workspace');
    expect(io.stdoutBuffer).toContain('DTIFx workspace ready');
  });

  it('skips sample data when requested', async () => {
    const destination = path.join(workspaceRoot, 'minimal');
    const io = createMemoryCliIo();

    await scaffoldWorkspace({
      metadata: {
        name: 'minimal',
        displayName: 'Minimal',
        packageManager: 'npm',
        includeSampleData: false,
        initializeGit: false,
        destination,
      },
      io,
      runCommand: async () => {},
      templateRoot,
    });

    await expect(stat(path.join(destination, 'tokens', 'foundation.json'))).rejects.toThrow();
    const tokenEntries = await readdir(path.join(destination, 'tokens'));
    expect(tokenEntries).toEqual(expect.arrayContaining(['README.md']));
  });

  it('throws when the destination is not empty', async () => {
    const destination = path.join(workspaceRoot, 'existing');
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, 'README.md'), '# Existing');

    const io = createMemoryCliIo();

    await expect(
      scaffoldWorkspace({
        metadata: {
          name: 'existing',
          displayName: 'Existing',
          packageManager: 'pnpm',
          includeSampleData: false,
          initializeGit: false,
          destination,
        },
        io,
        runCommand: async () => {},
        templateRoot,
      }),
    ).rejects.toThrow('is not empty');
  });
});

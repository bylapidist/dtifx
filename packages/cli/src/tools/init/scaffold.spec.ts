import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';

type SpawnMock = ReturnType<typeof vi.fn>;

const spawnMock: SpawnMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

const scaffoldModulePromise = import('./scaffold.js');

// eslint-disable-next-line unicorn/prefer-event-target -- child processes implement the EventEmitter contract
class MockChildProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
}

const createMockSpawn = (options: {
  readonly code: number;
  readonly stdout?: readonly string[];
  readonly stderr?: readonly string[];
}): MockChildProcess => {
  const child = new MockChildProcess();
  queueMicrotask(() => {
    for (const chunk of options.stdout ?? []) {
      child.stdout.emit('data', chunk);
    }
    for (const chunk of options.stderr ?? []) {
      child.stderr.emit('data', chunk);
    }
    child.emit('close', options.code);
  });
  return child;
};

const createTemplateRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dtifx-cli-template-'));
  await mkdir(path.join(root, 'base', 'nested'), { recursive: true });
  await writeFile(
    path.join(root, 'base', 'README.md.template'),
    '# __PROJECT_NAME__ using __PACKAGE_MANAGER_TAG__',
    'utf8',
  );
  await writeFile(
    path.join(root, 'base', 'config.json.template'),
    '{"name":"__PACKAGE_NAME__"}',
    'utf8',
  );
  await writeFile(path.join(root, 'base', 'plain.txt'), 'Plain content', 'utf8');
  await writeFile(
    path.join(root, 'base', 'nested', 'note.template'),
    'Nested __PROJECT_NAME__',
    'utf8',
  );
  await mkdir(path.join(root, 'sample-data'), { recursive: true });
  await writeFile(path.join(root, 'sample-data', 'example.txt'), 'Sample content', 'utf8');
  return root;
};

describe('scaffoldWorkspace', () => {
  let templateRoot: string;
  let workspaceRoot: string;

  beforeEach(async () => {
    templateRoot = await createTemplateRoot();
    workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'dtifx-cli-workspace-'));
    spawnMock.mockReset();
  });

  afterEach(async () => {
    await rm(templateRoot, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('renders templates, installs dependencies, and initialises git', async () => {
    const { scaffoldWorkspace } = await scaffoldModulePromise;
    const destination = path.join(workspaceRoot, 'project');
    const io = createMemoryCliIo();
    const commands: string[] = [];

    await scaffoldWorkspace({
      metadata: {
        name: 'cli-app',
        displayName: 'CLI App',
        packageManager: 'pnpm',
        includeSampleData: true,
        initializeGit: true,
        destination,
      },
      io,
      templateRoot,
      async runCommand(command, args) {
        commands.push([command, ...args].join(' '));
      },
    });

    const readme = await readFile(path.join(destination, 'README.md'), 'utf8');
    expect(readme).toContain('# CLI App using pnpm@9');

    const config = await readFile(path.join(destination, 'config.json'), 'utf8');
    expect(config).toBe('{"name":"cli-app"}');

    const sampleData = await readFile(path.join(destination, 'example.txt'), 'utf8');
    expect(sampleData).toBe('Sample content');

    const nested = await readFile(path.join(destination, 'nested', 'note'), 'utf8');
    expect(nested).toBe('Nested CLI App');

    const plain = await readFile(path.join(destination, 'plain.txt'), 'utf8');
    expect(plain).toBe('Plain content');

    expect(commands).toEqual(['pnpm install', 'git init']);
    expect(io.stdoutBuffer).toContain('Scaffolding DTIFx workspace');
    expect(io.stdoutBuffer).toContain('DTIFx workspace ready');
  });

  it('wraps dependency installation failures with helpful context', async () => {
    const { scaffoldWorkspace } = await scaffoldModulePromise;
    const destination = path.join(workspaceRoot, 'fails');
    const io = createMemoryCliIo();

    spawnMock.mockImplementationOnce(() =>
      createMockSpawn({ code: 1, stderr: ['permission denied'] }),
    );

    await expect(
      scaffoldWorkspace({
        metadata: {
          name: 'cli-app',
          displayName: 'CLI App',
          packageManager: 'pnpm',
          includeSampleData: false,
          initializeGit: false,
          destination,
        },
        io,
        templateRoot,
      }),
    ).rejects.toThrow(/Failed to install dependencies/);

    expect(io.stderrBuffer).toContain('permission denied');
    expect(spawnMock).toHaveBeenCalledWith(
      'pnpm',
      ['install'],
      expect.objectContaining({ cwd: destination }),
    );
  });

  it('streams default run command output on success', async () => {
    const { scaffoldWorkspace } = await scaffoldModulePromise;
    const destination = path.join(workspaceRoot, 'default-success');
    const io = createMemoryCliIo();

    spawnMock.mockImplementationOnce(() =>
      createMockSpawn({ code: 0, stdout: ['install ok'], stderr: ['minor warning'] }),
    );

    await scaffoldWorkspace({
      metadata: {
        name: 'cli-app',
        displayName: 'CLI App',
        packageManager: 'pnpm',
        includeSampleData: false,
        initializeGit: false,
        destination,
      },
      io,
      templateRoot,
    });

    expect(io.stdoutBuffer).toContain('install ok');
    expect(io.stderrBuffer).toContain('minor warning');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('wraps git initialisation failures with helpful context', async () => {
    const { scaffoldWorkspace } = await scaffoldModulePromise;
    const destination = path.join(workspaceRoot, 'git-failure');
    const io = createMemoryCliIo();

    await expect(
      scaffoldWorkspace({
        metadata: {
          name: 'cli-app',
          displayName: 'CLI App',
          packageManager: 'pnpm',
          includeSampleData: false,
          initializeGit: true,
          destination,
        },
        io,
        templateRoot,
        async runCommand(command, args) {
          if (command === 'git') {
            throw new Error('git not available');
          }
          if (command === 'pnpm') {
            return;
          }
          throw new Error(`Unexpected command ${command} ${args.join(' ')}`);
        },
      }),
    ).rejects.toThrow(/Failed to initialise Git repository/);
  });

  it('fails fast when destination directory is not empty', async () => {
    const { scaffoldWorkspace } = await scaffoldModulePromise;
    const destination = path.join(workspaceRoot, 'existing');
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, 'file.txt'), 'existing', 'utf8');
    const io = createMemoryCliIo();

    await expect(
      scaffoldWorkspace({
        metadata: {
          name: 'cli-app',
          displayName: 'CLI App',
          packageManager: 'pnpm',
          includeSampleData: false,
          initializeGit: false,
          destination,
        },
        io,
        templateRoot,
      }),
    ).rejects.toThrow(/Destination .* is not empty/);
  });
});

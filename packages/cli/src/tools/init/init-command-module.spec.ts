import path from 'node:path';
import process from 'node:process';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { questionMock, closeMock, writeMock, createInterfaceMock } = vi.hoisted(() => {
  const question = vi.fn<(query: string) => Promise<string>>();
  const close = vi.fn<[], void>();
  const write = vi.fn<(text: string) => void>();
  const createInterface = vi.fn(() => ({
    question,
    close,
    write,
  }));

  return {
    questionMock: question,
    closeMock: close,
    writeMock: write,
    createInterfaceMock: createInterface,
  };
});

vi.mock('node:readline/promises', () => {
  return {
    createInterface: createInterfaceMock,
  };
});

vi.mock('./scaffold.js', () => {
  return {
    scaffoldWorkspace: vi.fn(async () => {}),
  };
});

import { createCliKernel } from '../../kernel/cli-kernel.js';
import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { initCommandModule } from './init-command-module.js';

const loadScaffoldMock = async () => {
  const module = (await import('./scaffold.js')) as {
    scaffoldWorkspace: ReturnType<typeof vi.fn>;
  };
  return vi.mocked(module.scaffoldWorkspace);
};

describe('initCommandModule', () => {
  beforeEach(async () => {
    const scaffoldWorkspaceMock = await loadScaffoldMock();
    scaffoldWorkspaceMock.mockReset();
    questionMock?.mockReset();
    closeMock?.mockReset();
    writeMock?.mockReset();
    createInterfaceMock?.mockReset();
  });

  it('prompts for metadata and scaffolds the workspace', async () => {
    const scaffoldWorkspaceMock = await loadScaffoldMock();
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ programName: 'dtifx', version: '0.0.0-test', io });

    kernel.register(initCommandModule);

    if (!questionMock || !closeMock) {
      throw new Error('readline mocks not initialised');
    }

    questionMock.mockResolvedValueOnce('Design System');
    questionMock.mockResolvedValueOnce('yarn');
    questionMock.mockResolvedValueOnce('y');
    questionMock.mockResolvedValueOnce('n');

    await kernel.run(['node', 'dtifx', 'init']);

    expect(scaffoldWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);

    const call = scaffoldWorkspaceMock.mock.calls[0]?.[0];
    expect(call?.metadata).toMatchObject({
      name: 'design-system',
      displayName: 'Design System',
      packageManager: 'yarn',
      includeSampleData: true,
      initializeGit: false,
      destination: path.resolve(process.cwd(), 'design-system'),
    });
  });

  it('accepts defaults when the yes flag is provided', async () => {
    const scaffoldWorkspaceMock = await loadScaffoldMock();
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ programName: 'dtifx', version: '0.0.0-test', io });

    kernel.register(initCommandModule);

    questionMock.mockReset();

    const exitCode = await kernel.run([
      'node',
      'dtifx',
      'init',
      'workspace-demo',
      '--yes',
      '--package-manager',
      'npm',
      '--no-sample-data',
      '--no-git',
    ]);

    expect(exitCode).toBe(0);
    expect(scaffoldWorkspaceMock).toHaveBeenCalledTimes(1);

    const call = scaffoldWorkspaceMock.mock.calls[0]?.[0];
    expect(call?.metadata).toMatchObject({
      name: 'workspace-demo',
      displayName: 'workspace-demo',
      packageManager: 'npm',
      includeSampleData: false,
      initializeGit: false,
      destination: path.resolve(process.cwd(), 'workspace-demo'),
    });
  });

  it('normalises interactive answers and validates prompts', async () => {
    const scaffoldWorkspaceMock = await loadScaffoldMock();
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ programName: 'dtifx', version: '0.0.0-test', io });

    kernel.register(initCommandModule);

    if (!questionMock || !writeMock || !closeMock) {
      throw new Error('readline mocks not initialised');
    }

    questionMock.mockResolvedValueOnce('  @Scope / My App  '); // workspace name
    questionMock.mockResolvedValueOnce('invalid-manager'); // package manager (invalid)
    questionMock.mockResolvedValueOnce('bun'); // package manager retry
    questionMock.mockResolvedValueOnce('maybe'); // sample data invalid
    questionMock.mockResolvedValueOnce('n'); // sample data retry
    questionMock.mockResolvedValueOnce('  '); // git prompt default

    const exitCode = await kernel.run(['node', 'dtifx', 'init']);

    expect(exitCode).toBe(0);
    expect(writeMock).toHaveBeenCalledWith(expect.stringMatching(/Please choose one of/));
    expect(writeMock).toHaveBeenCalledWith('Please answer yes or no.\n');
    expect(scaffoldWorkspaceMock).toHaveBeenCalledTimes(1);

    const call = scaffoldWorkspaceMock.mock.calls[0]?.[0];
    expect(call?.metadata).toMatchObject({
      name: '@scope/my-app',
      displayName: '@Scope / My App',
      packageManager: 'bun',
      includeSampleData: false,
      initializeGit: true,
      destination: path.resolve(process.cwd(), '@scope/my-app'),
    });
  });

  it('reports unknown package managers immediately', async () => {
    const scaffoldWorkspaceMock = await loadScaffoldMock();
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ programName: 'dtifx', version: '0.0.0-test', io });

    kernel.register(initCommandModule);

    const exitCode = await kernel.run(['node', 'dtifx', 'init', '--package-manager', 'deno']);

    expect(exitCode).toBe(1);
    expect(scaffoldWorkspaceMock).not.toHaveBeenCalled();
    expect(io.stderrBuffer).toContain('Unknown package manager: deno');
  });

  it('sanitises scoped package names when using yes flag', async () => {
    const scaffoldWorkspaceMock = await loadScaffoldMock();
    const io = createMemoryCliIo();
    const kernel = createCliKernel({ programName: 'dtifx', version: '0.0.0-test', io });

    kernel.register(initCommandModule);

    const exitCode = await kernel.run(['node', 'dtifx', 'init', '@Design-System/', '--yes']);

    expect(exitCode).toBe(0);
    expect(scaffoldWorkspaceMock).toHaveBeenCalledTimes(1);

    const call = scaffoldWorkspaceMock.mock.calls[0]?.[0];
    expect(call?.metadata).toMatchObject({
      name: '@design-system/dtifx-workspace',
      displayName: '@Design-System',
      destination: path.resolve(process.cwd(), '@Design-System'),
    });
  });
});

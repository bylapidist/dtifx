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
});

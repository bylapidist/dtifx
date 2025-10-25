import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliIo } from '../../io/cli-io.js';

const createIo = (): CliIo => ({
  stdin: {} as NodeJS.ReadStream,
  stdout: { write: vi.fn() } as unknown as NodeJS.WritableStream,
  stderr: { write: vi.fn() } as unknown as NodeJS.WritableStream,
  writeOut: vi.fn(),
  writeErr: vi.fn(),
  exit: vi.fn() as unknown as CliIo['exit'],
});

describe('build module loaders', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('loads the @dtifx/build module once and reuses the cached promise', async () => {
    const { loadBuildModule, setBuildModuleImportersForTesting } = await import(
      './build-module.js'
    );
    const buildModule = { symbol: Symbol('build') } as Awaited<ReturnType<typeof loadBuildModule>>;
    setBuildModuleImportersForTesting({ build: async () => buildModule });
    const io = createIo();

    const first = await loadBuildModule(io);
    const second = await loadBuildModule(io);

    expect(first?.symbol).toBe(buildModule.symbol);
    expect(second).toBe(first);
  });

  it('informs users when @dtifx/build cannot be resolved', async () => {
    const { loadBuildModule, setBuildModuleImportersForTesting } = await import(
      './build-module.js'
    );
    setBuildModuleImportersForTesting({
      build: async () => {
        const error = new Error('module not found') as NodeJS.ErrnoException;
        error.code = 'ERR_MODULE_NOT_FOUND';
        throw error;
      },
    });
    const io = createIo();

    let thrown: unknown;
    let result: Awaited<ReturnType<typeof loadBuildModule>> | undefined;
    try {
      result = await loadBuildModule(io);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeUndefined();
    expect(result).toBeUndefined();
    expect(io.writeErr).toHaveBeenCalledWith(
      'The "@dtifx/build" package is required. Please install @dtifx/build.\n',
    );
  });

  it('rethrows unexpected load errors for @dtifx/build', async () => {
    const { loadBuildModule, setBuildModuleImportersForTesting } = await import(
      './build-module.js'
    );
    setBuildModuleImportersForTesting({
      build: async () => {
        throw new Error('unexpected failure');
      },
    });
    const io = createIo();

    await expect(loadBuildModule(io)).rejects.toThrow('unexpected failure');
  });

  it('loads the @dtifx/build reporter module and caches results', async () => {
    const { loadBuildReporterModule, setBuildModuleImportersForTesting } = await import(
      './build-module.js'
    );
    const reporterModule = { reporters: true } as Awaited<
      ReturnType<typeof loadBuildReporterModule>
    >;
    setBuildModuleImportersForTesting({ reporters: async () => reporterModule });
    const io = createIo();

    const first = await loadBuildReporterModule(io);
    const second = await loadBuildReporterModule(io);

    expect(first?.reporters).toBe(true);
    expect(second).toBe(first);
  });

  it('reports missing reporter modules gracefully', async () => {
    const { loadBuildReporterModule, setBuildModuleImportersForTesting } = await import(
      './build-module.js'
    );
    setBuildModuleImportersForTesting({
      reporters: async () => {
        const error = new Error('module not found') as NodeJS.ErrnoException;
        error.code = 'ERR_MODULE_NOT_FOUND';
        throw error;
      },
    });
    const io = createIo();

    let thrown: unknown;
    let result: Awaited<ReturnType<typeof loadBuildReporterModule>> | undefined;
    try {
      result = await loadBuildReporterModule(io);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeUndefined();
    expect(result).toBeUndefined();
    expect(io.writeErr).toHaveBeenCalledWith(
      'The "@dtifx/build" package is required. Please install @dtifx/build.\n',
    );
  });

  it('loads build modules using the default importers', async () => {
    vi.doMock('@dtifx/build', () => ({ createBuildPipeline: vi.fn() }), { virtual: true });
    vi.doMock('@dtifx/build/cli/reporters', () => ({ reporters: ['json'] }), { virtual: true });

    const { loadBuildModule, loadBuildReporterModule, setBuildModuleImportersForTesting } =
      await import('./build-module.js');
    const io = createIo();

    const module = await loadBuildModule(io);
    expect(module).toBeDefined();

    const reporters = await loadBuildReporterModule(io);
    expect(reporters).toBeDefined();

    setBuildModuleImportersForTesting();

    const moduleAfterReset = await loadBuildModule(io);
    expect(moduleAfterReset).toBeDefined();

    const reportersAfterReset = await loadBuildReporterModule(io);
    expect(reportersAfterReset).toBeDefined();
  });
});

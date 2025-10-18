import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Command } from 'commander';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { executeBuildWatchCommand } from './watch-command-runner.js';

const {
  resolveConfigPathMock,
  startWatchPipelineMock,
  prepareBuildEnvironmentMock,
  createReporterMock,
} = vi.hoisted(() => {
  const resolveConfigPath = vi.fn(async () => '/path/to/config.json');
  const startWatchPipeline = vi.fn(async () => ({ close: vi.fn() }));
  const prepareBuildEnvironment = vi.fn();
  const createReporter = vi.fn();
  return {
    resolveConfigPathMock: resolveConfigPath,
    startWatchPipelineMock: startWatchPipeline,
    prepareBuildEnvironmentMock: prepareBuildEnvironment,
    createReporterMock: createReporter,
  };
});

class MockWatcher {}
class MockScheduler {}

const buildModule = {
  resolveConfigPath: resolveConfigPathMock,
  startWatchPipeline: startWatchPipelineMock,
  ChokidarWatcher: MockWatcher,
  SequentialTaskScheduler: MockScheduler,
} as const;

const reporterModule = {
  createReporter: createReporterMock,
} as const;

vi.mock('./build-module.js', () => ({
  loadBuildModule: vi.fn(async () => buildModule),
  loadBuildReporterModule: vi.fn(async () => reporterModule),
}));

vi.mock('./environment.js', () => ({
  prepareBuildEnvironment: prepareBuildEnvironmentMock,
}));

const createCommandWithOptions = (options: Record<string, unknown>): Command => {
  return {
    opts: () => options,
    optsWithGlobals: () => options,
  } as unknown as Command;
};

describe('executeBuildWatchCommand', () => {
  const io = createMemoryCliIo();
  const environment = {
    logger: { log: vi.fn() },
  } as const;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    prepareBuildEnvironmentMock.mockReset();
    prepareBuildEnvironmentMock.mockResolvedValue(environment);
    resolveConfigPathMock.mockClear();
    startWatchPipelineMock.mockClear();
    createReporterMock.mockReset();
    createReporterMock.mockReturnValue({
      buildSuccess: vi.fn(),
    });
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('starts the watch pipeline with prepared environment factories', async () => {
    const command = createCommandWithOptions({
      jsonLogs: true,
      timings: true,
      reporter: 'json',
      config: '/custom/config.json',
      outDir: 'dist',
    });

    await executeBuildWatchCommand({ command, io });

    expect(resolveConfigPathMock).toHaveBeenCalledWith({ configPath: '/custom/config.json' });
    expect(startWatchPipelineMock).toHaveBeenCalledTimes(1);

    const options = startWatchPipelineMock.mock.calls[0]![0]!;

    expect(options.initialReason).toBe('initial build');
    expect(options.watcher).toBeInstanceOf(MockWatcher);
    expect(options.scheduler).toBeInstanceOf(MockScheduler);

    const documentCache = { cache: 'doc' } as const;
    const tokenCache = { cache: 'token' } as const;

    await options.environmentFactory({
      configPath: '/other/config.json',
      documentCache,
      tokenCache,
    });

    expect(prepareBuildEnvironmentMock).toHaveBeenCalledWith(
      {
        jsonLogs: true,
        timings: true,
        reporter: 'json',
        outDir: 'dist',
        config: '/other/config.json',
      },
      io,
      documentCache,
      tokenCache,
      { build: buildModule, reporters: reporterModule },
    );

    options.createReporter(environment);

    expect(createReporterMock).toHaveBeenCalledWith({
      format: 'json',
      logger: environment.logger,
      includeTimings: true,
      stdout: { write: expect.any(Function) },
      stderr: { write: expect.any(Function) },
      cwd: process.cwd(),
    });
  });

  it('reports a friendly error when the build module is unavailable', async () => {
    const command = createCommandWithOptions({});
    const buildModuleExports = await import('./build-module.js');
    vi.mocked(buildModuleExports.loadBuildModule).mockImplementationOnce(async (ioArg) => {
      ioArg.writeErr('The "@dtifx/build" package is required. Please install @dtifx/build.\n');
      return;
    });

    await executeBuildWatchCommand({ command, io });

    expect(io.stderrBuffer).toContain('Please install @dtifx/build');
    expect(startWatchPipelineMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

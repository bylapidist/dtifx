import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Command } from 'commander';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { executeBuildGenerateCommand } from './generate-command-runner.js';

const {
  createBuildStageTelemetryEventSubscriberMock,
  createReporterMock,
  executeBuildMock,
  prepareBuildEnvironmentMock,
} = vi.hoisted(() => {
  return {
    createBuildStageTelemetryEventSubscriberMock: vi.fn(() => ({
      type: 'telemetry-subscriber',
    })),
    createReporterMock: vi.fn(() => ({
      format: 'human' as const,
      buildSuccess: vi.fn(),
      buildFailure: vi.fn(),
    })),
    executeBuildMock: vi.fn(),
    prepareBuildEnvironmentMock: vi.fn(),
  };
});

const telemetrySpan = () => ({
  startChild: vi.fn(() => ({ end: vi.fn() })),
  end: vi.fn(),
});

const buildModule = {
  createBuildStageTelemetryEventSubscriber: createBuildStageTelemetryEventSubscriberMock,
  executeBuild: executeBuildMock,
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

describe('executeBuildGenerateCommand', () => {
  const io = createMemoryCliIo();
  const span = telemetrySpan();
  const subscribe = vi.fn(() => ({ unsubscribe: vi.fn() }));
  const environment = {
    loaded: { config: { name: 'config' } },
    logger: { log: vi.fn() },
    telemetry: { tracer: { startSpan: vi.fn(() => span) }, exportSpans: vi.fn(async () => {}) },
    documentCache: {},
    tokenCache: {},
    services: {
      eventBus: { subscribe },
    },
    policyConfiguration: { definitions: [] },
    dispose: vi.fn(),
  };

  const buildResult = {
    metrics: { totalCount: 10, typedCount: 4 },
    formatters: [{ name: 'foo' }],
    writtenArtifacts: new Map<string, readonly unknown[]>([
      ['foo', [{ path: 'dist/foo.txt' }]],
      ['bar', [{ path: 'dist/bar.txt' }, { path: 'dist/bar.json' }]],
    ]),
  } as const;

  let originalExitCode: number | undefined;

  beforeEach(async () => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    prepareBuildEnvironmentMock.mockReset();
    prepareBuildEnvironmentMock.mockResolvedValue(environment);
    createReporterMock.mockClear();
    subscribe.mockClear();
    environment.dispose.mockClear();
    environment.telemetry.tracer.startSpan = vi.fn(() => span);
    span.end.mockClear();
    environment.telemetry.exportSpans.mockClear();
    createReporterMock.mockReturnValue({
      format: 'human',
      buildSuccess: vi.fn(),
      buildFailure: vi.fn(),
    });
    executeBuildMock.mockResolvedValue(buildResult as never);
    createBuildStageTelemetryEventSubscriberMock.mockClear();
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('executes the build pipeline and reports success', async () => {
    const command = createCommandWithOptions({
      jsonLogs: false,
      timings: true,
      reporter: 'human',
    });

    await executeBuildGenerateCommand({ command, io });

    expect(prepareBuildEnvironmentMock).toHaveBeenCalledWith(
      {
        jsonLogs: false,
        timings: true,
        reporter: 'human',
      },
      io,
      undefined,
      undefined,
      { build: buildModule, reporters: reporterModule },
    );
    expect(executeBuildMock).toHaveBeenCalledWith(
      environment.services,
      environment.loaded.config,
      environment.telemetry.tracer,
      { parentSpan: span },
    );
    const reporter = createReporterMock.mock.results[0]!.value as {
      buildSuccess: ReturnType<typeof vi.fn>;
      buildFailure: ReturnType<typeof vi.fn>;
    };
    expect(reporter.buildSuccess).toHaveBeenCalledWith({
      result: buildResult,
      writtenArtifacts: buildResult.writtenArtifacts,
      reason: 'generate',
    });
    expect(reporter.buildFailure).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledWith({
      attributes: {
        tokenCount: buildResult.metrics.totalCount,
        typedTokenCount: buildResult.metrics.typedCount,
        formatterCount: buildResult.formatters.length,
        artifactCount: 3,
      },
    });
    expect(subscribe).toHaveBeenCalledWith({ type: 'telemetry-subscriber' });
    expect(environment.telemetry.exportSpans).toHaveBeenCalledTimes(1);
    expect(environment.dispose).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  it('reports failures and sets exit code when execution throws', async () => {
    const error = new Error('generate failed');
    executeBuildMock.mockRejectedValueOnce(error);
    const command = createCommandWithOptions({ jsonLogs: false, timings: false });

    await executeBuildGenerateCommand({ command, io });

    const reporter = createReporterMock.mock.results[0]!.value as {
      buildFailure: ReturnType<typeof vi.fn>;
    };
    expect(reporter.buildFailure).toHaveBeenCalledWith(error);
    expect(process.exitCode).toBe(1);
  });

  it('reports a friendly error when the build module is unavailable', async () => {
    const command = createCommandWithOptions({});
    const localIo = createMemoryCliIo();
    const buildModuleExports = await import('./build-module.js');
    vi.mocked(buildModuleExports.loadBuildModule).mockImplementationOnce(async (ioArg) => {
      ioArg.writeErr('The "@dtifx/build" package is required. Please install @dtifx/build.\n');
      return;
    });

    await executeBuildGenerateCommand({ command, io: localIo });

    expect(localIo.stderrBuffer).toContain('Please install @dtifx/build');
    expect(prepareBuildEnvironmentMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('reports a friendly error when the reporter module is unavailable', async () => {
    const command = createCommandWithOptions({});
    const localIo = createMemoryCliIo();
    const buildModuleExports = await import('./build-module.js');
    vi.mocked(buildModuleExports.loadBuildReporterModule).mockImplementationOnce(async (ioArg) => {
      ioArg.writeErr('The "@dtifx/build" package is required. Please install @dtifx/build.\n');
      return;
    });

    await executeBuildGenerateCommand({ command, io: localIo });

    expect(localIo.stderrBuffer).toContain('Please install @dtifx/build');
    expect(prepareBuildEnvironmentMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Command } from 'commander';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { executeBuildValidateCommand } from './validate-command-runner.js';

const {
  createBuildStageTelemetryEventSubscriberMock,
  createReporterMock,
  prepareBuildEnvironmentMock,
} = vi.hoisted(() => {
  return {
    createBuildStageTelemetryEventSubscriberMock: vi.fn(() => ({
      type: 'telemetry-subscriber',
    })),
    createReporterMock: vi.fn(() => ({
      format: 'human' as const,
      validateSuccess: vi.fn(),
      buildFailure: vi.fn(),
    })),
    prepareBuildEnvironmentMock: vi.fn(),
  };
});

const telemetrySpan = () => ({
  startChild: vi.fn(() => ({ end: vi.fn() })),
  end: vi.fn(),
});

const buildModule = {
  createBuildStageTelemetryEventSubscriber: createBuildStageTelemetryEventSubscriberMock,
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

describe('executeBuildValidateCommand', () => {
  const io = createMemoryCliIo();
  const span = telemetrySpan();
  const subscribe = vi.fn(() => ({ unsubscribe: vi.fn() }));
  const plan = vi.fn(async () => ({ entries: [{}, {}] }));
  const environment = {
    logger: { log: vi.fn() },
    telemetry: { tracer: { startSpan: vi.fn(() => span) }, exportSpans: vi.fn(async () => {}) },
    documentCache: {},
    tokenCache: {},
    services: {
      eventBus: { subscribe },
      planner: { plan },
    },
    policyConfiguration: { definitions: [] },
    dispose: vi.fn(),
  };
  let originalExitCode: number | undefined;

  beforeEach(async () => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    prepareBuildEnvironmentMock.mockReset();
    prepareBuildEnvironmentMock.mockResolvedValue(environment);
    createReporterMock.mockClear();
    plan.mockClear();
    subscribe.mockClear();
    environment.dispose.mockClear();
    environment.telemetry.tracer.startSpan = vi.fn(() => span);
    span.startChild.mockClear();
    span.end.mockClear();
    environment.telemetry.exportSpans.mockClear();
    createReporterMock.mockReturnValue({
      format: 'human',
      validateSuccess: vi.fn(),
      buildFailure: vi.fn(),
    });
    createBuildStageTelemetryEventSubscriberMock.mockClear();
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('invokes planner and reporter when validation succeeds', async () => {
    const command = createCommandWithOptions({
      jsonLogs: false,
      timings: true,
      reporter: 'human',
    });

    await executeBuildValidateCommand({ command, io });

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
    expect(plan).toHaveBeenCalledTimes(1);
    const reporter = createReporterMock.mock.results[0]!.value as {
      validateSuccess: ReturnType<typeof vi.fn>;
      buildFailure: ReturnType<typeof vi.fn>;
    };
    expect(reporter.validateSuccess).toHaveBeenCalledTimes(1);
    expect(reporter.buildFailure).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith({ type: 'telemetry-subscriber' });
    expect(environment.telemetry.exportSpans).toHaveBeenCalledTimes(1);
    expect(environment.dispose).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  it('reports failures and sets exit code when planning throws', async () => {
    const error = new Error('plan failed');
    plan.mockRejectedValueOnce(error);
    const command = createCommandWithOptions({ jsonLogs: false, timings: false });

    await executeBuildValidateCommand({ command, io });

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

    await executeBuildValidateCommand({ command, io: localIo });

    expect(localIo.stderrBuffer).toContain('Please install @dtifx/build');
    expect(prepareBuildEnvironmentMock).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

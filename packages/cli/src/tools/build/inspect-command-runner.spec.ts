import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Command } from 'commander';

import type { BuildRunResult } from '@dtifx/build';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import type { MemoryCliIo } from '../../testing/memory-cli-io.js';
import { executeBuildInspectCommand } from './inspect-command-runner.js';

vi.mock('commander', () => ({
  Command: class MockCommand {
    optsWithGlobals(): Record<string, unknown> {
      return {};
    }
  },
  Option: class MockOption {
    choices(): this {
      return this;
    }

    default(): this {
      return this;
    }

    argParser(): this {
      return this;
    }
  },
}));

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
      buildFailure: vi.fn(),
    })),
    executeBuildMock: vi.fn(),
    prepareBuildEnvironmentMock: vi.fn(),
  };
});

const telemetrySpan = () => ({
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

interface ReporterMock {
  buildFailure: ReturnType<typeof vi.fn>;
}

const createBuildResult = (overrides: Partial<BuildRunResult> = {}): BuildRunResult => {
  const tokenSnapshot = {
    pointer: '/design/colors/brand',
    sourcePointer: '/colors/brand',
    token: { type: 'color', value: '#ff0000', raw: '#ff0000' },
    resolution: { value: '#ff0000' },
    metadata: { description: 'Brand color' },
    provenance: {
      sourceId: 'tokens',
      layer: 'base',
      layerIndex: 0,
      uri: '/workspace/tokens.json',
      pointerPrefix: '/colors',
    },
    context: {},
  } as unknown as BuildRunResult['tokens'][number];

  const transformResult = {
    transform: 'scale',
    pointer: tokenSnapshot.pointer,
    output: { value: 0.5 },
    snapshot: tokenSnapshot,
    group: 'default',
    optionsHash: 'hash',
    cacheStatus: 'hit',
  } as unknown as BuildRunResult['transforms'][number];

  const base: BuildRunResult = {
    plan: { entries: [], createdAt: new Date() },
    resolved: { entries: [], diagnostics: [], resolvedAt: new Date() },
    tokens: [tokenSnapshot],
    transforms: [transformResult],
    formatters: [],
    timings: {
      planMs: 1,
      parseMs: 1,
      resolveMs: 1,
      transformMs: 1,
      formatMs: 1,
      dependencyMs: 1,
      totalMs: 5,
    },
    metrics: {
      totalCount: 1,
      typedCount: 1,
      untypedCount: 0,
      typeCounts: { color: 1 },
      aliasDepth: { average: 0, max: 0, histogram: {} },
      references: { referencedCount: 0, unreferencedCount: 1, unreferencedSamples: [] },
    },
    transformCache: { hits: 0, misses: 0, skipped: 0 },
    dependencyChanges: undefined,
    writtenArtifacts: new Map(),
    runContext: undefined,
  } as unknown as BuildRunResult;

  return { ...base, ...overrides };
};

describe('executeBuildInspectCommand', () => {
  let io: MemoryCliIo;
  const span = telemetrySpan();
  const subscribe = vi.fn(() => ({ unsubscribe: vi.fn() }));
  let environment: Awaited<ReturnType<typeof prepareBuildEnvironmentMock>>;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    io = createMemoryCliIo();
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    prepareBuildEnvironmentMock.mockReset();
    environment = {
      logger: { log: vi.fn() },
      telemetry: { tracer: { startSpan: vi.fn(() => span) }, exportSpans: vi.fn(async () => {}) },
      services: { eventBus: { subscribe } },
      loaded: {
        config: { name: 'config' },
        directory: '/workspace',
        path: '/workspace/build.config.ts',
      },
      documentCache: {},
      tokenCache: {},
      policyConfiguration: { definitions: [] },
      dispose: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof prepareBuildEnvironmentMock>>;

    prepareBuildEnvironmentMock.mockResolvedValue(environment);
    createReporterMock.mockClear();
    executeBuildMock.mockReset();
    subscribe.mockClear();
    environment.dispose.mockClear();
    environment.telemetry.exportSpans.mockClear();
    environment.telemetry.tracer.startSpan = vi.fn(() => span);
    span.end.mockClear();
    createBuildStageTelemetryEventSubscriberMock.mockClear();
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('prints matched tokens with transform summaries', async () => {
    const command = createCommandWithOptions({
      jsonLogs: false,
      timings: false,
      pointer: '/design',
      type: 'color',
    });

    executeBuildMock.mockResolvedValueOnce(createBuildResult());

    await executeBuildInspectCommand({ command, io });

    expect(executeBuildMock).toHaveBeenCalledWith(
      environment.services,
      environment.loaded.config,
      environment.telemetry.tracer,
      expect.objectContaining({ includeFormatters: false }),
    );

    expect(io.stdoutBuffer).toContain('/design/colors/brand (color)');
    expect(io.stdoutBuffer).toContain('  value: "#ff0000"');
    expect(io.stdoutBuffer).toContain('  transforms:');
    expect(io.stdoutBuffer).toContain('    scale: {"value":0.5}');
    expect(io.stdoutBuffer).toContain('  source: /workspace/tokens.json');
    expect(span.end).toHaveBeenCalledWith({ attributes: { matchCount: 1 } });
    expect(process.exitCode).toBeUndefined();

    const reporter = createReporterMock.mock.results[0]!.value as ReporterMock;
    expect(reporter.buildFailure).not.toHaveBeenCalled();
  });

  it('prints a helpful message when no tokens match', async () => {
    const command = createCommandWithOptions({
      jsonLogs: false,
      timings: false,
      pointer: '/noop',
    });

    executeBuildMock.mockResolvedValueOnce(
      createBuildResult({
        tokens: [],
        transforms: [],
      }),
    );

    await executeBuildInspectCommand({ command, io });

    expect(io.stdoutBuffer).toContain('No tokens matched the provided filters.');
    expect(process.exitCode).toBeUndefined();
  });

  it('prints JSON output when requested', async () => {
    const command = createCommandWithOptions({ jsonLogs: false, timings: false, json: true });
    executeBuildMock.mockResolvedValueOnce(createBuildResult());

    await executeBuildInspectCommand({ command, io });

    const payload = JSON.parse(io.stdoutBuffer) as { tokens: unknown[] };
    expect(Array.isArray(payload.tokens)).toBe(true);
    expect(payload.tokens).toHaveLength(1);
    expect(payload.tokens[0]).toMatchObject({ pointer: '/design/colors/brand', type: 'color' });
  });

  it('reports failures and sets exit code', async () => {
    const error = new Error('inspect failed');
    const command = createCommandWithOptions({ jsonLogs: false, timings: false });
    executeBuildMock.mockRejectedValueOnce(error);

    await executeBuildInspectCommand({ command, io });

    const reporter = createReporterMock.mock.results[0]!.value as ReporterMock;
    expect(reporter.buildFailure).toHaveBeenCalledWith(error);
    expect(process.exitCode).toBe(1);
    expect(span.end).toHaveBeenCalledWith({ status: 'error' });
  });

  it('reports a friendly error when the build module is unavailable', async () => {
    const command = createCommandWithOptions({});
    const buildModuleExports = await import('./build-module.js');
    vi.mocked(buildModuleExports.loadBuildModule).mockImplementationOnce(async (ioArg) => {
      ioArg.writeErr('The "@dtifx/build" package is required. Please install @dtifx/build.\n');
      return;
    });

    await executeBuildInspectCommand({ command, io });

    expect(io.stderrBuffer).toContain('Please install @dtifx/build');
    expect(prepareBuildEnvironmentMock).not.toHaveBeenCalled();
    expect(executeBuildMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

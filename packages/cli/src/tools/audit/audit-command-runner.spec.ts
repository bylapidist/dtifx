import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Command } from 'commander';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { executeAuditCommand } from './audit-command-runner.js';

const {
  createAuditReporterMock,
  createAuditRuntimeMock,
  prepareAuditEnvironmentMock,
  runtimeRunMock,
  loadAuditModuleMock,
  auditModule,
} = vi.hoisted(() => {
  const createAuditReporterMock = vi.fn(() => ({
    format: 'human' as const,
    auditSuccess: vi.fn(),
    auditFailure: vi.fn(),
  }));
  const createAuditRuntimeMock = vi.fn();
  const prepareAuditEnvironmentMock = vi.fn();
  const runtimeRunMock = vi.fn();
  const loadAuditModuleMock = vi.fn();
  const auditModule = {
    createAuditReporter: createAuditReporterMock,
    createAuditRuntime: createAuditRuntimeMock,
    createAuditTokenResolutionEnvironment: vi.fn(),
    resolveAuditConfigPath: vi.fn(),
    loadAuditConfiguration: vi.fn(),
  };

  return {
    createAuditReporterMock,
    createAuditRuntimeMock,
    prepareAuditEnvironmentMock,
    runtimeRunMock,
    loadAuditModuleMock,
    auditModule,
  };
});

const telemetrySpan = () => ({
  startChild: vi.fn(() => ({ startChild: vi.fn(), end: vi.fn() })),
  end: vi.fn(),
});

vi.mock('./environment.js', () => ({
  prepareAuditEnvironment: prepareAuditEnvironmentMock,
}));

vi.mock('./options.js', () => ({
  resolveAuditCliOptions: vi.fn((command: Command) => command.opts()),
}));

vi.mock('./audit-module-loader.js', () => ({
  loadAuditModule: (...args: Parameters<typeof loadAuditModuleMock>) =>
    loadAuditModuleMock(...args),
}));

const createCommandWithOptions = (options: Record<string, unknown>): Command => {
  const defaults = {
    reporter: 'human',
    jsonLogs: false,
    timings: false,
  } as const;
  const merged = { ...defaults, ...options };
  return {
    opts: () => merged,
    optsWithGlobals: () => merged,
  } as unknown as Command;
};

describe('executeAuditCommand', () => {
  const io = createMemoryCliIo();
  const span = telemetrySpan();
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(() => ({ unsubscribe }));
  const environment = {
    logger: { log: vi.fn() },
    telemetry: { tracer: { startSpan: vi.fn(() => span) }, exportSpans: vi.fn(async () => {}) },
    policyConfiguration: {
      definitions: [{ id: 'policy-1' }],
    },
    tokens: {
      resolve: vi.fn(),
    },
    dispose: vi.fn(),
  } as const;
  const buildResult = {
    tokens: [
      {
        pointer: '/tokens/1',
        token: { type: 'color' },
        provenance: { uri: 'file://token.json' },
      },
    ],
    metrics: {
      totalCount: 3,
      typedCount: 2,
      references: { unreferencedCount: 1 },
    },
    timings: {
      totalMs: 120,
      planMs: 30,
      parseMs: 20,
      resolveMs: 40,
      transformMs: 20,
      formatMs: 5,
      dependencyMs: 5,
    },
    runContext: { previous: '0.0.1', next: '0.0.2' },
  } as const;
  const auditResult = {
    policies: [],
    summary: {
      policyCount: 0,
      violationCount: 0,
      severity: { error: 0, warning: 0, info: 0 },
      tokenCount: buildResult.tokens.length,
    },
    timings: {
      planMs: 30,
      parseMs: 20,
      resolveMs: 40,
      transformMs: 20,
      formatMs: 5,
      dependencyMs: 5,
      totalMs: 120,
      auditMs: 75,
      totalWithAuditMs: 195,
    },
    metadata: { runContext: buildResult.runContext },
  } as const satisfies Parameters<ReturnType<typeof createAuditReporterMock>['auditSuccess']>[0];
  let runtimeOptions: Parameters<typeof createAuditRuntimeMock>[0] | undefined;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    prepareAuditEnvironmentMock.mockResolvedValue(environment);
    loadAuditModuleMock.mockResolvedValue(auditModule as never);
    createAuditReporterMock.mockReturnValue({
      format: 'markdown',
      auditSuccess: vi.fn(),
      auditFailure: vi.fn(),
    });
    createAuditRuntimeMock.mockImplementation((options) => {
      runtimeOptions = options;
      return { run: runtimeRunMock };
    });
    runtimeRunMock.mockImplementation(async () => {
      if (!runtimeOptions) {
        throw new Error('runtime options missing');
      }
      const activeSpan = runtimeOptions.telemetry.tracer.startSpan(
        runtimeOptions.spanName ?? 'dtifx.cli.audit',
      );
      expect(runtimeOptions.tokens).toBe(environment.tokens);
      const resolution = await runtimeOptions.tokens.resolve({ span: activeSpan });
      expect(resolution.snapshots).toEqual(buildResult.tokens);
      await runtimeOptions.telemetry.exportSpans();
      await runtimeOptions.dispose?.();
      const reporter = createAuditReporterMock.mock.results[0]!.value as {
        auditSuccess: ReturnType<typeof vi.fn>;
      };
      reporter.auditSuccess(auditResult);
      return auditResult;
    });
    span.startChild.mockClear();
    span.end.mockClear();
    unsubscribe.mockClear();
    subscribe.mockClear();
    environment.dispose.mockClear();
    environment.telemetry.exportSpans.mockClear();
    environment.telemetry.tracer.startSpan = vi.fn(() => span);
    createAuditRuntimeMock.mockClear();
    createAuditReporterMock.mockClear();
    prepareAuditEnvironmentMock.mockClear();
    loadAuditModuleMock.mockClear();
    vi.mocked(environment.tokens.resolve).mockReset();
    vi.mocked(environment.tokens.resolve).mockImplementation(async () => {
      const subscription = subscribe();
      try {
        return {
          snapshots: buildResult.tokens,
          metrics: {
            totalCount: buildResult.metrics.totalCount,
            typedCount: buildResult.metrics.typedCount,
            unreferencedCount: buildResult.metrics.references.unreferencedCount,
          },
          timings: {
            planMs: buildResult.timings.planMs,
            parseMs: buildResult.timings.parseMs,
            resolveMs: buildResult.timings.resolveMs,
            transformMs: buildResult.timings.transformMs,
            formatMs: buildResult.timings.formatMs,
            dependencyMs: buildResult.timings.dependencyMs,
            totalMs: buildResult.timings.totalMs,
          },
          metadata: { runContext: buildResult.runContext },
        };
      } finally {
        subscription.unsubscribe();
      }
    });
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('runs the audit workflow and reports success', async () => {
    const command = createCommandWithOptions({
      jsonLogs: false,
      timings: true,
      reporter: 'markdown',
    });

    await executeAuditCommand({ command, io });

    expect(loadAuditModuleMock).toHaveBeenCalledWith({ io });
    expect(prepareAuditEnvironmentMock).toHaveBeenCalledWith(
      { jsonLogs: false, timings: true, reporter: 'markdown' },
      io,
      undefined,
      undefined,
      { auditModule },
    );
    expect(createAuditReporterMock).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'markdown', includeTimings: true }),
    );
    expect(createAuditRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: environment.policyConfiguration,
        reporter: expect.objectContaining({ format: 'markdown' }),
        telemetry: environment.telemetry,
        spanName: 'dtifx.cli.audit',
      }),
    );
    expect(environment.tokens.resolve).toHaveBeenCalledWith({ span: expect.any(Object) });
    expect(unsubscribe).toHaveBeenCalled();
    const reporter = createAuditReporterMock.mock.results[0]!.value as {
      auditSuccess: ReturnType<typeof vi.fn>;
      auditFailure: ReturnType<typeof vi.fn>;
    };
    expect(reporter.auditSuccess).toHaveBeenCalledWith(auditResult);
    expect(reporter.auditFailure).not.toHaveBeenCalled();
    expect(environment.dispose).toHaveBeenCalled();
    expect(environment.telemetry.exportSpans).toHaveBeenCalled();
    const reporterOptions = createAuditReporterMock.mock.calls[0]?.[0];
    expect(reporterOptions).toBeDefined();
    reporterOptions?.stdout.write('audit-output\n');
    reporterOptions?.stderr.write('audit-error\n');
    expect(io.stdoutBuffer).toContain('audit-output');
    expect(io.stderrBuffer).toContain('audit-error');
    expect(process.exitCode).toBeUndefined();
  });

  it('reports a friendly error when the audit module cannot be loaded', async () => {
    const command = createCommandWithOptions({});
    loadAuditModuleMock.mockImplementationOnce(async ({ io: loaderIo }) => {
      loaderIo.writeErr('Please install @dtifx/audit.\n');
      return;
    });

    await executeAuditCommand({ command, io });

    expect(process.exitCode).toBe(1);
    expect(prepareAuditEnvironmentMock).not.toHaveBeenCalled();
    expect(createAuditReporterMock).not.toHaveBeenCalled();
    expect(createAuditRuntimeMock).not.toHaveBeenCalled();
    expect(io.stderrBuffer).toContain('Please install @dtifx/audit');
  });

  it('sets exit code when the audit environment cannot be prepared', async () => {
    const command = createCommandWithOptions({});
    prepareAuditEnvironmentMock.mockResolvedValueOnce();

    await executeAuditCommand({ command, io });

    expect(process.exitCode).toBe(1);
    expect(createAuditReporterMock).not.toHaveBeenCalled();
    expect(createAuditRuntimeMock).not.toHaveBeenCalled();
  });

  it('uses an injected audit module without reloading it', async () => {
    const command = createCommandWithOptions({ reporter: 'json' });

    await executeAuditCommand({
      command,
      io,
      dependencies: { auditModule: auditModule as never },
    });

    expect(loadAuditModuleMock).not.toHaveBeenCalled();
  });

  it('sets exit code when violations are reported', async () => {
    const command = createCommandWithOptions({});
    runtimeRunMock.mockImplementationOnce(async () => {
      if (!runtimeOptions) {
        throw new Error('runtime options missing');
      }
      const activeSpan = runtimeOptions.telemetry.tracer.startSpan(runtimeOptions.spanName!);
      await runtimeOptions.tokens.resolve({ span: activeSpan });
      await runtimeOptions.telemetry.exportSpans();
      await runtimeOptions.dispose?.();
      const reporter = createAuditReporterMock.mock.results[0]!.value as {
        auditSuccess: ReturnType<typeof vi.fn>;
      };
      const result = {
        ...auditResult,
        summary: {
          ...auditResult.summary,
          severity: { error: 2, warning: 0, info: 0 },
        },
      } satisfies typeof auditResult;
      reporter.auditSuccess(result);
      return result;
    });

    await executeAuditCommand({ command, io });

    expect(process.exitCode).toBe(1);
  });

  it('supports multiple reporter formats', async () => {
    const command = createCommandWithOptions({ reporter: ['markdown', 'json'], timings: true });

    await executeAuditCommand({ command, io });

    expect(createAuditReporterMock).toHaveBeenCalledWith(
      expect.objectContaining({ format: ['markdown', 'json'], includeTimings: true }),
    );
  });

  it('sets exit code when runtime fails', async () => {
    const error = new Error('runtime failure');
    runtimeRunMock.mockImplementationOnce(async () => {
      if (!runtimeOptions) {
        throw new Error('runtime options missing');
      }
      const activeSpan = runtimeOptions.telemetry.tracer.startSpan(runtimeOptions.spanName!);
      await runtimeOptions.tokens.resolve({ span: activeSpan });
      await runtimeOptions.telemetry.exportSpans();
      await runtimeOptions.dispose?.();
      const reporter = createAuditReporterMock.mock.results[0]!.value as {
        auditFailure: ReturnType<typeof vi.fn>;
      };
      reporter.auditFailure(error);
      throw error;
    });
    const command = createCommandWithOptions({});

    await executeAuditCommand({ command, io });

    expect(process.exitCode).toBe(1);
    const reporter = createAuditReporterMock.mock.results[0]!.value as {
      auditFailure: ReturnType<typeof vi.fn>;
    };
    expect(reporter.auditFailure).toHaveBeenCalledWith(error);
  });
});

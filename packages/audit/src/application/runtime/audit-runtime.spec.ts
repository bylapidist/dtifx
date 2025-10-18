import { describe, expect, it, vi } from 'vitest';

import type { PolicyConfigurationResult } from '../configuration/policies.js';
import type { PolicyRule } from '../../domain/policies/policy-engine.js';
import type { AuditReporter } from '../reporting/cli-reporters.js';
import { createAuditRuntime } from './audit-runtime.js';

interface MutablePolicyConfiguration {
  rules: PolicyConfigurationResult['rules'];
  engine: { run: ReturnType<typeof vi.fn> };
}

const createConfiguration = (): PolicyConfigurationResult & MutablePolicyConfiguration => {
  const rules: PolicyRule[] = [
    {
      policy: 'policy-1',
      setup: vi.fn(),
    },
  ];
  return {
    rules,
    engine: {
      run: vi.fn(async () => [{ name: 'policy-1', violations: [] }]),
    },
  } satisfies PolicyConfigurationResult & MutablePolicyConfiguration;
};

const telemetrySpan = () => ({
  startChild: vi.fn(() => ({ startChild: vi.fn(), end: vi.fn() })),
  end: vi.fn(),
});

describe('createAuditRuntime', () => {
  it('runs the audit workflow and reports success', async () => {
    const configuration = createConfiguration();
    const span = telemetrySpan();
    const exportSpans = vi.fn(async () => {});
    const telemetry = {
      tracer: { startSpan: vi.fn(() => span) },
      exportSpans,
    };
    const reporter: AuditReporter = {
      format: 'human',
      auditSuccess: vi.fn(),
      auditFailure: vi.fn(),
    };
    const now = vi.fn();
    now.mockReturnValueOnce(100).mockReturnValueOnce(175);
    const tokens = {
      resolve: vi.fn(async () => ({
        snapshots: [],
        metrics: { totalCount: 0, typedCount: 0, unreferencedCount: 0 },
        timings: {
          planMs: 10,
          parseMs: 5,
          resolveMs: 15,
          transformMs: 20,
          formatMs: 3,
          dependencyMs: 2,
          totalMs: 55,
        },
      })),
    };

    const runtime = createAuditRuntime({
      configuration,
      reporter,
      telemetry,
      tokens,
      clock: { now },
      spanName: 'dtifx.cli.audit',
    });

    const result = await runtime.run();

    expect(telemetry.tracer.startSpan).toHaveBeenCalledWith(
      'dtifx.cli.audit',
      expect.objectContaining({
        attributes: expect.objectContaining({ reporter: 'human', policyCount: 1 }),
      }),
    );
    expect(tokens.resolve).toHaveBeenCalledWith({
      span: expect.objectContaining({ startChild: expect.any(Function) }),
    });
    expect(configuration.engine.run).toHaveBeenCalledWith([]);
    expect(reporter.auditSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: expect.objectContaining({ tokenCount: 0 }),
        timings: expect.objectContaining({ auditMs: 75, totalWithAuditMs: 130 }),
      }),
    );
    expect(reporter.auditFailure).not.toHaveBeenCalled();
    expect(span.end).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: expect.objectContaining({ errorCount: 0 }) }),
    );
    expect(exportSpans).toHaveBeenCalled();
    expect(result.summary.severity.error).toBe(0);
  });

  it('records composite reporter formats in telemetry attributes', async () => {
    const configuration = createConfiguration();
    const span = telemetrySpan();
    const telemetry = {
      tracer: { startSpan: vi.fn(() => span) },
      exportSpans: vi.fn(async () => {}),
    };
    const reporter: AuditReporter = {
      format: ['human', 'json'],
      auditSuccess: vi.fn(),
      auditFailure: vi.fn(),
    };
    const tokens = {
      resolve: vi.fn(async () => ({
        snapshots: [],
        metrics: { totalCount: 0, typedCount: 0, unreferencedCount: 0 },
        timings: {
          planMs: 0,
          parseMs: 0,
          resolveMs: 0,
          transformMs: 0,
          formatMs: 0,
          dependencyMs: 0,
          totalMs: 0,
        },
      })),
    };

    const runtime = createAuditRuntime({
      configuration,
      reporter,
      telemetry,
      tokens,
    });

    await runtime.run().catch(() => {});

    expect(telemetry.tracer.startSpan).toHaveBeenCalledWith(
      'dtifx.audit.run',
      expect.objectContaining({
        attributes: expect.objectContaining({ reporter: 'human,json' }),
      }),
    );
  });

  it('reports failure when the workflow throws', async () => {
    const configuration = createConfiguration();
    const span = telemetrySpan();
    const telemetry = {
      tracer: { startSpan: vi.fn(() => span) },
      exportSpans: vi.fn(async () => {}),
    };
    const reporter: AuditReporter = {
      format: 'json',
      auditSuccess: vi.fn(),
      auditFailure: vi.fn(),
    };
    const error = new Error('resolution failed');
    const tokens = {
      resolve: vi.fn(async () => {
        throw error;
      }),
    };

    const runtime = createAuditRuntime({
      configuration,
      reporter,
      telemetry,
      tokens,
    });

    await expect(runtime.run()).rejects.toThrow(error);
    expect(reporter.auditFailure).toHaveBeenCalledWith(error);
    expect(span.end).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });
});

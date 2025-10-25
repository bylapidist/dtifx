import { createRunContext } from '@dtifx/core';
import { describe, expect, it, vi } from 'vitest';

import { createPolicySnapshot } from '../../testing/policy-test-harness.js';
import { createAuditReporter, type AuditRunResult, type AuditReporter } from './cli-reporters.js';

class MemoryTarget {
  readonly writes: string[] = [];

  write(value: string): void {
    this.writes.push(value);
  }
}

const baseTimings = {
  planMs: 300,
  parseMs: 300,
  resolveMs: 300,
  transformMs: 150,
  formatMs: 100,
  dependencyMs: 50,
  totalMs: 1200,
  auditMs: 200,
  totalWithAuditMs: 1400,
} as const;

function createAuditResult(): AuditRunResult {
  const runContext = createRunContext({
    previous: 'v1.2.2',
    next: 'v1.2.3',
    startedAt: new Date('2024-01-01T00:00:00.000Z'),
    durationMs: 1200,
  });
  return {
    policies: [
      {
        name: 'example.policy',
        violations: [],
      },
    ],
    summary: {
      policyCount: 1,
      violationCount: 0,
      severity: { error: 0, warning: 0, info: 0 },
      tokenCount: 0,
    },
    timings: { ...baseTimings },
    metadata: { runContext },
  } satisfies AuditRunResult;
}

describe('createAuditReporter', () => {
  it('serialises run context in JSON audit success payloads', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    const reporter = createAuditReporter({
      format: 'json',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const result = createAuditResult();
    reporter.auditSuccess(result);

    expect(stdout.writes).toHaveLength(1);
    const payload = JSON.parse(stdout.writes[0]!.trim()) as {
      readonly runContext?: NonNullable<AuditRunResult['metadata']>['runContext'];
    };
    expect(payload.runContext).toEqual(result.metadata?.runContext);
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        event: 'audit.completed',
        name: 'dtifx-audit',
      }),
    );
  });

  it('throws when no reporter formats are provided', () => {
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    expect(() =>
      createAuditReporter({
        format: [] as unknown as AuditReporter['format'],
        logger,
      }),
    ).toThrowError('At least one audit reporter format must be provided.');
  });

  it('writes audit failures to stderr with structured logging', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    const reporter = createAuditReporter({
      format: 'human',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const error = new Error('Policy plugin failure');
    reporter.auditFailure(error);

    expect(stderr.writes.join('')).toContain('Policy plugin failure');
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        event: 'audit.failed',
        name: 'dtifx-audit',
      }),
    );
    expect(stdout.writes).toHaveLength(0);
  });

  it('omits timing fields in markdown output when includeTimings is false', () => {
    const stdout = new MemoryTarget();
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    const reporter = createAuditReporter({
      format: 'markdown',
      logger,
      stdout,
      stderr: new MemoryTarget(),
      includeTimings: false,
      cwd: '/workspace',
    });

    reporter.auditSuccess(createAuditResult());

    const output = stdout.writes.join('');
    expect(output).not.toContain('Build duration');
    expect(output).not.toContain('Audit duration');
    expect(output).not.toContain('Total duration');
  });

  it('includes timing fields in markdown output when includeTimings is true', () => {
    const stdout = new MemoryTarget();
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    const reporter = createAuditReporter({
      format: 'markdown',
      logger,
      stdout,
      stderr: new MemoryTarget(),
      includeTimings: true,
      cwd: '/workspace',
    });

    reporter.auditSuccess(createAuditResult());

    const output = stdout.writes.join('');
    expect(output).toContain('Build duration');
    expect(output).toContain('Audit duration');
    expect(output).toContain('Total duration');
  });

  it('omits timing fields in HTML output when includeTimings is false', () => {
    const stdout = new MemoryTarget();
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    const reporter = createAuditReporter({
      format: 'html',
      logger,
      stdout,
      stderr: new MemoryTarget(),
      includeTimings: false,
      cwd: '/workspace',
    });

    reporter.auditSuccess(createAuditResult());

    const output = stdout.writes.join('');
    expect(output).not.toContain('Build duration');
    expect(output).not.toContain('Audit duration');
    expect(output).not.toContain('Total duration');
  });

  it('includes timing fields in HTML output when includeTimings is true', () => {
    const stdout = new MemoryTarget();
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    const reporter = createAuditReporter({
      format: 'html',
      logger,
      stdout,
      stderr: new MemoryTarget(),
      includeTimings: true,
      cwd: '/workspace',
    });

    reporter.auditSuccess(createAuditResult());

    const output = stdout.writes.join('');
    expect(output).toContain('Build duration');
    expect(output).toContain('Audit duration');
    expect(output).toContain('Total duration');
  });

  it('runs multiple reporters when more than one format is requested', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    const reporter = createAuditReporter({
      format: ['human', 'json', 'human'],
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const result = createAuditResult();
    reporter.auditSuccess(result);

    expect(reporter.format).toEqual(['human', 'json']);
    expect(stdout.writes.some((line) => line.includes('Audit passed'))).toBe(true);
    const jsonPayload = JSON.parse(stdout.writes.at(-1) ?? '{}') as {
      readonly summary?: AuditRunResult['summary'];
      readonly event?: string;
    };
    expect(jsonPayload.event).toBe('audit.completed');
    expect(jsonPayload.summary).toEqual(result.summary);
    expect(logger.log).toHaveBeenCalledTimes(2);

    reporter.auditFailure(new Error('composite failure'));
    expect(stderr.writes.join('')).toContain('composite failure');
    expect(logger.log).toHaveBeenCalledTimes(4);
  });

  it('renders violation context across all formats with severity-aware logging', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    const reporter = createAuditReporter({
      format: ['markdown', 'html', 'human', 'markdown'],
      logger,
      stdout,
      stderr,
      includeTimings: true,
      cwd: '/workspace/project',
    });

    const warningSnapshot = createPolicySnapshot({
      pointer: '#/tokens/primary',
      sourcePointer: '#/tokens/primary/$value',
      token: {
        id: 'tokens/primary',
        type: 'color',
        value: { colorSpace: 'srgb', components: [0.1, 0.2, 0.3] },
        raw: { colorSpace: 'srgb', components: [0.1, 0.2, 0.3] },
      },
      provenance: {
        sourceId: 'tokens',
        layer: 'brand',
        layerIndex: 1,
        uri: 'https://example.com/design/tokens.json',
        pointerPrefix: '#/tokens',
      },
      context: {
        component: 'button',
        tags: ['primary', 'cta'],
        file: { absolute: '/workspace/project/design/tokens.json' },
        metadata: { deprecated: false },
        count: 2,
      },
    });
    const errorSnapshot = createPolicySnapshot({
      pointer: '#/tokens/secondary',
      sourcePointer: '#/tokens/secondary/$value',
      token: {
        id: 'tokens/secondary',
        type: undefined,
        value: { colorSpace: 'srgb', components: [0.4, 0.4, 0.4] },
        raw: { colorSpace: 'srgb', components: [0.4, 0.4, 0.4] },
      },
      provenance: {
        sourceId: 'tokens',
        layer: 'brand',
        layerIndex: 1,
        uri: './relative.json',
        pointerPrefix: '#/tokens',
      },
      context: {
        file: { absolute: '/workspace/project/design/secondary.json' },
      },
    });

    const result: AuditRunResult = {
      policies: [
        {
          name: 'policy.warning',
          violations: [
            {
              policy: 'policy.warning',
              pointer: warningSnapshot.pointer,
              snapshot: warningSnapshot,
              severity: 'warning',
              message: 'Primary token requires review',
              details: { reason: 'contrast', threshold: 4.5 },
            },
          ],
        },
        {
          name: 'policy.error',
          violations: [
            {
              policy: 'policy.error',
              pointer: errorSnapshot.pointer,
              snapshot: errorSnapshot,
              severity: 'error',
              message: 'Secondary token failed validation',
              details: { reason: 'missing-owner' },
            },
          ],
        },
      ],
      summary: {
        policyCount: 2,
        violationCount: 2,
        severity: { error: 1, warning: 1, info: 0 },
        tokenCount: 2,
      },
      timings: { ...baseTimings },
      metadata: {
        runContext: createRunContext({
          previous: 'v1.0.0',
          next: 'v1.1.0',
          startedAt: '2024-02-02T10:00:00.000Z',
          durationMs: 2500,
        }),
      },
    } satisfies AuditRunResult;

    reporter.auditSuccess(result);

    const output = stdout.writes.join('');
    expect(output).toContain('Audit completed with 2 violation(s)');
    expect(output).toContain('Compared sources: v1.0.0 → v1.1.0');
    expect(output.replaceAll('\\', '')).toContain('policy.warning (1 violation)');
    expect(output).toContain('Context: `component`: `button`, `tags`: `primary,cta`');
    expect(output).toContain('<div class="violation violation-error">');
    expect(output).toContain('./relative.json#/tokens/secondary');
    expect(output).toContain('<code>design/tokens.json</code>');
    expect(output).toContain(
      'Context</dt><dd><code>file</code>: <code>design/secondary.json</code></dd>',
    );

    const logLevels = logger.log.mock.calls.map(([entry]) => entry.level);
    expect(logLevels).toEqual(['error', 'error', 'error']);
  });

  it('serialises error payloads for JSON failures', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    const reporter = createAuditReporter({
      format: 'json',
      logger,
      stdout,
      stderr,
      cwd: '/workspace',
    });

    const failure = new Error('Policy failure') as Error & { cause?: unknown };
    failure.cause = { policy: 'policy.alpha' };

    reporter.auditFailure(failure);

    const payload = JSON.parse(stderr.writes[0]!.trim()) as {
      readonly error: { readonly message?: string; readonly name?: string };
    };
    expect(payload.error).toMatchObject({ name: 'Error', message: 'Policy failure' });
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', event: 'audit.failed' }),
    );
  });

  it('logs warnings when violations exist without errors', () => {
    const stdout = new MemoryTarget();
    const logger = { log: vi.fn() } satisfies Parameters<typeof createAuditReporter>[0]['logger'];

    const reporter = createAuditReporter({
      format: 'human',
      logger,
      stdout,
      cwd: '/workspace',
    });

    const snapshot = createPolicySnapshot();
    const result: AuditRunResult = {
      policies: [
        {
          name: 'policy.warning',
          violations: [
            {
              policy: 'policy.warning',
              pointer: snapshot.pointer,
              snapshot,
              severity: 'warning',
              message: 'Review required',
            },
          ],
        },
      ],
      summary: {
        policyCount: 1,
        violationCount: 1,
        severity: { error: 0, warning: 1, info: 0 },
        tokenCount: 1,
      },
      timings: { ...baseTimings },
    } satisfies AuditRunResult;

    reporter.auditSuccess(result);

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', event: 'audit.completed' }),
    );
  });
});

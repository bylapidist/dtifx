import { createRunContext } from '@dtifx/core';
import { describe, expect, it, vi } from 'vitest';

import { createAuditReporter, type AuditRunResult } from './cli-reporters.js';

class MemoryTarget {
  readonly writes: string[] = [];

  write(value: string): void {
    this.writes.push(value);
  }
}

function createAuditResult(): AuditRunResult {
  const runContext = createRunContext({
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
    timings: {
      planMs: 300,
      parseMs: 300,
      resolveMs: 300,
      transformMs: 150,
      formatMs: 100,
      dependencyMs: 50,
      totalMs: 1200,
      auditMs: 200,
      totalWithAuditMs: 1400,
    },
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
        event: 'audit.completed',
        name: 'dtifx-audit',
      }),
    );
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
      format: ['human', 'json'],
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
});

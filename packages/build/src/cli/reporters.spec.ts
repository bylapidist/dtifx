import { JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { createRunContext, type DiagnosticEvent } from '@dtifx/core';
import { describe, expect, it, vi } from 'vitest';

import { SourcePlannerError } from '../application/planner/source-planner.js';
import type { BuildRunResult } from '../application/build-runtime.js';
import type { StructuredLogger } from '@dtifx/core/logging';
import { collectTokenMetrics, type TokenMetricsSnapshot } from '@dtifx/core/sources';

import { createReporter } from './reporters.js';

class MemoryTarget {
  readonly writes: string[] = [];

  write(value: string): void {
    this.writes.push(value);
  }
}

function createDiagnostics(): DiagnosticEvent[] {
  return [
    {
      level: 'error',
      message: 'Parser failure',
      category: 'token-source',
      scope: 'token-source:alpha',
      code: 'type',
      pointer: '/tokens/alpha',
      related: [
        {
          message: 'Source alpha',
          pointer: '/tokens/alpha',
        },
      ],
    },
  ];
}

function createPlannerError(): SourcePlannerError {
  return new SourcePlannerError(
    'Validation failed',
    [
      {
        sourceId: 'alpha',
        uri: 'file:///alpha.json',
        pointerPrefix: JSON_POINTER_ROOT,
        errors: [
          {
            keyword: 'type',
            instancePath: '',
            schemaPath: '#/type',
            message: 'Expected type "string"',
            params: {},
          },
        ],
      },
    ],
    createDiagnostics(),
  );
}

function createBuildResult(): BuildRunResult {
  const startedAt = new Date('2024-01-01T00:00:00.000Z');
  const runContext = createRunContext({ startedAt, durationMs: 1200 });
  return {
    plan: { entries: [], createdAt: startedAt },
    resolved: { entries: [], diagnostics: [], resolvedAt: new Date('2024-01-01T00:00:01.000Z') },
    tokens: [],
    transforms: [],
    formatters: [],
    timings: {
      planMs: 300,
      parseMs: 300,
      resolveMs: 300,
      transformMs: 150,
      formatMs: 100,
      dependencyMs: 50,
      totalMs: 1200,
    },
    metrics: collectTokenMetrics([]),
    transformCache: { hits: 0, misses: 0, skipped: 0 },
    dependencyChanges: undefined,
    writtenArtifacts: new Map(),
    runContext,
  } satisfies BuildRunResult;
}

describe('createReporter', () => {
  it('emits diagnostics in JSON validate failure payloads', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'json',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const error = createPlannerError();
    reporter.validateFailure(error);

    expect(stderr.writes).toHaveLength(1);
    const payload = JSON.parse(stderr.writes[0]!.trim()) as {
      readonly diagnostics: DiagnosticEvent[];
    };
    expect(payload.diagnostics).toEqual(createDiagnostics());
  });

  it('prints diagnostics for human reporter validation failures', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'human',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const error = createPlannerError();
    reporter.validateFailure(error);

    const output = stderr.writes.join('');
    expect(output).toContain('Diagnostics:');
    expect(output).toContain('[ERROR] [token-source] token-source:alpha: type Parser failure');
    expect(output).toContain('Source alpha');
  });

  it('renders diagnostics in HTML reporter output', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'html',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const error = createPlannerError();
    reporter.validateFailure(error);

    const html = stderr.writes.join('');
    expect(html).toContain('<div class="diagnostics">');
    expect(html).toContain('[ERROR] [token-source] token-source:alpha: type Parser failure');
    expect(html).toContain('Source alpha');
  });

  it('serialises run context in JSON build success payloads', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'json',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const result = createBuildResult();
    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'test' });

    expect(stdout.writes).toHaveLength(1);
    const payload = JSON.parse(stdout.writes[0]!.trim()) as {
      readonly runContext: BuildRunResult['runContext'];
    };
    expect(payload.runContext).toEqual(result.runContext);
  });

  it('prints run context details for human build success', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'human',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const result = createBuildResult();
    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'test' });

    const output = stdout.writes.join('');
    expect(output).toContain('Run started: 2024-01-01 00:00 UTC');
    expect(output).toContain('Run duration: 1.2s');
  });

  it('renders run context metadata in HTML build success output', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'html',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const result = createBuildResult();
    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'test' });

    const html = stdout.writes.join('');
    expect(html).toContain(
      '<span class="label">Run started</span><span class="value">2024-01-01 00:00 UTC</span>',
    );
    expect(html).toContain(
      '<span class="label">Run duration</span><span class="value">1.2s</span>',
    );
  });

  it('logs run context metadata for structured build events', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'json',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const result = createBuildResult();
    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'test' });

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'build.completed',
        data: expect.objectContaining({
          runContext: result.runContext,
        }),
      }),
    );
  });
});

import path from 'node:path';
import { JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { createRunContext, type DiagnosticEvent } from '@dtifx/core';
import * as core from '@dtifx/core';
import { describe, expect, it, vi } from 'vitest';

import { SourcePlannerError } from '../application/planner/source-planner.js';
import type { BuildRunResult, DependencyChangeSummary } from '../application/build-runtime.js';
import type { SourcePlan } from '../config/index.js';
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

function createPlannerError(
  diagnostics: DiagnosticEvent[] = createDiagnostics(),
): SourcePlannerError {
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
    diagnostics,
  );
}

function createDiagnosticWithoutRelated(): DiagnosticEvent {
  return {
    level: 'error',
    message: 'Unrelated failure',
    category: 'token-source',
    scope: 'token-source:beta',
    code: 'missing',
    pointer: '/tokens/beta',
  } satisfies DiagnosticEvent;
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
  it('delegates planner failures in JSON build failure handling', () => {
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
    const failureSpy = vi.spyOn(reporter, 'validateFailure');

    reporter.buildFailure(error);

    expect(failureSpy).toHaveBeenCalledWith(error);
    expect(stderr.writes).toHaveLength(1);
    const payload = JSON.parse(stderr.writes[0]!.trim()) as { readonly event: string };
    expect(payload.event).toBe('validate.failed');
    expect(logger.log).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'build.failed' }));
  });

  it('serialises unexpected errors in JSON build failure output', () => {
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

    const error = new Error('Formatter exploded');
    reporter.buildFailure(error);

    expect(stderr.writes).toHaveLength(1);
    const payload = JSON.parse(stderr.writes[0]!.trim()) as {
      readonly event: string;
      readonly error: { readonly name: string; readonly message: string };
    };
    expect(payload.event).toBe('build.failed');
    expect(payload.error).toMatchObject({ name: 'Error', message: 'Formatter exploded' });
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'build.failed',
        data: expect.objectContaining({
          error: expect.objectContaining({ name: 'Error', message: 'Formatter exploded' }),
        }),
      }),
    );
  });

  it('delegates planner failures in human build failure handling', () => {
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
    const failureSpy = vi.spyOn(reporter, 'validateFailure');

    reporter.buildFailure(error);

    expect(failureSpy).toHaveBeenCalledWith(error);
    expect(stderr.writes.join('')).toContain('One or more DTIF sources failed validation');
    expect(logger.log).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'build.failed' }));
  });

  it('formats unexpected errors in human build failure output', () => {
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

    reporter.buildFailure(new Error('Formatter exploded'));

    const output = stderr.writes.join('');
    expect(output).toContain('Build failed:');
    expect(output).toContain('Formatter exploded');
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'build.failed',
        data: expect.objectContaining({ message: expect.stringContaining('Formatter exploded') }),
      }),
    );
  });

  it('caches plan summaries between validation and build success reporting', () => {
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

    const planCreatedAt = new Date('2024-01-01T00:00:00Z');
    const planEntries: never[] = [];
    let entryAccessCount = 0;
    const plan = { createdAt: planCreatedAt } as unknown as SourcePlan;
    Object.defineProperty(plan, 'entries', {
      configurable: true,
      enumerable: true,
      get() {
        entryAccessCount += 1;
        return planEntries;
      },
    });

    reporter.validateSuccess(plan);

    const base = createBuildResult();
    const result: BuildRunResult = { ...base, plan };
    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'cached' });

    expect(entryAccessCount).toBe(1);
  });

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

  it('omits diagnostics section for human validation failures without diagnostics', () => {
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

    const error = createPlannerError([]);
    reporter.validateFailure(error);

    const output = stderr.writes.join('');
    expect(output).not.toContain('Diagnostics:');
    expect(output).toContain('One or more DTIF sources failed validation');
  });

  it('reports dependency summaries for human build success output when no changes detected', () => {
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
    expect(output).toContain('Dependency changes — changed: 0, removed: 0');
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

  it('reports validation success for HTML reporters', () => {
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

    const plan = {
      entries: [{ id: 'source' }],
      createdAt: new Date('2024-01-01T00:00:00Z'),
    } as unknown as SourcePlan;

    reporter.validateSuccess(plan);

    const html = stdout.writes.join('');
    expect(html).toContain(
      '<p class="validate-success">Planned <strong>1</strong> DTIF sources successfully.</p>',
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'validate.completed',
        data: expect.objectContaining({ entryCount: 1 }),
      }),
    );
  });

  it('delegates planner failures in HTML build failure handling', () => {
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
    const failureSpy = vi.spyOn(reporter, 'validateFailure');

    reporter.buildFailure(error);

    expect(failureSpy).toHaveBeenCalledWith(error);
    expect(stderr.writes.join('')).toContain('<div class="validate-failure">');
  });

  it('formats unexpected errors in HTML build failure output', () => {
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

    reporter.buildFailure(new Error('Formatter exploded'));

    const html = stderr.writes.join('');
    expect(html).toContain('<p class="build-failure">Build failed: Error: Formatter exploded</p>');
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'build.failed',
        data: expect.objectContaining({ message: 'Error: Formatter exploded' }),
      }),
    );
  });

  it('skips HTML diagnostics section when planner reports no diagnostics', () => {
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

    const error = createPlannerError([]);
    reporter.validateFailure(error);

    const html = stderr.writes.join('');
    expect(html).not.toContain('<div class="diagnostics">');
  });

  it('renders HTML diagnostics without related information when absent', () => {
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

    const diagnostics: DiagnosticEvent[] = [createDiagnosticWithoutRelated()];
    const error = createPlannerError(diagnostics);
    reporter.validateFailure(error);

    const html = stderr.writes.join('');
    expect(html).toContain('<div class="diagnostics">');
    expect(html).not.toMatch(/Unrelated failure.*<ul>/);
  });

  it('renders dependency summaries in HTML build success output without changes', () => {
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
    expect(html).toContain('Dependency changes (changed / removed)');
    expect(html).toContain('0 / 0');
  });

  it('renders written artifact listings in HTML build success output', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'html',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace/project',
    });

    const base = createBuildResult();
    const formatters = [
      {
        id: 'bundle',
        name: 'Bundle formatter',
        artifacts: [],
        output: { directory: 'dist' },
      },
    ] satisfies BuildRunResult['formatters'];
    const writtenArtifacts = new Map<string, readonly string[]>([
      ['bundle', [path.join('/workspace/project', 'dist', 'bundle.json')]],
    ]);
    const result: BuildRunResult = { ...base, formatters };

    reporter.buildSuccess({ result, writtenArtifacts, reason: 'html-artifacts' });

    const html = stdout.writes.join('');
    expect(html).toContain('<ul>');
    expect(html).toContain('<code>dist/bundle.json</code>');
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

  it('serialises structured errors for JSON watch failures', () => {
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

    const error = new Error('File watcher disconnected');
    reporter.watchError('Watcher error', error);

    expect(stderr.writes).toHaveLength(1);
    const payload = JSON.parse(stderr.writes[0]!.trim()) as {
      readonly event: string;
      readonly message: string;
      readonly error: { readonly name: string; readonly message: string };
    };
    expect(payload.event).toBe('watch.error');
    expect(payload.message).toBe('Watcher error');
    expect(payload.error).toMatchObject({ name: 'Error', message: 'File watcher disconnected' });
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
    expect(output).toContain('Transform cache — hits: 0, misses: 0, skipped: 0');
  });

  it('includes comparison metadata when previous run details are provided for human output', () => {
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

    const base = createBuildResult();
    const runContext = createRunContext({ previous: 'v1', next: 'v2' });
    const result: BuildRunResult = { ...base, runContext };

    reporter.buildSuccess({
      result,
      writtenArtifacts: result.writtenArtifacts,
      reason: 'comparison',
    });

    const output = stdout.writes.join('');
    expect(output).toContain('Compared sources: v1 → v2');
  });

  it('omits run context details for human build success when unavailable', () => {
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

    const base = createBuildResult();
    const runContext = createRunContext({});
    const comparisonSpy = vi
      .spyOn(core, 'describeRunComparison')
      .mockReturnValue(undefined as unknown as string);
    const timestampSpy = vi
      .spyOn(core, 'formatRunTimestamp')
      .mockReturnValue(undefined as unknown as string);
    const durationSpy = vi
      .spyOn(core, 'formatRunDuration')
      .mockReturnValue(undefined as unknown as string);
    const result: BuildRunResult = { ...base, runContext };
    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'test' });

    const output = stdout.writes.join('');
    expect(output).not.toContain('Run started:');
    expect(output).not.toContain('Run duration:');
    comparisonSpy.mockRestore();
    timestampSpy.mockRestore();
    durationSpy.mockRestore();
  });

  it('formats watch failures for human reporters', () => {
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

    reporter.watchError('Watcher error', new Error('Disk not mounted'));

    const output = stderr.writes.join('');
    expect(output.trim()).toBe('Watcher error: Error: Disk not mounted');
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

    const base = createBuildResult();
    const runContext = createRunContext({
      previous: 'v1',
      next: 'v2',
      startedAt: '2024-01-01T00:00:00.000Z',
      durationMs: 1200,
    });
    const result: BuildRunResult = { ...base, runContext };
    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'test' });

    const html = stdout.writes.join('');
    expect(html).toContain('<span class="label">Compared</span><span class="value">v1 → v2</span>');
    expect(html).toContain(
      '<span class="label">Run started</span><span class="value">2024-01-01 00:00 UTC</span>',
    );
    expect(html).toContain(
      '<span class="label">Run duration</span><span class="value">1.2s</span>',
    );
  });

  it('omits run context metadata from HTML output when not available', () => {
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

    const base = createBuildResult();
    const runContext = createRunContext({});
    const comparisonSpy = vi
      .spyOn(core, 'describeRunComparison')
      .mockReturnValue(undefined as unknown as string);
    const timestampSpy = vi
      .spyOn(core, 'formatRunTimestamp')
      .mockReturnValue(undefined as unknown as string);
    const durationSpy = vi
      .spyOn(core, 'formatRunDuration')
      .mockReturnValue(undefined as unknown as string);
    const result: BuildRunResult = { ...base, runContext };
    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'test' });

    const html = stdout.writes.join('');
    expect(html).not.toContain('<span class="label">Compared</span>');
    expect(html).not.toContain('<span class="label">Run started</span>');
    expect(html).not.toContain('<span class="label">Run duration</span>');
    comparisonSpy.mockRestore();
    timestampSpy.mockRestore();
    durationSpy.mockRestore();
  });

  it('omits HTML run context metadata when context is undefined', () => {
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

    const base = createBuildResult();
    const result: BuildRunResult = { ...base, runContext: undefined };
    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'test' });

    const html = stdout.writes.join('');
    expect(html).not.toContain('Run started');
    expect(html).not.toContain('Run duration');
    expect(html).not.toContain('Compared');
  });

  it('omits HTML metrics list when all metric items are filtered out', () => {
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

    const originalFilter = Array.prototype.filter;
    Array.prototype.filter = function filterOverride(
      this: unknown[],
      predicate: Parameters<typeof originalFilter>[0],
      thisArg?: Parameters<typeof originalFilter>[1],
    ) {
      const result = originalFilter.call(
        this,
        predicate as (value: unknown, index: number, array: unknown[]) => unknown,
        thisArg,
      );
      if (
        Array.isArray(this) &&
        this.every(
          (item) =>
            item === undefined ||
            (typeof item === 'object' && item !== null && 'label' in item && 'value' in item),
        )
      ) {
        result.length = 0;
      }
      return result;
    };

    try {
      const base = createBuildResult();
      reporter.buildSuccess({
        result: {
          ...base,
          formatters: [],
          metrics: base.metrics,
          transformCache: { hits: 0, misses: 0, skipped: 0 },
          dependencyChanges: undefined,
        },
        writtenArtifacts: new Map(),
        reason: 'manual run',
      });
    } finally {
      Array.prototype.filter = originalFilter;
    }

    const html = stdout.writes.join('');
    expect(html).not.toContain('<ul class="metrics">');
  });

  it('escapes watch failure messages for HTML reporters', () => {
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

    reporter.watchError('Watcher <error>', new Error('Disk <not> mounted'));

    const html = stderr.writes.join('');
    expect(html).toContain(
      '<p class="watch-error">Watcher &lt;error&gt;: Error: Disk &lt;not&gt; mounted</p>',
    );
  });

  it('renders watch info messages for HTML reporters', () => {
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

    reporter.watchInfo('Watcher ready');

    const html = stdout.writes.join('');
    expect(html).toContain('<p class="watch-info">Watcher ready</p>');
  });

  it('renders timings and type breakdown entries in HTML metrics when enabled', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'html',
      logger,
      stdout,
      stderr,
      includeTimings: true,
      cwd: '/workspace/project',
    });

    const base = createBuildResult();
    const metrics: BuildRunResult['metrics'] = {
      ...base.metrics,
      totalCount: 2,
      typedCount: 2,
      typeCounts: { alpha: 1, beta: 1 },
    };
    const result: BuildRunResult = { ...base, metrics };

    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'ci' });

    const html = stdout.writes.join('');
    expect(html).toContain('<span class="label">Timings</span>');
    expect(html).toContain(
      '<span class="label">Type breakdown</span><span class="value">alpha 1, beta 1</span>',
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

  it('includes dependency changes and written artifact metadata in JSON payloads', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'json',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace/project',
    });

    const base = createBuildResult();
    const formatters = [
      {
        id: 'bundle',
        name: 'Bundle formatter',
        artifacts: [
          {
            path: path.join('/workspace/project', 'dist', 'bundle.json'),
            contents: '{}',
            encoding: 'utf8',
            checksum: 'sha-1',
            metadata: { format: 'json' },
          },
        ],
        output: { directory: 'dist' },
      },
    ] satisfies BuildRunResult['formatters'];
    const dependencyChanges: DependencyChangeSummary = {
      changedPointers: ['/tokens/a'],
      removedPointers: ['/tokens/b'],
    };
    const writtenArtifacts = new Map<string, readonly string[]>([
      ['bundle', [path.join('/workspace/project', 'dist', 'bundle.json')]],
    ]);

    const result: BuildRunResult = {
      ...base,
      formatters,
      dependencyChanges,
      writtenArtifacts,
    };

    reporter.buildSuccess({ result, writtenArtifacts, reason: 'ci' });

    expect(stdout.writes).toHaveLength(1);
    const payload = JSON.parse(stdout.writes[0]!.trim()) as {
      readonly dependencyChanges: {
        readonly changedCount: number;
        readonly removedCount: number;
        readonly changedPointers: readonly string[];
        readonly removedPointers: readonly string[];
      };
      readonly formatters: readonly {
        readonly artifacts: readonly {
          readonly written?: { readonly absolute: string; readonly relative: string };
        }[];
      }[];
    };
    expect(payload.dependencyChanges).toEqual({
      changedCount: 1,
      removedCount: 1,
      changedPointers: ['/tokens/a'],
      removedPointers: ['/tokens/b'],
    });
    expect(payload.formatters[0]?.artifacts[0]?.written).toEqual({
      absolute: path.join('/workspace/project', 'dist', 'bundle.json'),
      relative: path.join('dist', 'bundle.json'),
    });
  });

  it('renders markdown build success with timings and relative artifact paths', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'markdown',
      logger,
      stdout,
      stderr,
      includeTimings: true,
      cwd: '/workspace/project',
    });

    const base = createBuildResult();
    const formatters = [
      {
        id: 'bundle',
        name: 'Bundle formatter',
        artifacts: [],
        output: { directory: 'dist' },
      },
    ] satisfies BuildRunResult['formatters'];
    const dependencyChanges: DependencyChangeSummary = {
      changedPointers: ['/tokens/a'],
      removedPointers: ['/tokens/b'],
    };
    const metrics: BuildRunResult['metrics'] = {
      totalCount: 3,
      typedCount: 3,
      untypedCount: 0,
      typeCounts: { color: 2, dimension: 1 },
      aliasDepth: { average: Number.POSITIVE_INFINITY, max: 2, histogram: { 0: 2, 1: 1 } },
      references: {
        referencedCount: 2,
        unreferencedCount: 1,
        unreferencedSamples: ['/tokens/a'],
      },
    } satisfies BuildRunResult['metrics'];
    const writtenArtifacts = new Map<string, readonly string[]>([
      ['bundle', [path.join('/workspace/project', 'dist', 'bundle.json')]],
    ]);

    const result: BuildRunResult = {
      ...base,
      formatters,
      metrics,
      dependencyChanges,
      writtenArtifacts,
      runContext: createRunContext({
        previous: 'v1',
        next: 'v2',
        startedAt: '2024-01-01T00:00:00.000Z',
        durationMs: 1200,
      }),
    };

    reporter.buildSuccess({ result, writtenArtifacts, reason: 'ci' });

    const output = stdout.writes.join('');
    expect(output).toContain('Timings — plan: 300.0ms, parse: 300.0ms, resolve: 300.0ms');
    expect(output).toContain('- **Compared:** v1 → v2');
    expect(output).toContain(
      'Token metrics — typed: 3/3, alias depth avg: 0.00 (max 2), unreferenced: 1, types: color 2, dimension 1',
    );
    expect(output).toContain('Dependency changes — changed: 1, removed: 1');
    expect(output).toContain('  - dist/bundle.json');
    expect(output).toContain('- **Run started:** 2024-01-01 00:00 UTC');
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'build.completed',
        data: expect.objectContaining({
          dependencyChanges: {
            changedCount: 1,
            removedCount: 1,
            changedPointers: ['/tokens/a'],
            removedPointers: ['/tokens/b'],
          },
        }),
      }),
    );
  });

  it('sorts type breakdown alphabetically when counts match', () => {
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

    const base = createBuildResult();
    const metrics: BuildRunResult['metrics'] = {
      ...base.metrics,
      totalCount: 2,
      typedCount: 2,
      typeCounts: { beta: 1, alpha: 1 },
    };
    const result: BuildRunResult = { ...base, metrics };

    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'test' });

    const output = stdout.writes.join('');
    expect(output).toContain('types: alpha 1, beta 1');
  });

  it('omits run context details in markdown output when unavailable', () => {
    const stdout = new MemoryTarget();
    const stderr = new MemoryTarget();
    const logger: StructuredLogger = { log: vi.fn() };
    const reporter = createReporter({
      format: 'markdown',
      logger,
      stdout,
      stderr,
      includeTimings: false,
      cwd: '/workspace',
    });

    const base = createBuildResult();
    const runContext = createRunContext({});
    const comparisonSpy = vi
      .spyOn(core, 'describeRunComparison')
      .mockReturnValue(undefined as unknown as string);
    const timestampSpy = vi
      .spyOn(core, 'formatRunTimestamp')
      .mockReturnValue(undefined as unknown as string);
    const durationSpy = vi
      .spyOn(core, 'formatRunDuration')
      .mockReturnValue(undefined as unknown as string);
    const result: BuildRunResult = { ...base, runContext };
    reporter.buildSuccess({ result, writtenArtifacts: result.writtenArtifacts, reason: 'test' });

    const output = stdout.writes.join('');
    expect(output).not.toContain('- **Run started:**');
    expect(output).not.toContain('- **Run duration:**');
    expect(output).not.toContain('- **Compared:**');
    comparisonSpy.mockRestore();
    timestampSpy.mockRestore();
    durationSpy.mockRestore();
  });
});

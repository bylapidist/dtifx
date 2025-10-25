import { describe, expect, it } from 'vitest';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import {
  createDiagnosticSink,
  createReportingDiagnosticsPort,
  selectDiagnosticDecorator,
} from './diagnostics.js';

type DiagnosticInput = Parameters<ReturnType<typeof createDiagnosticSink>>[0];
type ReportingEvent = Parameters<ReturnType<typeof createReportingDiagnosticsPort>['emit']>[0];

describe('diff diagnostics helpers', () => {
  const baseOptions = {
    format: 'cli',
    color: false,
    templatePartials: [],
    templateAllowUnescapedOutput: false,
    filterTypes: [],
    filterPaths: [],
    filterGroups: [],
    filterImpacts: [],
    filterKinds: [],
    mode: 'full',
    failOnBreaking: false,
    failOnChanges: false,
    verbose: false,
    why: false,
    diffContext: 0,
    topRisks: 0,
    links: false,
    quiet: false,
  } as const;

  it('suppresses parser diagnostics when quiet mode is enabled', () => {
    const io = createMemoryCliIo();
    const sink = createDiagnosticSink({ ...baseOptions, quiet: true }, io);

    sink({
      severity: 'warn',
      code: 'warn-code',
      message: 'This should not be logged',
    } as unknown as DiagnosticInput);

    expect(io.stderrBuffer).toBe('');
  });

  it('deduplicates and decorates parser diagnostics', () => {
    const io = createMemoryCliIo();
    const sink = createDiagnosticSink(baseOptions, io);

    const diagnostic = {
      severity: 'warn',
      code: 'parser-code',
      message: 'Token missing optional field',
      pointer: '/tokens/0/value',
      span: { start: { line: 5, column: 10 } },
    } as unknown as DiagnosticInput;

    sink(diagnostic);
    sink(diagnostic);
    sink({ ...diagnostic, severity: 'error' });

    expect(io.stderrBuffer).toContain('WARN parser-code - Token missing optional field');
    expect(io.stderrBuffer).toContain('(/tokens/0/value)');
    expect(io.stderrBuffer).toContain('(5:10)');
    expect(io.stderrBuffer.match(/Token missing optional field/g)?.length).toBe(1);
  });

  it('applies colorization when requested for parser diagnostics', () => {
    const io = createMemoryCliIo();
    const sink = createDiagnosticSink({ ...baseOptions, color: true }, io);

    sink({
      severity: 'warn',
      code: 'parser-code',
      message: 'Colored warning',
    } as unknown as DiagnosticInput);

    expect(io.stderrBuffer).toContain('\u001B[33m');
    expect(io.stderrBuffer).toContain('Colored warning');
  });

  it('suppresses reporting diagnostics in quiet mode', () => {
    const io = createMemoryCliIo();
    const port = createReportingDiagnosticsPort({ ...baseOptions, quiet: true }, io);

    port.emit({ level: 'warn', message: 'Hidden warning' } as unknown as ReportingEvent);

    expect(io.stderrBuffer).toBe('');
  });

  it('formats reporting diagnostics without color', () => {
    const io = createMemoryCliIo();
    const port = createReportingDiagnosticsPort(baseOptions, io);

    port.emit({
      level: 'info',
      message: 'Loaded formatter module',
      scope: 'formatter-loader',
      category: 'lifecycle',
      code: 'loader-info',
    } as unknown as ReportingEvent);

    expect(io.stderrBuffer).toContain(
      '[INFO] [lifecycle] formatter-loader: loader-info Loaded formatter module',
    );
  });

  it('applies ANSI colors to reporting diagnostics when enabled', () => {
    const io = createMemoryCliIo();
    const port = createReportingDiagnosticsPort({ ...baseOptions, color: true }, io);

    port.emit({ level: 'warn', message: 'Colored reporting message' } as unknown as ReportingEvent);

    expect(io.stderrBuffer).toContain('\u001B[33m');
    expect(io.stderrBuffer).toContain('Colored reporting message');
  });

  it('selects diagnostic decorators based on color preference', () => {
    const decorated = selectDiagnosticDecorator(true)('message', 'warn');
    const plain = selectDiagnosticDecorator(false)('message', 'warn');

    expect(decorated).toContain('\u001B[');
    expect(plain).toBe('message');
  });
});

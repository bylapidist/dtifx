import { describe, expect, it } from 'vitest';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import type { CompareCommandOptions } from './compare-options.js';
import { createReportingDiagnosticsPort } from './diagnostics.js';

type OptionOverrides = Partial<CompareCommandOptions>;

const createOptions = (overrides: OptionOverrides = {}): CompareCommandOptions => ({
  format: 'cli',
  color: false,
  unicode: undefined,
  templatePartials: [],
  templateAllowUnescapedOutput: false,
  filterTypes: [],
  filterPaths: [],
  filterGroups: [],
  filterImpacts: [],
  filterKinds: [],
  mode: 'condensed',
  failOnBreaking: false,
  failOnChanges: false,
  verbose: false,
  why: false,
  diffContext: 3,
  topRisks: 5,
  links: false,
  quiet: false,
  templatePath: undefined,
  outputPath: undefined,
  renameStrategy: undefined,
  impactStrategy: undefined,
  summaryStrategy: undefined,
  ...overrides,
});

describe('createReportingDiagnosticsPort', () => {
  it('writes formatted diagnostics to stderr', () => {
    const io = createMemoryCliIo();
    const port = createReportingDiagnosticsPort(createOptions(), io);

    port.emit({ level: 'warn', message: 'template missing partials', scope: 'renderer' });

    expect(io.stderrBuffer).toContain('[WARN] renderer: template missing partials');
  });

  it('includes diagnostic codes when provided', () => {
    const io = createMemoryCliIo();
    const port = createReportingDiagnosticsPort(createOptions(), io);

    port.emit({
      level: 'info',
      message: 'normalized width to 80 columns',
      code: 'CLI_WIDTH_NORMALIZED',
    });

    expect(io.stderrBuffer).toContain('[INFO] CLI_WIDTH_NORMALIZED normalized width to 80 columns');
  });

  it('includes diagnostic categories when provided', () => {
    const io = createMemoryCliIo();
    const port = createReportingDiagnosticsPort(createOptions(), io);

    port.emit({
      level: 'info',
      message: 'render started',
      code: 'REPORT_RENDER_START',
      scope: 'reporting.cli' as never,
      category: 'reportingRegistry' as never,
    });

    expect(io.stderrBuffer).toContain(
      '[INFO] [reportingRegistry] reporting.cli: REPORT_RENDER_START render started',
    );
  });

  it('suppresses diagnostics when quiet', () => {
    const io = createMemoryCliIo();
    const port = createReportingDiagnosticsPort(createOptions({ quiet: true }), io);

    port.emit({ level: 'info', message: 'this should not appear' });

    expect(io.stderrBuffer).toBe('');
  });

  it('applies ANSI colors when enabled', () => {
    const io = createMemoryCliIo();
    const port = createReportingDiagnosticsPort(createOptions({ color: true }), io);

    port.emit({ level: 'error', message: 'render failed' });

    expect(io.stderrBuffer).toMatch(/\u001B\[31m\[ERROR\] render failed\u001B\[0m/);
  });
});

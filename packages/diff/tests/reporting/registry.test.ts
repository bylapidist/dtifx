import { describe, expect, test } from 'vitest';

import {
  createReportRendererRegistry,
  emitRendererDiagnostic,
  renderReport,
  type DiagnosticEvent,
  type DiagnosticsPort,
  type RenderReportOptions,
  type ReportRenderFormat,
  DiagnosticCategories,
  formatReportingScope,
} from '../../src/reporting/index.js';
import type { TokenDiffResult } from '../../src/diff.js';

function createEmptyDiff(): TokenDiffResult {
  return {
    added: [],
    removed: [],
    changed: [],
    renamed: [],
    summary: {
      totalPrevious: 0,
      totalNext: 0,
      added: 0,
      removed: 0,
      renamed: 0,
      changed: 0,
      unchanged: 0,
      breaking: 0,
      nonBreaking: 0,
      valueChanged: 0,
      metadataChanged: 0,
      recommendedBump: 'none',
      types: [],
      groups: [],
    },
  } satisfies TokenDiffResult;
}

describe('reporting registry', () => {
  test('renders using the builtin CLI formatter by default', async () => {
    const result = await renderReport(createEmptyDiff(), { format: 'cli' });
    expect(result).toContain('DTIFX DIFF REPORT');
  });

  test('supports custom renderers through the registry', async () => {
    const registry = createReportRendererRegistry({
      renderers: [
        {
          format: 'cli',
          render: async (_diff, _options, context) => {
            await context?.diagnostics?.emit({
              level: 'warn',
              message: 'custom renderer invoked',
            });
            return 'custom-render';
          },
        },
      ],
    });

    const diagnostics = createDiagnosticsCollector();
    const result = await registry.render(createEmptyDiff(), { format: 'cli' }, { diagnostics });
    expect(result).toBe('custom-render');
    const codes = diagnostics.events.map((event) => event.code);
    expect(codes).toContain('REPORT_RENDER_START');
    expect(codes).toContain('REPORT_RENDER_COMPLETE');
    const registryEvents = diagnostics.events.filter((event) =>
      event.code?.startsWith('REPORT_RENDER'),
    );
    expect(registryEvents.map((event) => event.category)).toEqual([
      DiagnosticCategories.reportingRegistry,
      DiagnosticCategories.reportingRegistry,
    ]);
    expect(
      diagnostics.events.some(
        (event) => event.code === undefined && event.message === 'custom renderer invoked',
      ),
    ).toBe(true);
  });

  test('forwards diagnostics context when using the default render helper', async () => {
    const diagnostics = createDiagnosticsCollector();
    const result = await renderReport(createEmptyDiff(), { format: 'cli' }, { diagnostics });

    expect(result).toContain('DTIFX DIFF REPORT');
    const codes = diagnostics.events.map((event) => event.code);
    expect(codes).toContain('REPORT_RENDER_START');
    expect(codes).toContain('REPORT_RENDER_COMPLETE');
    expect(
      diagnostics.events
        .filter((event) => event.code?.startsWith('REPORT_RENDER'))
        .every((event) => event.category === DiagnosticCategories.reportingRegistry),
    ).toBe(true);
  });

  test('builtin renderers satisfy the port contract with diagnostics context', async () => {
    const registry = createReportRendererRegistry();
    const diff = createEmptyDiff();
    const diagnostics = createDiagnosticsCollector();
    const context = { diagnostics };
    const runContext = {
      previous: 'prev',
      next: 'next',
      startedAt: new Date(0).toISOString(),
      durationMs: 100,
    } as const;

    const renderOptions: Record<ReportRenderFormat, RenderReportOptions> = {
      cli: {
        format: 'cli',
        color: false,
        mode: 'condensed',
        verbose: false,
        showWhy: false,
        diffContext: 2,
        topRisks: 0,
        links: false,
        runContext,
        unicode: false,
      },
      html: {
        format: 'html',
        mode: 'summary',
        topRisks: 0,
        diffContext: 2,
        showWhy: false,
        runContext,
      },
      markdown: {
        format: 'markdown',
        mode: 'summary',
        topRisks: 0,
        diffContext: 2,
        showWhy: false,
        runContext,
      },
      json: {
        format: 'json',
        mode: 'summary',
        topRisks: 0,
        runContext,
      },
      yaml: {
        format: 'yaml',
        mode: 'summary',
        topRisks: 0,
        runContext,
      },
      sarif: {
        format: 'sarif',
        runContext,
      },
      template: {
        format: 'template',
        template: '{{summary.totalNext}}',
        topRisks: 0,
        mode: 'summary',
        runContext,
      },
    } satisfies Record<ReportRenderFormat, RenderReportOptions>;

    for (const format of Object.keys(renderOptions) as ReportRenderFormat[]) {
      diagnostics.events.length = 0;
      const output = await registry.render(diff, renderOptions[format], context);
      expect(typeof output).toBe('string');
      const codes = diagnostics.events.map((event) => event.code);
      expect(codes).toContain('REPORT_RENDER_START');
      expect(codes).toContain('REPORT_RENDER_COMPLETE');
      expect(
        diagnostics.events
          .filter((event) => event.code?.startsWith('REPORT_RENDER'))
          .every((event) => event.category === DiagnosticCategories.reportingRegistry),
      ).toBe(true);
    }
  });

  test('custom renderers that use the helper inherit the reporting category', async () => {
    const diagnostics = createDiagnosticsCollector();
    const registry = createReportRendererRegistry({
      renderers: [
        {
          format: 'markdown',
          async render(_diff, options, context) {
            if (options.format !== 'markdown') {
              throw new Error('Expected markdown format.');
            }

            emitRendererDiagnostic(
              context,
              {
                level: 'info',
                message: 'custom renderer invoked',
              },
              formatReportingScope('markdown'),
            );

            return 'custom-markdown-render';
          },
        },
      ],
    });

    const result = await registry.render(
      createEmptyDiff(),
      { format: 'markdown' },
      { diagnostics },
    );
    expect(result).toBe('custom-markdown-render');

    const event = diagnostics.events.find((entry) => entry.message === 'custom renderer invoked');
    expect(event?.category).toBe(DiagnosticCategories.reporting);
    expect(event?.scope).toBe(formatReportingScope('markdown'));
  });
});

function createDiagnosticsCollector(): DiagnosticsPort & { readonly events: DiagnosticEvent[] } {
  const events: DiagnosticEvent[] = [];
  return {
    events,
    async emit(event) {
      events.push(event);
    },
  };
}

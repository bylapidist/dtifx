import type { TokenDiffResult } from '../domain/diff-types.js';
import type { ReportRendererContext, ReportRendererPort } from '../application/ports/reporting.js';
import type { DiagnosticEvent, DiagnosticsPort } from '../application/ports/diagnostics.js';
import { DiagnosticCategories, formatReportingScope } from '../application/ports/diagnostics.js';
import { formatDiffAsCli, supportsCliHyperlinks as detectCliHyperlinks } from './renderers/cli.js';
import { formatDiffAsHtml } from './renderers/html.js';
import { formatDiffAsJson } from './renderers/json.js';
import { formatDiffAsMarkdown } from './renderers/markdown.js';
import { formatDiffAsSarif } from './renderers/sarif.js';
import { formatDiffWithTemplate } from './renderers/template.js';
import { formatDiffAsYaml } from './renderers/yaml.js';
import type { RenderReportOptions, ReportRenderFormat } from './options.js';

export interface ReportRendererRegistry {
  register(renderer: ReportRendererPort): void;
  get(format: ReportRenderFormat): ReportRendererPort | undefined;
  list(): readonly ReportRendererPort[];
  render(
    diff: TokenDiffResult,
    options: RenderReportOptions,
    context?: ReportRendererContext,
  ): Promise<string>;
}

const builtinRenderers: readonly ReportRendererPort[] = [
  {
    format: 'cli',
    render(diff, options, context) {
      if (options.format !== 'cli') {
        throw new Error(`CLI renderer cannot handle format "${options.format}".`);
      }

      const { format: _format, ...rest } = options;
      return formatDiffAsCli(diff, rest, context);
    },
  },
  {
    format: 'html',
    render(diff, options, context) {
      if (options.format !== 'html') {
        throw new Error(`HTML renderer cannot handle format "${options.format}".`);
      }

      const { format: _format, ...rest } = options;
      return formatDiffAsHtml(diff, rest, context);
    },
  },
  {
    format: 'markdown',
    render(diff, options, context) {
      if (options.format !== 'markdown') {
        throw new Error(`Markdown renderer cannot handle format "${options.format}".`);
      }

      const { format: _format, ...rest } = options;
      return formatDiffAsMarkdown(diff, rest, context);
    },
  },
  {
    format: 'json',
    render(diff, options, context) {
      if (options.format !== 'json') {
        throw new Error(`JSON renderer cannot handle format "${options.format}".`);
      }

      const { format: _format, ...rest } = options;
      return formatDiffAsJson(diff, rest, context);
    },
  },
  {
    format: 'yaml',
    render(diff, options, context) {
      if (options.format !== 'yaml') {
        throw new Error(`YAML renderer cannot handle format "${options.format}".`);
      }

      const { format: _format, ...rest } = options;
      return formatDiffAsYaml(diff, rest, context);
    },
  },
  {
    format: 'sarif',
    render(diff, options, context) {
      if (options.format !== 'sarif') {
        throw new Error(`SARIF renderer cannot handle format "${options.format}".`);
      }

      const { format: _format, ...rest } = options;
      return formatDiffAsSarif(diff, rest, context);
    },
  },
  {
    format: 'template',
    render(diff, options, context) {
      if (options.format !== 'template') {
        throw new Error(`Template renderer cannot handle format "${options.format}".`);
      }

      const { format: _format, ...rest } = options;
      return formatDiffWithTemplate(diff, rest, context);
    },
  },
] as const;

/**
 * Creates a registry of report renderers combining built-in and user-provided
 * implementations.
 *
 * @param config - Optional registry configuration.
 * @param config.renderers - Additional renderer implementations to register.
 * @returns A registry capable of registering, listing, and executing renderers.
 */
export function createReportRendererRegistry(
  config: {
    readonly renderers?: Iterable<ReportRendererPort>;
  } = {},
): ReportRendererRegistry {
  const { renderers = [] } = config;
  const registry = new Map<ReportRenderFormat, ReportRendererPort>();
  const ordered: ReportRendererPort[] = [];

  const register = (renderer: ReportRendererPort): void => {
    registry.set(renderer.format, renderer);
    const existingIndex = ordered.findIndex((entry) => entry.format === renderer.format);

    if (existingIndex === -1) {
      ordered.push(renderer);
      return;
    }

    ordered.splice(existingIndex, 1, renderer);
  };

  for (const renderer of builtinRenderers) {
    register(renderer);
  }

  for (const renderer of renderers) {
    register(renderer);
  }

  return {
    register,
    get(format) {
      return registry.get(format);
    },
    list() {
      return [...ordered];
    },
    async render(diff, options, context) {
      const renderer = registry.get(options.format);

      if (!renderer) {
        throw new Error(`No report renderer registered for format "${options.format}".`);
      }

      const diagnostics = context?.diagnostics;
      const scope = formatReportingScope(options.format);
      const startedAt = getTimestamp();

      emitRegistryDiagnostic(diagnostics, {
        level: 'info',
        code: 'REPORT_RENDER_START',
        message: `Rendering "${options.format}" report.`,
        scope,
        category: DiagnosticCategories.reportingRegistry,
      });

      try {
        const result = await Promise.resolve(renderer.render(diff, options, context));
        const duration = getTimestamp() - startedAt;

        emitRegistryDiagnostic(diagnostics, {
          level: 'info',
          code: 'REPORT_RENDER_COMPLETE',
          message: `Rendered "${options.format}" report in ${formatDuration(duration)}.`,
          scope,
          category: DiagnosticCategories.reportingRegistry,
        });

        return result;
      } catch (error) {
        emitRegistryDiagnostic(diagnostics, {
          level: 'error',
          code: 'REPORT_RENDER_FAILED',
          message: `Renderer failed: ${formatRenderError(error)}.`,
          scope,
          category: DiagnosticCategories.reportingRegistry,
        });
        throw error;
      }
    },
  } satisfies ReportRendererRegistry;
}

const defaultRegistry = createReportRendererRegistry();

/**
 * Renders a diff using the default renderer registry.
 *
 * @param diff - The diff result to render.
 * @param options - Rendering options selecting format and parameters.
 * @param context - Optional renderer context including diagnostics ports.
 * @returns The rendered report output.
 */
export async function renderReport(
  diff: TokenDiffResult,
  options: RenderReportOptions,
  context?: ReportRendererContext,
): Promise<string> {
  return defaultRegistry.render(diff, options, context);
}

function emitRegistryDiagnostic(
  diagnostics: DiagnosticsPort | undefined,
  event: DiagnosticEvent & { readonly code: string },
): void {
  if (!diagnostics) {
    return;
  }

  const payload: DiagnosticEvent = {
    ...event,
    category: event.category ?? DiagnosticCategories.reportingRegistry,
  };

  void diagnostics.emit(payload);
}

function getTimestamp(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs)) {
    return 'unknown time';
  }

  if (durationMs < 1) {
    return `${durationMs.toFixed(2)}ms`;
  }

  if (durationMs < 1000) {
    return `${durationMs.toFixed(1)}ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }

  const minutes = seconds / 60;
  return `${minutes.toFixed(2)}m`;
}

function formatRenderError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return JSON.stringify(error);
}

/**
 * Determines whether the current terminal supports OSC-8 hyperlinks.
 *
 * @returns True when CLI hyperlinks should be emitted.
 */
export function supportsCliHyperlinks(): boolean {
  return detectCliHyperlinks();
}

export { createJsonPayload } from './renderers/json.js';
export type { RenderReportOptions, ReportRenderFormat } from './options.js';
export type { ReportRendererPort } from '../application/ports/reporting.js';

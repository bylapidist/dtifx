import { createRequire } from 'node:module';

import type { TokenDiffResult } from '../../diff.js';
import type { ReportRendererContext } from '../../application/ports/reporting.js';
import { createJsonPayload } from './json.js';
import { createReportDescriptor } from '../report-descriptor.js';
import type { ReportRunContext } from '../run-context.js';

type HandlebarsHelper = (this: unknown, ...args: unknown[]) => unknown;

type HandlebarsTemplateDelegate<Context extends object = Record<string, unknown>> = (
  context: Context,
) => string;

interface HandlebarsCompileOptions {
  readonly noEscape?: boolean;
  readonly strict?: boolean;
}

interface HandlebarsEnvironment {
  registerHelper(name: string, helper: HandlebarsHelper): void;
  registerPartial(name: string, partial: string): void;
  compile<Context extends object = Record<string, unknown>>(
    template: string,
    options?: HandlebarsCompileOptions,
  ): HandlebarsTemplateDelegate<Context>;
}

interface HandlebarsRuntime extends HandlebarsEnvironment {
  create(): HandlebarsEnvironment;
}

let cachedHandlebars: HandlebarsRuntime | undefined;

function getHandlebars(): HandlebarsRuntime {
  cachedHandlebars ??= loadHandlebarsRuntime();
  return cachedHandlebars;
}

function loadHandlebarsRuntime(): HandlebarsRuntime {
  let required: unknown;

  try {
    const require = createRequire(import.meta.url);
    required = require('handlebars');
  } catch (error: unknown) {
    const loadError = new Error(
      'The template formatter requires the optional dependency "handlebars". Install it with `npm install handlebars` to enable --format template.',
    );
    (loadError as Error & { cause?: unknown }).cause = error;
    throw loadError;
  }

  const runtime = normalizeHandlebarsModule(required);

  if (!runtime) {
    throw new Error(
      'The resolved "handlebars" module does not expose a runtime API. Install the official handlebars package to use --format template.',
    );
  }

  return runtime;
}

function normalizeHandlebarsModule(module: unknown): HandlebarsRuntime | undefined {
  const candidate = extractDefaultExport(module);

  if (
    candidate &&
    (typeof candidate === 'function' || typeof candidate === 'object') &&
    typeof (candidate as { create?: unknown }).create === 'function'
  ) {
    return candidate as HandlebarsRuntime;
  }

  return undefined;
}

function extractDefaultExport(module: unknown): unknown {
  if (
    module &&
    typeof module === 'object' &&
    'default' in module &&
    (module as { default: unknown }).default !== undefined
  ) {
    return (module as { default: unknown }).default;
  }

  return module;
}

export interface TemplateFormatterOptions {
  readonly template: string;
  readonly mode?: 'full' | 'summary' | 'condensed' | 'detailed';
  readonly runContext?: ReportRunContext;
  readonly topRisks?: number;
  readonly helpers?: Record<string, HandlebarsHelper>;
  readonly partials?: Record<string, string>;
  /**
   * When true the template renderer disables Handlebars escaping. This is unsafe when templates include
   * user-controlled content and should only be enabled for trusted output targets.
   */
  readonly allowUnescapedOutput?: boolean;
}

interface TemplateContext {
  diff: TokenDiffResult;
  summary: TokenDiffResult['summary'];
  report: ReturnType<typeof createReportDescriptor>;
  payload: ReturnType<typeof createJsonPayload>;
  mode: 'full' | 'summary' | 'condensed' | 'detailed';
  run?: ReportRunContext;
  generatedAt: string;
}

/**
 * Renders a diff using a Handlebars template supplied at runtime.
 *
 * @param diff - The diff result to render.
 * @param options - Template options including helpers, partials, and metadata.
 * @param _context - Unused renderer context placeholder for API parity.
 * @returns The rendered template output.
 */
export function formatDiffWithTemplate(
  diff: TokenDiffResult,
  options: TemplateFormatterOptions,
  _context?: ReportRendererContext,
): string {
  const template = prepareTemplate(options);
  const requestedMode = options.mode ?? 'full';
  const payloadMode = requestedMode === 'condensed' ? 'full' : requestedMode;
  const report = createReportDescriptor(diff, {
    ...(options.topRisks === undefined ? {} : { topRiskLimit: options.topRisks }),
  });
  const payload = createJsonPayload(diff, payloadMode, {
    ...(options.runContext === undefined ? {} : { runContext: options.runContext }),
    ...(options.topRisks === undefined ? {} : { topRisks: options.topRisks }),
  });

  const context: TemplateContext = {
    diff,
    summary: diff.summary,
    report,
    payload,
    mode: requestedMode,
    ...(options.runContext === undefined ? {} : { run: options.runContext }),
    generatedAt: new Date().toISOString(),
  };

  return template(context);
}

function prepareTemplate(
  options: TemplateFormatterOptions,
): HandlebarsTemplateDelegate<TemplateContext> {
  if (!options.template || options.template.trim().length === 0) {
    throw new Error('Template content must not be empty');
  }

  const runtime = getHandlebars();
  const instance = runtime.create();
  registerDefaultHelpers(instance);

  if (options.helpers) {
    for (const [name, helper] of Object.entries(options.helpers)) {
      instance.registerHelper(name, helper);
    }
  }

  if (options.partials) {
    for (const [name, partial] of Object.entries(options.partials)) {
      instance.registerPartial(name, partial);
    }
  }

  const compileOptions: HandlebarsCompileOptions = {
    strict: true,
    ...(options.allowUnescapedOutput ? { noEscape: true } : {}),
  };

  return instance.compile(options.template, compileOptions);
}

function registerDefaultHelpers(environment: HandlebarsEnvironment): void {
  environment.registerHelper('json', (...args: unknown[]) => {
    const [value, maybeSpaces] = args;
    let spaces = 2;

    if (typeof maybeSpaces === 'number' && Number.isFinite(maybeSpaces)) {
      spaces = maybeSpaces;
    } else if (typeof maybeSpaces === 'string' && maybeSpaces.length > 0) {
      const parsed = Number(maybeSpaces);
      if (Number.isFinite(parsed)) {
        spaces = parsed;
      }
    }

    return JSON.stringify(value, undefined, spaces);
  });

  environment.registerHelper('uppercase', (value: unknown) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  );

  environment.registerHelper('lowercase', (value: unknown) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  );
}

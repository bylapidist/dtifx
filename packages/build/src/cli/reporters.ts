import path from 'node:path';
import { JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import type { DiagnosticEvent, DiagnosticRelatedInformation, RunContext } from '@dtifx/core';
import { append, describeRunComparison, formatRunDuration, formatRunTimestamp } from '@dtifx/core';
import {
  escapeHtml,
  escapeMarkdown,
  formatDurationMs,
  formatUnknownError,
  serialiseError,
  writeJson,
  writeLine,
  type WritableTarget,
} from '@dtifx/core/reporting';

export { formatDurationMs } from '@dtifx/core/reporting';
import type { SourcePlan } from '../config/index.js';
import type { StructuredLogEvent, StructuredLogger } from '@dtifx/core/logging';
import { SourcePlannerError } from '../application/planner/source-planner.js';
import type {
  BuildRunResult,
  BuildTimings,
  DependencyChangeSummary,
} from '../application/build-runtime.js';
/**
 * Output formats supported by the CLI reporter.
 */
export type ReporterFormat = 'human' | 'json' | 'markdown' | 'html';

/**
 * Options that control reporter behaviour and output formatting.
 */
interface ReporterOptions {
  readonly format: ReporterFormat;
  readonly logger: StructuredLogger;
  readonly stdout?: WritableTarget;
  readonly stderr?: WritableTarget;
  readonly cwd?: string;
  readonly includeTimings?: boolean;
}

/**
 * Contextual information provided when reporting a successful build.
 */
export interface BuildReportContext {
  readonly result: BuildRunResult;
  readonly writtenArtifacts: ReadonlyMap<string, readonly string[]>;
  readonly reason: string;
}

/**
 * Reporting surface consumed by CLI commands to surface progress and results.
 */
export interface Reporter {
  readonly format: ReporterFormat;
  validateSuccess(plan: SourcePlan): void;
  validateFailure(error: SourcePlannerError): void;
  buildSuccess(context: BuildReportContext): void;
  buildFailure(error: unknown): void;
  watchInfo(message: string): void;
  watchError(message: string, error: unknown): void;
}

/**
 * Pre-computed helpers shared between reporter implementations.
 */
interface ReporterContext {
  readonly stdout: WritableTarget;
  readonly stderr: WritableTarget;
  readonly cwd: string;
  readonly logger: StructuredLogger;
  readonly includeTimings: boolean;
  readonly getPlanSummary: (plan: SourcePlan) => PlanSummary;
  readonly logPlannerFailure: (event: string, error: SourcePlannerError) => PlannerFailureReport;
}

/**
 * Short summary of a planned build used by structured logs.
 */
interface PlanSummary {
  readonly entryCount: number;
  readonly createdAt: string;
}

/**
 * Aggregated validation failures for a single source.
 */
interface PlannerFailureSummary {
  readonly sourceId: string;
  readonly uri: string;
  readonly pointerPrefix: string;
  readonly errors: readonly PlannerFailureDetail[];
}

/**
 * Individual validation error captured during planning.
 */
interface PlannerFailureDetail {
  readonly pointer: string;
  readonly message: string;
  readonly keyword: string;
  readonly schemaPath: string;
  readonly params: Readonly<Record<string, unknown>>;
}

interface PlannerFailureReport {
  readonly failures: readonly PlannerFailureSummary[];
  readonly diagnostics: readonly DiagnosticEvent[];
}

/**
 * Summary of a generated artifact included in JSON output.
 */
interface JsonBuildArtifactSummary {
  readonly path: string;
  readonly encoding: string;
  readonly checksum?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly written?: {
    readonly absolute: string;
    readonly relative: string;
  };
}

/**
 * Formatter summary used in JSON reports.
 */
interface JsonFormatterSummary {
  readonly id: string;
  readonly name: string;
  readonly output: BuildRunResult['formatters'][number]['output'];
  readonly artifactCount: number;
  readonly artifacts: readonly JsonBuildArtifactSummary[];
}

const NEWLINE = '\n';

/**
 * Creates a reporter instance for the requested format.
 * @param {ReporterOptions} options - Reporter configuration including IO targets and logger.
 * @returns {Reporter} Reporter implementation for the selected format.
 */
export function createReporter(options: ReporterOptions): Reporter {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const cwd = options.cwd ?? process.cwd();
  const includeTimings = options.includeTimings ?? false;
  const planSummaryCache = new WeakMap<SourcePlan, PlanSummary>();

  const getPlanSummary = (plan: SourcePlan): PlanSummary => {
    const cached = planSummaryCache.get(plan);
    if (cached) {
      return cached;
    }
    const summary: PlanSummary = {
      entryCount: plan.entries.length,
      createdAt: plan.createdAt.toISOString(),
    };
    planSummaryCache.set(plan, summary);
    return summary;
  };

  const logPlannerFailure = (event: string, error: SourcePlannerError): PlannerFailureReport => {
    const failures = Array.from(
      error.failures,
      (failure): PlannerFailureSummary => ({
        sourceId: failure.sourceId,
        uri: failure.uri,
        pointerPrefix: failure.pointerPrefix,
        errors: failure.errors.map((detail) => ({
          pointer: detail.instancePath === '' ? JSON_POINTER_ROOT : detail.instancePath,
          message: detail.message ?? 'Validation error',
          keyword: detail.keyword,
          schemaPath: detail.schemaPath,
          params: detail.params,
        })),
      }),
    );

    options.logger.log({
      level: 'error',
      name: 'dtifx-build',
      event,
      data: {
        failures,
        diagnostics: error.diagnostics,
      },
    });

    return { failures, diagnostics: error.diagnostics } satisfies PlannerFailureReport;
  };

  const context: ReporterContext = {
    stdout,
    stderr,
    cwd,
    logger: options.logger,
    includeTimings,
    getPlanSummary,
    logPlannerFailure,
  };

  const reporterFactories: Record<ReporterFormat, (context: ReporterContext) => Reporter> = {
    json: createJsonReporter,
    markdown: createMarkdownReporter,
    html: createHtmlReporter,
    human: createHumanReporter,
  };

  return reporterFactories[options.format](context);
}

/**
 * Creates the JSON reporter implementation.
 * @param {ReporterContext} context - Shared reporter helpers and IO targets.
 * @returns {Reporter} Reporter that emits machine-readable JSON events.
 */
function createJsonReporter(context: ReporterContext): Reporter {
  return {
    format: 'json',
    validateSuccess(plan) {
      const summary = context.getPlanSummary(plan);
      const payload = {
        event: 'validate.completed',
        status: 'ok' as const,
        plan: summary,
      };
      writeJson(context.stdout, payload);
      context.logger.log({
        level: 'info',
        name: 'dtifx-build',
        event: 'validate.completed',
        data: planSummaryData(summary),
      });
    },
    validateFailure(error) {
      const report = context.logPlannerFailure('validate.failed', error);
      const payload = {
        event: 'validate.failed',
        status: 'error' as const,
        failures: report.failures,
        diagnostics: report.diagnostics,
      };
      writeJson(context.stderr, payload);
    },
    buildSuccess({ result, writtenArtifacts, reason }) {
      const artifactCount = result.formatters.reduce(
        (count, formatter) => count + formatter.artifacts.length,
        0,
      );
      const plan = context.getPlanSummary(result.plan);
      const formatters: JsonFormatterSummary[] = result.formatters.map((formatter) => {
        const written = writtenArtifacts.get(formatter.id) ?? [];
        const artifacts: JsonBuildArtifactSummary[] = formatter.artifacts.map(
          (artifact, index) => ({
            path: artifact.path,
            encoding: artifact.encoding,
            ...(artifact.checksum ? { checksum: artifact.checksum } : {}),
            ...(artifact.metadata ? { metadata: artifact.metadata } : {}),
            ...(written[index]
              ? {
                  written: {
                    absolute: written[index],
                    relative: path.relative(context.cwd, written[index]),
                  },
                }
              : {}),
          }),
        );
        return {
          id: formatter.id,
          name: formatter.name,
          output: formatter.output,
          artifactCount: formatter.artifacts.length,
          artifacts,
        } satisfies JsonFormatterSummary;
      });

      const payload = {
        event: 'build.completed',
        status: 'ok' as const,
        reason,
        plan,
        tokenCount: result.tokens.length,
        artifactCount,
        timings: result.timings,
        metrics: result.metrics,
        transformCache: result.transformCache,
        ...(result.runContext ? { runContext: result.runContext } : {}),
        ...(result.dependencyChanges
          ? { dependencyChanges: serialiseDependencyChanges(result.dependencyChanges) }
          : {}),
        formatters,
      };

      writeJson(context.stdout, payload);
      logBuildSummary(context.logger, result, reason, artifactCount);
    },
    buildFailure(error) {
      if (error instanceof SourcePlannerError) {
        this.validateFailure(error);
        return;
      }
      const serialised = serialiseError(error);
      const payload = {
        event: 'build.failed',
        status: 'error' as const,
        error: serialised,
      };
      writeJson(context.stderr, payload);
      context.logger.log({
        level: 'error',
        name: 'dtifx-build',
        event: 'build.failed',
        data: { error: serialised },
      });
    },
    watchInfo(message) {
      const payload = {
        event: 'watch.info',
        status: 'info' as const,
        message,
      };
      writeJson(context.stdout, payload);
    },
    watchError(message, error) {
      const serialised = serialiseError(error);
      const payload = {
        event: 'watch.error',
        status: 'error' as const,
        message,
        error: serialised,
      };
      writeJson(context.stderr, payload);
    },
  } satisfies Reporter;
}

/**
 * Creates a text-based reporter used for both human and markdown outputs.
 * @param {'human' | 'markdown'} format - Identifier for the reporter format.
 * @param {ReporterContext} context - Shared reporter helpers and IO targets.
 * @returns {Reporter} Reporter implementation.
 */
function createTextReporter(format: 'human' | 'markdown', context: ReporterContext): Reporter {
  return {
    format,
    validateSuccess(plan) {
      const summary = context.getPlanSummary(plan);
      context.logger.log({
        level: 'info',
        name: 'dtifx-build',
        event: 'validate.completed',
        data: planSummaryData(summary),
      });
      writeLine(
        context.stdout,
        `Planned ${summary.entryCount.toString(10)} DTIF sources successfully.`,
      );
    },
    validateFailure(error) {
      const report = context.logPlannerFailure('validate.failed', error);
      writeLine(context.stderr, 'One or more DTIF sources failed validation:');
      for (const failure of report.failures) {
        writeLine(context.stderr, `- Source ${failure.sourceId} (${failure.uri})`);
        for (const detail of failure.errors) {
          writeLine(context.stderr, `  • ${detail.pointer}: ${detail.message}`);
        }
      }
      if (report.diagnostics.length > 0) {
        writeLine(context.stderr, '');
        writeLine(context.stderr, 'Diagnostics:');
        for (const diagnostic of report.diagnostics) {
          writeLine(context.stderr, formatDiagnosticForText(diagnostic));
          for (const info of diagnostic.related ?? []) {
            writeLine(context.stderr, formatRelatedInformationText(info));
          }
        }
      }
    },
    buildSuccess({ result, writtenArtifacts, reason }) {
      const artifactCount = result.formatters.reduce(
        (count, formatter) => count + formatter.artifacts.length,
        0,
      );
      logBuildSummary(context.logger, result, reason, artifactCount);
      const tokenCountText = result.tokens.length.toString(10);
      const artifactCountText = artifactCount.toString(10);
      writeLine(
        context.stdout,
        `Generated ${artifactCountText} artifacts for ${tokenCountText} tokens in ${formatDurationMs(result.timings.totalMs)}.`,
      );
      const runContextLines =
        format === 'markdown'
          ? formatRunContextMarkdown(result.runContext)
          : formatRunContextText(result.runContext);
      for (const line of runContextLines) {
        writeLine(context.stdout, line);
      }
      if (context.includeTimings) {
        writeLine(context.stdout, formatTimingSummary(result.timings));
      }
      writeLine(context.stdout, formatMetricsSummary(result.metrics));
      writeLine(context.stdout, formatTransformCacheSummary(result.transformCache));
      writeLine(context.stdout, formatDependencySummary(result.dependencyChanges));
      for (const formatter of result.formatters) {
        const written = writtenArtifacts.get(formatter.id) ?? [];
        for (const filePath of written) {
          writeLine(context.stdout, `  - ${path.relative(context.cwd, filePath)}`);
        }
      }
    },
    buildFailure(error) {
      if (error instanceof SourcePlannerError) {
        this.validateFailure(error);
        return;
      }
      const message = formatUnknownError(error);
      writeLine(context.stderr, `Build failed: ${message}`);
      context.logger.log({
        level: 'error',
        name: 'dtifx-build',
        event: 'build.failed',
        data: { message },
      });
    },
    watchInfo(message) {
      writeLine(context.stdout, message);
    },
    watchError(message, error) {
      const formatted = formatUnknownError(error);
      writeLine(context.stderr, `${message}: ${formatted}`);
    },
  } satisfies Reporter;
}

/**
 * Creates the human-readable reporter that writes plain text output.
 * @param {ReporterContext} context - Shared reporter helpers and IO targets.
 * @returns {Reporter} Human-friendly reporter implementation.
 */
function createHumanReporter(context: ReporterContext): Reporter {
  return createTextReporter('human', context);
}

/**
 * Creates the markdown reporter for CI and documentation friendly output.
 * @param {ReporterContext} context - Shared reporter helpers and IO targets.
 * @returns {Reporter} Markdown reporter implementation.
 */
function createMarkdownReporter(context: ReporterContext): Reporter {
  return createTextReporter('markdown', context);
}

/**
 * Creates the HTML reporter used by the audit command.
 * @param {ReporterContext} context - Shared reporter helpers and IO targets.
 * @returns {Reporter} HTML reporter implementation.
 */
function createHtmlReporter(context: ReporterContext): Reporter {
  return {
    format: 'html',
    validateSuccess(plan) {
      const summary = context.getPlanSummary(plan);
      context.logger.log({
        level: 'info',
        name: 'dtifx-build',
        event: 'validate.completed',
        data: planSummaryData(summary),
      });
      context.stdout.write(
        `<p class="validate-success">Planned <strong>${summary.entryCount.toString(
          10,
        )}</strong> DTIF sources successfully.</p>${NEWLINE}`,
      );
    },
    validateFailure(error) {
      const report = context.logPlannerFailure('validate.failed', error);
      const lines: string[] = [
        '<div class="validate-failure">',
        '<p>One or more DTIF sources failed validation:</p>',
        '<ul>',
      ];
      for (const failure of report.failures) {
        const errorItems = failure.errors.map(
          (detail) =>
            `<li><code>${escapeHtml(detail.pointer)}</code>: ${escapeHtml(detail.message)}</li>`,
        );
        append(
          lines,
          `<li><strong>${escapeHtml(failure.sourceId)}</strong> (${escapeHtml(failure.uri)})<ul>`,
          ...errorItems,
          '</ul></li>',
        );
      }
      append(lines, '</ul></div>');
      if (report.diagnostics.length > 0) {
        append(lines, ...createHtmlDiagnostics(report.diagnostics));
      }
      context.stderr.write(`${lines.join(NEWLINE)}${NEWLINE}`);
    },
    buildSuccess({ result, writtenArtifacts, reason }) {
      const artifactCount = result.formatters.reduce(
        (count, formatter) => count + formatter.artifacts.length,
        0,
      );
      logBuildSummary(context.logger, result, reason, artifactCount);
      const tokenCountText = result.tokens.length.toString(10);
      const artifactCountText = artifactCount.toString(10);
      const lines: string[] = [
        '<div class="build-success">',
        `<p>Generated <strong>${artifactCountText}</strong> artifacts for <strong>${tokenCountText}</strong> tokens in <strong>${escapeHtml(
          formatDurationMs(result.timings.totalMs),
        )}</strong>.</p>`,
      ];
      const metricsItems = [
        ...createRunContextItems(result.runContext),
        ...(context.includeTimings ? createTimingItems(result.timings) : []),
        ...createMetricsList(result.metrics),
        createTransformCacheItem(result.transformCache),
        createDependencyChangeItem(result.dependencyChanges),
      ].filter((item): item is { label: string; value: string } => item !== undefined);
      if (metricsItems.length > 0) {
        const metricLines = metricsItems.map(
          (item) =>
            `<li><span class="label">${escapeHtml(item.label)}</span><span class="value">${escapeHtml(item.value)}</span></li>`,
        );
        append(lines, '<ul class="metrics">', ...metricLines, '</ul>');
      }
      const writtenLines: string[] = [];
      for (const formatter of result.formatters) {
        const written = writtenArtifacts.get(formatter.id) ?? [];
        for (const filePath of written) {
          writtenLines.push(
            `<li><code>${escapeHtml(path.relative(context.cwd, filePath))}</code></li>`,
          );
        }
      }
      if (writtenLines.length > 0) {
        append(lines, '<ul>', ...writtenLines, '</ul>');
      }
      append(lines, '</div>');
      context.stdout.write(`${lines.join(NEWLINE)}${NEWLINE}`);
    },
    buildFailure(error) {
      if (error instanceof SourcePlannerError) {
        this.validateFailure(error);
        return;
      }
      const message = escapeHtml(formatUnknownError(error));
      context.stderr.write(`<p class="build-failure">Build failed: ${message}</p>${NEWLINE}`);
      context.logger.log({
        level: 'error',
        name: 'dtifx-build',
        event: 'build.failed',
        data: { message: formatUnknownError(error) },
      });
    },
    watchInfo(message) {
      context.stdout.write(`<p class="watch-info">${escapeHtml(message)}</p>${NEWLINE}`);
    },
    watchError(message, error) {
      const formatted = escapeHtml(formatUnknownError(error));
      context.stderr.write(
        `<p class="watch-error">${escapeHtml(message)}: ${formatted}</p>${NEWLINE}`,
      );
    },
  } satisfies Reporter;
}

/**
 * Formats a diagnostic event into a human-readable string for text reporters.
 * @param {DiagnosticEvent} diagnostic - Diagnostic event to format.
 * @returns {string} Formatted diagnostic summary line.
 */
function formatDiagnosticForText(diagnostic: DiagnosticEvent): string {
  const level = diagnostic.level.toUpperCase();
  const category = diagnostic.category ? `[${diagnostic.category}] ` : '';
  const scope = diagnostic.scope ? `${diagnostic.scope}: ` : '';
  const code = diagnostic.code ? `${diagnostic.code} ` : '';
  const pointer = diagnostic.pointer ? ` (${diagnostic.pointer})` : '';
  return `  - [${level}] ${category}${scope}${code}${diagnostic.message}${pointer}`;
}

/**
 * Formats related diagnostic information for text reporters.
 * @param {DiagnosticRelatedInformation} info - Related diagnostic metadata.
 * @returns {string} Formatted related information line.
 */
function formatRelatedInformationText(info: DiagnosticRelatedInformation): string {
  const pointer = info.pointer ? ` (${info.pointer})` : '';
  return `    • ${info.message}${pointer}`;
}

/**
 * Builds HTML markup for diagnostics emitted during validation.
 * @param {readonly DiagnosticEvent[]} diagnostics - Diagnostics to serialise.
 * @returns {readonly string[]} HTML lines representing the diagnostics section.
 */
function createHtmlDiagnostics(diagnostics: readonly DiagnosticEvent[]): readonly string[] {
  if (diagnostics.length === 0) {
    return [];
  }

  const lines: string[] = ['<div class="diagnostics">', '<p>Diagnostics:</p>', '<ul>'];
  for (const diagnostic of diagnostics) {
    let item = `<li>${formatDiagnosticSummaryHtml(diagnostic)}`;
    const related = diagnostic.related ?? [];
    if (related.length > 0) {
      const relatedItems = related.map((info) => formatRelatedInformationHtml(info)).join('');
      item += `<ul>${relatedItems}</ul>`;
    }
    item += '</li>';
    lines.push(item);
  }
  lines.push('</ul>', '</div>');
  return lines;
}

/**
 * Formats a diagnostic summary into escaped HTML content.
 * @param {DiagnosticEvent} diagnostic - Diagnostic event to format.
 * @returns {string} Escaped HTML representation of the diagnostic summary.
 */
function formatDiagnosticSummaryHtml(diagnostic: DiagnosticEvent): string {
  const level = `[${escapeHtml(diagnostic.level.toUpperCase())}]`;
  const category = diagnostic.category ? `[${escapeHtml(diagnostic.category)}] ` : '';
  const scope = diagnostic.scope ? `${escapeHtml(diagnostic.scope)}: ` : '';
  const code = diagnostic.code ? `${escapeHtml(diagnostic.code)} ` : '';
  const pointer = diagnostic.pointer ? ` <code>${escapeHtml(diagnostic.pointer)}</code>` : '';
  return `${level} ${category}${scope}${code}${escapeHtml(diagnostic.message)}${pointer}`;
}

/**
 * Formats related diagnostic information into escaped HTML content.
 * @param {DiagnosticRelatedInformation} info - Related metadata to format.
 * @returns {string} HTML list item string representing the related information.
 */
function formatRelatedInformationHtml(info: DiagnosticRelatedInformation): string {
  const pointer = info.pointer ? ` <code>${escapeHtml(info.pointer)}</code>` : '';
  return `<li>${escapeHtml(info.message)}${pointer}</li>`;
}

/**
 * Converts a plan summary into structured log data.
 * @param {PlanSummary} summary - Plan summary to serialise.
 * @returns {Readonly<Record<string, unknown>>} Structured data representation.
 */
function planSummaryData(summary: PlanSummary): Readonly<Record<string, unknown>> {
  return {
    entryCount: summary.entryCount,
    createdAt: summary.createdAt,
  } satisfies Readonly<Record<string, unknown>>;
}

/**
 * Emits a structured log event summarising the completed build.
 * @param {StructuredLogger} logger - Logger used to emit the summary event.
 * @param {BuildRunResult} result - Completed build result.
 * @param {string} reason - Reason associated with the build execution.
 * @param {number} artifactCount - Count of artifacts produced during the build.
 * @returns {void}
 */
function logBuildSummary(
  logger: StructuredLogger,
  result: BuildRunResult,
  reason: string,
  artifactCount: number,
): void {
  const event: StructuredLogEvent = {
    level: 'info',
    name: 'dtifx-build',
    event: 'build.completed',
    elapsedMs: result.timings.totalMs,
    data: {
      reason,
      planMs: result.timings.planMs,
      parseMs: result.timings.parseMs,
      resolveMs: result.timings.resolveMs,
      transformMs: result.timings.transformMs,
      formatMs: result.timings.formatMs,
      dependencyMs: result.timings.dependencyMs,
      tokenCount: result.metrics.totalCount,
      typedTokenCount: result.metrics.typedCount,
      unreferencedTokenCount: result.metrics.references.unreferencedCount,
      aliasDepth: {
        average: result.metrics.aliasDepth.average,
        max: result.metrics.aliasDepth.max,
      },
      typeCounts: result.metrics.typeCounts,
      artifactCount,
      transformCache: result.transformCache,
      ...(result.runContext ? { runContext: result.runContext } : {}),
      dependencyChanges: serialiseDependencyChanges(result.dependencyChanges),
    },
  };
  logger.log(event);
}

/**
 * Formats build timing metrics for human-readable output.
 * @param {BuildTimings} timings - Recorded build timings.
 * @returns {string} Concise timing summary.
 */
function formatTimingSummary(timings: BuildTimings): string {
  const segments = [
    `plan: ${formatDurationMs(timings.planMs)}`,
    `parse: ${formatDurationMs(timings.parseMs)}`,
    `resolve: ${formatDurationMs(timings.resolveMs)}`,
    `transform: ${formatDurationMs(timings.transformMs)}`,
    `format: ${formatDurationMs(timings.formatMs)}`,
    `dependencies: ${formatDurationMs(timings.dependencyMs)}`,
    `total: ${formatDurationMs(timings.totalMs)}`,
  ];
  return `Timings — ${segments.join(', ')}`;
}

/**
 * Formats token metrics for plain-text output.
 * @param {BuildRunResult['metrics']} metrics - Token metrics collected during the build.
 * @returns {string} Readable summary of key metrics.
 */
function formatMetricsSummary(metrics: BuildRunResult['metrics']): string {
  const typedText = `${metrics.typedCount.toString(10)}/${metrics.totalCount.toString(10)}`;
  const aliasAverage = formatAverage(metrics.aliasDepth.average);
  const aliasMax = metrics.aliasDepth.max.toString(10);
  const unreferencedText = metrics.references.unreferencedCount.toString(10);
  const segments = [
    `typed: ${typedText}`,
    `alias depth avg: ${aliasAverage} (max ${aliasMax})`,
    `unreferenced: ${unreferencedText}`,
  ];
  const breakdown = formatTypeBreakdown(metrics.typeCounts);
  if (breakdown) {
    segments.push(`types: ${breakdown}`);
  }
  return `Token metrics — ${segments.join(', ')}`;
}

/**
 * Formats transform cache statistics for human-readable output.
 * @param {BuildRunResult['transformCache']} cache - Cache summary returned by the transformation stage.
 * @returns {string} Summary describing cache hits, misses, and skips.
 */
function formatTransformCacheSummary(cache: BuildRunResult['transformCache']): string {
  return `Transform cache — hits: ${cache.hits.toString(10)}, misses: ${cache.misses.toString(10)}, skipped: ${cache.skipped.toString(10)}`;
}

/**
 * Builds timing summary entries for HTML output.
 * @param {BuildRunResult['timings']} timings - Build timings to present.
 * @returns {readonly { label: string; value: string }[]} Timing entries for HTML rendering.
 */
function createTimingItems(
  timings: BuildRunResult['timings'],
): readonly { label: string; value: string }[] {
  const segments = [
    `plan ${formatDurationMs(timings.planMs)}`,
    `parse ${formatDurationMs(timings.parseMs)}`,
    `resolve ${formatDurationMs(timings.resolveMs)}`,
    `transform ${formatDurationMs(timings.transformMs)}`,
    `format ${formatDurationMs(timings.formatMs)}`,
    `dependencies ${formatDurationMs(timings.dependencyMs)}`,
    `total ${formatDurationMs(timings.totalMs)}`,
  ];
  return [{ label: 'Timings', value: segments.join(' · ') }];
}

/**
 * Builds token metric summary entries for HTML output.
 * @param {BuildRunResult['metrics']} metrics - Token metrics to present.
 * @returns {readonly { label: string; value: string }[]} Metric entries for HTML rendering.
 */
function createMetricsList(
  metrics: BuildRunResult['metrics'],
): readonly { label: string; value: string }[] {
  const items = [
    {
      label: 'Typed tokens',
      value: `${metrics.typedCount.toString(10)} / ${metrics.totalCount.toString(10)}`,
    },
    {
      label: 'Alias depth (avg / max)',
      value: `${formatAverage(metrics.aliasDepth.average)} / ${metrics.aliasDepth.max.toString(10)}`,
    },
    {
      label: 'Unreferenced tokens',
      value: metrics.references.unreferencedCount.toString(10),
    },
  ];
  const breakdown = formatTypeBreakdown(metrics.typeCounts);
  if (breakdown) {
    items.push({ label: 'Type breakdown', value: breakdown });
  }
  return items;
}

/**
 * Builds transform cache summary entries for HTML output.
 * @param {BuildRunResult['transformCache']} cache - Cache summary information.
 * @returns {{ label: string; value: string }} HTML entry describing cache performance.
 */
function createTransformCacheItem(cache: BuildRunResult['transformCache']): {
  label: string;
  value: string;
} {
  return {
    label: 'Transform cache (hits / misses / skipped)',
    value: `${cache.hits.toString(10)} / ${cache.misses.toString(10)} / ${cache.skipped.toString(10)}`,
  };
}

/**
 * Builds dependency change summary entries for HTML output.
 * @param {DependencyChangeSummary | undefined} changes - Dependency changes between runs.
 * @returns {{ label: string; value: string } | undefined} Summary entry or undefined if unavailable.
 */
function createDependencyChangeItem(
  changes: DependencyChangeSummary | undefined,
): { label: string; value: string } | undefined {
  const summary = ensureDependencySummary(changes);
  return {
    label: 'Dependency changes (changed / removed)',
    value: `${summary.changedPointers.length.toString(10)} / ${summary.removedPointers.length.toString(10)}`,
  };
}

interface RunContextDetails {
  readonly comparison?: string;
  readonly startedAt?: string;
  readonly duration?: string;
}

function extractRunContextDetails(context: RunContext | undefined): RunContextDetails | undefined {
  if (!context) {
    return undefined;
  }

  const comparison = describeRunComparison(context);
  const startedAt = formatRunTimestamp(context);
  const duration = formatRunDuration(context);

  if (!comparison && !startedAt && !duration) {
    return undefined;
  }

  return {
    ...(comparison ? { comparison } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(duration ? { duration } : {}),
  } satisfies RunContextDetails;
}

function formatRunContextText(context: RunContext | undefined): readonly string[] {
  const details = extractRunContextDetails(context);
  if (!details) {
    return [];
  }

  const lines: string[] = [];
  if (details.comparison) {
    lines.push(`Compared sources: ${details.comparison}`);
  }
  if (details.startedAt) {
    lines.push(`Run started: ${details.startedAt}`);
  }
  if (details.duration) {
    lines.push(`Run duration: ${details.duration}`);
  }
  return lines;
}

function formatRunContextMarkdown(context: RunContext | undefined): readonly string[] {
  const details = extractRunContextDetails(context);
  if (!details) {
    return [];
  }

  const lines: string[] = [];
  if (details.comparison) {
    lines.push(`- **Compared:** ${escapeMarkdown(details.comparison)}`);
  }
  if (details.startedAt) {
    lines.push(`- **Run started:** ${details.startedAt}`);
  }
  if (details.duration) {
    lines.push(`- **Run duration:** ${details.duration}`);
  }
  return lines;
}

function createRunContextItems(context: RunContext | undefined): readonly {
  label: string;
  value: string;
}[] {
  const details = extractRunContextDetails(context);
  if (!details) {
    return [];
  }

  const items: { label: string; value: string }[] = [];
  if (details.comparison) {
    items.push({ label: 'Compared', value: details.comparison });
  }
  if (details.startedAt) {
    items.push({ label: 'Run started', value: details.startedAt });
  }
  if (details.duration) {
    items.push({ label: 'Run duration', value: details.duration });
  }
  return items;
}

/**
 * Formats dependency change statistics for plain-text output.
 * @param {DependencyChangeSummary | undefined} changes - Dependency change summary.
 * @returns {string} Readable description of dependency updates.
 */
function formatDependencySummary(changes: DependencyChangeSummary | undefined): string {
  const summary = ensureDependencySummary(changes);
  return `Dependency changes — changed: ${summary.changedPointers.length.toString(10)}, removed: ${summary.removedPointers.length.toString(10)}`;
}

/**
 * Serialises dependency change information for structured logging.
 * @param {DependencyChangeSummary | undefined} changes - Dependency change summary.
 * @returns {{ readonly changedCount: number; readonly removedCount: number; readonly changedPointers: readonly string[]; readonly removedPointers: readonly string[]; }} Structured representation of dependency changes.
 */
function serialiseDependencyChanges(changes: DependencyChangeSummary | undefined): {
  readonly changedCount: number;
  readonly removedCount: number;
  readonly changedPointers: readonly string[];
  readonly removedPointers: readonly string[];
} {
  const summary = ensureDependencySummary(changes);
  return {
    changedCount: summary.changedPointers.length,
    removedCount: summary.removedPointers.length,
    changedPointers: summary.changedPointers,
    removedPointers: summary.removedPointers,
  };
}

/**
 * Ensures dependency change information is represented with default values when absent.
 * @param {DependencyChangeSummary | undefined} changes - Dependency change summary or undefined.
 * @returns {DependencyChangeSummary} Dependency summary with defaulted collections.
 */
function ensureDependencySummary(
  changes: DependencyChangeSummary | undefined,
): DependencyChangeSummary {
  if (changes) {
    return changes;
  }
  return { changedPointers: [], removedPointers: [] };
}

/**
 * Formats token type counts into a comma-separated string.
 * @param {Readonly<Record<string, number>>} typeCounts - Token counts per type.
 * @returns {string | undefined} Formatted breakdown or undefined when empty.
 */
function formatTypeBreakdown(typeCounts: Readonly<Record<string, number>>): string | undefined {
  const entries = Object.entries(typeCounts);
  if (entries.length === 0) {
    return undefined;
  }
  entries.sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0]);
  });
  return entries.map(([type, count]) => `${type} ${count.toString(10)}`).join(', ');
}

/**
 * Formats a floating-point value with two decimal places.
 * @param {number} value - Value to format.
 * @returns {string} Formatted number string.
 */
function formatAverage(value: number): string {
  if (Number.isFinite(value) === false) {
    return '0.00';
  }
  return value.toFixed(2);
}

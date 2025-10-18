import process from 'node:process';

import { append, describeRunComparison, formatRunDuration, formatRunTimestamp } from '@dtifx/core';
import type { RunContext } from '@dtifx/core';
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

import type { PolicyExecutionResult, PolicySummary } from '../../domain/policies/policy-engine.js';

export type AuditReporterFormat = 'human' | 'json' | 'markdown' | 'html';

export interface AuditStructuredLogEvent {
  readonly level: 'info' | 'warn' | 'error';
  readonly name: string;
  readonly event: string;
  readonly elapsedMs?: number;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface AuditStructuredLogger {
  log(entry: AuditStructuredLogEvent): void;
}

export interface AuditReporterOptions {
  readonly format: AuditReporterFormat | readonly AuditReporterFormat[];
  readonly logger: AuditStructuredLogger;
  readonly stdout?: WritableTarget;
  readonly stderr?: WritableTarget;
  readonly cwd?: string;
  readonly includeTimings?: boolean;
}

export interface AuditSummary extends PolicySummary {
  readonly tokenCount: number;
}

export interface AuditTimings {
  readonly planMs: number;
  readonly parseMs: number;
  readonly resolveMs: number;
  readonly transformMs: number;
  readonly formatMs: number;
  readonly dependencyMs: number;
  readonly totalMs: number;
  readonly auditMs: number;
  readonly totalWithAuditMs: number;
}

export interface AuditRunMetadata {
  readonly runContext?: RunContext;
}

export interface AuditRunResult {
  readonly policies: readonly PolicyExecutionResult[];
  readonly summary: AuditSummary;
  readonly timings: AuditTimings;
  readonly metadata?: AuditRunMetadata;
}

export interface AuditReporter {
  readonly format: AuditReporterFormat | readonly AuditReporterFormat[];
  auditSuccess(result: AuditRunResult): void;
  auditFailure(error: unknown): void;
}

interface AuditReporterContext {
  readonly stdout: WritableTarget;
  readonly stderr: WritableTarget;
  readonly cwd: string;
  readonly logger: AuditStructuredLogger;
  readonly includeTimings: boolean;
}

const NEWLINE = '\n';

/**
 * Creates an audit reporter for the requested format and IO targets.
 * @param {AuditReporterOptions} options - Reporter configuration.
 * @returns {AuditReporter} Reporter implementation for the desired format.
 */
export function createAuditReporter(options: AuditReporterOptions): AuditReporter {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const cwd = options.cwd ?? process.cwd();
  const includeTimings = options.includeTimings ?? false;

  const context: AuditReporterContext = {
    stdout,
    stderr,
    cwd,
    logger: options.logger,
    includeTimings,
  } satisfies AuditReporterContext;

  const requestedFormats = Array.isArray(options.format)
    ? options.format
    : ([options.format] as readonly AuditReporterFormat[]);
  const formats = dedupeReporterFormats(requestedFormats);

  if (formats.length === 0) {
    throw new Error('At least one audit reporter format must be provided.');
  }

  if (formats.length === 1) {
    return createReporterForFormat(formats[0]!, context);
  }

  const reporters = formats.map((format) => createReporterForFormat(format, context));

  return {
    format: Object.freeze([...formats]),
    auditSuccess(result) {
      for (const reporter of reporters) {
        reporter.auditSuccess(result);
      }
    },
    auditFailure(error) {
      for (const reporter of reporters) {
        reporter.auditFailure(error);
      }
    },
  } satisfies AuditReporter;
}

function createReporterForFormat(
  format: AuditReporterFormat,
  context: AuditReporterContext,
): AuditReporter {
  if (format === 'json') {
    return createJsonAuditReporter(context);
  }
  if (format === 'markdown') {
    return createMarkdownAuditReporter(context);
  }
  if (format === 'html') {
    return createHtmlAuditReporter(context);
  }
  return createHumanAuditReporter(context);
}

function dedupeReporterFormats(
  formats: readonly AuditReporterFormat[],
): readonly AuditReporterFormat[] {
  const seen = new Set<AuditReporterFormat>();
  const result: AuditReporterFormat[] = [];
  for (const format of formats) {
    if (!seen.has(format)) {
      seen.add(format);
      result.push(format);
    }
  }
  return result;
}

function createHumanAuditReporter(context: AuditReporterContext): AuditReporter {
  return {
    format: 'human',
    auditSuccess(result) {
      const status = auditStatus(result.summary);
      renderHumanAudit(result, context, status);
      context.logger.log({
        level: logLevelForStatus(status),
        name: 'dtifx-audit',
        event: 'audit.completed',
        data: auditLogData(result),
      });
    },
    auditFailure(error) {
      const message = formatUnknownError(error);
      writeLine(context.stderr, `Audit failed: ${message}`);
      context.logger.log({
        level: 'error',
        name: 'dtifx-audit',
        event: 'audit.failed',
        data: { message },
      });
    },
  } satisfies AuditReporter;
}

function createMarkdownAuditReporter(context: AuditReporterContext): AuditReporter {
  return {
    format: 'markdown',
    auditSuccess(result) {
      const status = auditStatus(result.summary);
      renderMarkdownAudit(result, context, status);
      context.logger.log({
        level: logLevelForStatus(status),
        name: 'dtifx-audit',
        event: 'audit.completed',
        data: auditLogData(result),
      });
    },
    auditFailure(error) {
      const message = formatUnknownError(error);
      writeLine(context.stderr, `Audit failed: ${message}`);
      context.logger.log({
        level: 'error',
        name: 'dtifx-audit',
        event: 'audit.failed',
        data: { message },
      });
    },
  } satisfies AuditReporter;
}

function createHtmlAuditReporter(context: AuditReporterContext): AuditReporter {
  return {
    format: 'html',
    auditSuccess(result) {
      const status = auditStatus(result.summary);
      const html = renderAuditHtml(result, status, context);
      writeLine(context.stdout, html);
      context.logger.log({
        level: logLevelForStatus(status),
        name: 'dtifx-audit',
        event: 'audit.completed',
        data: auditLogData(result),
      });
    },
    auditFailure(error) {
      const message = formatUnknownError(error);
      writeLine(context.stderr, `Audit failed: ${message}`);
      context.logger.log({
        level: 'error',
        name: 'dtifx-audit',
        event: 'audit.failed',
        data: { message },
      });
    },
  } satisfies AuditReporter;
}

function createJsonAuditReporter(context: AuditReporterContext): AuditReporter {
  return {
    format: 'json',
    auditSuccess(result) {
      const status = auditStatus(result.summary);
      const payload = {
        event: 'audit.completed',
        status,
        summary: result.summary,
        policies: result.policies.map((policy) => serialisePolicyResult(policy)),
        timings: result.timings,
        ...(result.metadata?.runContext ? { runContext: result.metadata.runContext } : {}),
      } as const;
      writeJson(context.stdout, payload);
      context.logger.log({
        level: logLevelForStatus(status),
        name: 'dtifx-audit',
        event: 'audit.completed',
        data: auditLogData(result),
      });
    },
    auditFailure(error) {
      const serialised = serialiseError(error);
      const payload = {
        event: 'audit.failed',
        status: 'error' as const,
        error: serialised,
      } as const;
      writeJson(context.stderr, payload);
      context.logger.log({
        level: 'error',
        name: 'dtifx-audit',
        event: 'audit.failed',
        data: { error: serialised },
      });
    },
  } satisfies AuditReporter;
}

function renderHumanAudit(
  result: AuditRunResult,
  context: AuditReporterContext,
  status: 'ok' | 'warn' | 'error',
): void {
  const runContextLines = formatRunContextText(result.metadata?.runContext);
  if (status === 'ok') {
    writeLine(
      context.stdout,
      `Audit passed: ${result.summary.policyCount.toString(10)} policies evaluated with no violations across ${result.summary.tokenCount.toString(10)} tokens.`,
    );
    for (const line of runContextLines) {
      writeLine(context.stdout, line);
    }
    return;
  }

  const violationText = result.summary.violationCount.toString(10);
  writeLine(
    context.stdout,
    `Audit completed with ${violationText} violation(s) across ${result.summary.policyCount.toString(10)} policies.`,
  );
  for (const line of runContextLines) {
    writeLine(context.stdout, line);
  }
  for (const policy of result.policies) {
    if (policy.violations.length === 0) {
      continue;
    }
    writeLine(
      context.stdout,
      `- ${policy.name}: ${policy.violations.length.toString(10)} violation(s)`,
    );
    for (const violation of policy.violations) {
      writeLine(
        context.stdout,
        `  [${violation.severity}] ${violation.pointer} — ${violation.message}`,
      );
      const provenance = violation.snapshot.provenance;
      writeLine(context.stdout, `    source: ${provenance.sourceId} (${provenance.uri})`);
      if (violation.details) {
        writeLine(context.stdout, `    details: ${JSON.stringify(violation.details)}`);
      }
    }
  }
}

function renderMarkdownAudit(
  result: AuditRunResult,
  context: AuditReporterContext,
  status: 'ok' | 'warn' | 'error',
): void {
  const summary = result.summary;
  writeLine(context.stdout, '# dtifx Audit Report');
  writeLine(context.stdout, '');
  writeLine(context.stdout, `- **Status:** ${status.toUpperCase()}`);
  writeLine(context.stdout, `- **Policies evaluated:** ${summary.policyCount.toString(10)}`);
  writeLine(context.stdout, `- **Tokens evaluated:** ${summary.tokenCount.toString(10)}`);
  writeLine(
    context.stdout,
    `- **Violations:** ${summary.violationCount.toString(10)} (errors: ${summary.severity.error.toString(10)}, warnings: ${summary.severity.warning.toString(10)}, info: ${summary.severity.info.toString(10)})`,
  );
  if (context.includeTimings) {
    writeLine(context.stdout, `- **Build duration:** ${formatDurationMs(result.timings.totalMs)}`);
    writeLine(context.stdout, `- **Audit duration:** ${formatDurationMs(result.timings.auditMs)}`);
    writeLine(
      context.stdout,
      `- **Total duration:** ${formatDurationMs(result.timings.totalWithAuditMs)}`,
    );
  }
  for (const line of formatRunContextMarkdown(result.metadata?.runContext)) {
    writeLine(context.stdout, line);
  }
  writeLine(context.stdout, '');

  if (summary.violationCount === 0) {
    writeLine(context.stdout, '✅ No policy violations detected.');
    return;
  }

  writeLine(context.stdout, '## Violations');
  for (const policy of result.policies) {
    if (policy.violations.length === 0) {
      continue;
    }
    writeLine(
      context.stdout,
      `### ${escapeMarkdown(policy.name)} (${policy.violations.length.toString(10)} violation${
        policy.violations.length === 1 ? '' : 's'
      })`,
    );
    for (const violation of policy.violations) {
      const severityLabel = violation.severity.toUpperCase();
      const pointerLink = formatMarkdownPointerLink(
        violation.pointer,
        violation.snapshot.provenance.uri,
      );
      const sourceLink = formatMarkdownSourceLink(violation.snapshot.provenance.uri);
      writeLine(context.stdout, `- **${severityLabel}** ${escapeMarkdown(violation.message)}`);
      writeLine(context.stdout, `  - Pointer: ${pointerLink}`);
      writeLine(context.stdout, `  - Source: ${sourceLink}`);
      writeLine(
        context.stdout,
        `  - Layer: ${inlineCodeMarkdown(violation.snapshot.provenance.layer)}`,
      );
      const contextSummary = formatContextSummaryMarkdown(violation.snapshot.context);
      if (contextSummary) {
        writeLine(context.stdout, `  - Context: ${contextSummary}`);
      }
      if (violation.details) {
        writeLine(
          context.stdout,
          `  - Details: ${inlineCodeMarkdown(JSON.stringify(violation.details))}`,
        );
      }
    }
    writeLine(context.stdout, '');
  }
}

function renderAuditHtml(
  result: AuditRunResult,
  status: 'ok' | 'warn' | 'error',
  context: AuditReporterContext,
): string {
  const summary = result.summary;
  const lines: string[] = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <title>dtifx Audit Report</title>',
    '  <style>',
    '    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }',
    '    body { margin: 2rem; line-height: 1.5; }',
    '    header { margin-bottom: 1.5rem; }',
    '    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 1rem; margin-bottom: 2rem; }',
    '    .summary-item { border: 1px solid currentColor; border-radius: 0.5rem; padding: 0.75rem 1rem; }',
    '    .summary-item .label { display: block; font-size: 0.85rem; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.08em; }',
    '    .summary-item .value { font-size: 1.5rem; font-weight: 600; }',
    '    .violations { display: flex; flex-direction: column; gap: 1.5rem; }',
    '    .policy { border: 1px solid currentColor; border-radius: 0.75rem; padding: 1.25rem; }',
    '    .policy h2 { margin-top: 0; }',
    '    .violation { border-top: 1px solid currentColor; padding-top: 1rem; margin-top: 1rem; }',
    '    .violation:first-of-type { border-top: none; margin-top: 0; padding-top: 0; }',
    '    .violation h3 { margin: 0 0 0.5rem; font-size: 1rem; }',
    '    .violation-error h3 { color: #c62828; }',
    '    .violation-warning h3 { color: #ef6c00; }',
    '    .violation-info h3 { color: #1565c0; }',
    '    dl { margin: 0; }',
    '    dt { font-weight: 600; }',
    '    dd { margin: 0 0 0.5rem 0; }',
    '    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem; }',
    '    .status-ok { color: #2e7d32; }',
    '    .status-warn { color: #ef6c00; }',
    '    .status-error { color: #c62828; }',
  ];
  append(
    lines,
    '  </style>',
    '</head>',
    '<body>',
    '  <header>',
    '    <h1>dtifx Audit Report</h1>',
    `    <p class="status-${status}">Status: ${escapeHtml(status.toUpperCase())}</p>`,
    '  </header>',
    '  <section class="summary">',
    `    <div class="summary-item"><span class="label">Policies evaluated</span><span class="value">${summary.policyCount.toString(
      10,
    )}</span></div>`,
    `    <div class="summary-item"><span class="label">Tokens evaluated</span><span class="value">${summary.tokenCount.toString(
      10,
    )}</span></div>`,
    `    <div class="summary-item"><span class="label">Violations</span><span class="value">${summary.violationCount.toString(
      10,
    )}</span><p>Errors: ${summary.severity.error.toString(10)} · Warnings: ${summary.severity.warning.toString(10)} · Info: ${summary.severity.info.toString(10)}</p></div>`,
  );
  if (context.includeTimings) {
    append(
      lines,
      `    <div class="summary-item"><span class="label">Build duration</span><span class="value">${escapeHtml(
        formatDurationMs(result.timings.totalMs),
      )}</span></div>`,
      `    <div class="summary-item"><span class="label">Audit duration</span><span class="value">${escapeHtml(
        formatDurationMs(result.timings.auditMs),
      )}</span></div>`,
      `    <div class="summary-item"><span class="label">Total duration</span><span class="value">${escapeHtml(
        formatDurationMs(result.timings.totalWithAuditMs),
      )}</span></div>`,
    );
  }
  for (const item of createRunContextItems(result.metadata?.runContext)) {
    append(
      lines,
      `    <div class="summary-item"><span class="label">${escapeHtml(item.label)}</span><span class="value">${escapeHtml(item.value)}</span></div>`,
    );
  }
  append(lines, '  </section>');

  if (summary.violationCount === 0) {
    append(
      lines,
      '  <section class="violations">',
      '    <p class="status-ok">No policy violations detected.</p>',
      '  </section>',
    );
  } else {
    append(lines, '  <section class="violations">');
    for (const policy of result.policies) {
      if (policy.violations.length === 0) {
        continue;
      }
      append(
        lines,
        '    <article class="policy">',
        `      <h2>${escapeHtml(policy.name)} (${policy.violations.length.toString(10)} violation${
          policy.violations.length === 1 ? '' : 's'
        })</h2>`,
      );
      for (const violation of policy.violations) {
        const severityClass = `violation-${violation.severity}`;
        const pointerHref = formatHtmlPointerHref(
          violation.pointer,
          violation.snapshot.provenance.uri,
        );
        const pointerText = escapeHtml(violation.pointer);
        const sourceHref = escapeHtml(violation.snapshot.provenance.uri);
        append(
          lines,
          `      <div class="violation ${severityClass}">`,
          `        <h3>${escapeHtml(violation.message)}</h3>`,
          '        <dl>',
          `          <dt>Pointer</dt><dd><a href="${pointerHref}">${pointerText}</a></dd>`,
          `          <dt>Source</dt><dd><a href="${sourceHref}">${sourceHref}</a></dd>`,
          `          <dt>Layer</dt><dd><code>${escapeHtml(
            violation.snapshot.provenance.layer,
          )}</code></dd>`,
        );
        const contextSummary = formatContextSummaryHtml(violation.snapshot.context, context.cwd);
        if (contextSummary) {
          append(lines, `          <dt>Context</dt><dd>${contextSummary}</dd>`);
        }
        if (violation.details) {
          append(
            lines,
            `          <dt>Details</dt><dd><code>${escapeHtml(
              JSON.stringify(violation.details),
            )}</code></dd>`,
          );
        }
        append(lines, '        </dl>', '      </div>');
      }
      append(lines, '    </article>');
    }
    append(lines, '  </section>');
  }

  append(lines, '</body>', '</html>');
  return lines.join(NEWLINE);
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

function createRunContextItems(
  context: RunContext | undefined,
): readonly { label: string; value: string }[] {
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

function formatMarkdownPointerLink(pointer: string, uri: string): string {
  const pointerCode = '`' + escapeMarkdown(pointer) + '`';
  return `[${pointerCode}](${escapeMarkdown(uri)}${escapeMarkdown(pointer)})`;
}

function formatMarkdownSourceLink(uri: string): string {
  return `[${escapeMarkdown(uri)}](${escapeMarkdown(uri)})`;
}

function inlineCodeMarkdown(value: string): string {
  return '`' + escapeMarkdown(value) + '`';
}

function formatContextSummaryMarkdown(
  context: PolicyExecutionResult['violations'][number]['snapshot']['context'],
): string | undefined {
  if (!context || Object.keys(context).length === 0) {
    return undefined;
  }
  const entries = Object.entries(context)
    .map(([key, value]) => `\`${escapeMarkdown(key)}\`: ${inlineCodeMarkdown(String(value))}`)
    .join(', ');
  return entries;
}

function formatHtmlPointerHref(pointer: string, uri: string): string {
  try {
    const url = new URL(uri);
    url.hash = pointer;
    return url.toString();
  } catch {
    return `${uri}${pointer}`;
  }
}

function formatContextSummaryHtml(
  context: PolicyExecutionResult['violations'][number]['snapshot']['context'],
  cwd: string,
): string | undefined {
  if (!context || Object.keys(context).length === 0) {
    return undefined;
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(context)) {
    const label = escapeHtml(key);
    const text = formatContextValueHtml(value, cwd);
    parts.push(`<code>${label}</code>: ${text}`);
  }
  return parts.join(', ');
}

function formatContextValueHtml(value: unknown, cwd: string): string {
  if (typeof value === 'string') {
    return escapeHtml(value);
  }
  if (Array.isArray(value)) {
    return escapeHtml(JSON.stringify(value));
  }
  if (typeof value === 'object' && value !== null) {
    if (
      'absolute' in (value as { absolute?: string }) &&
      typeof (value as { absolute?: string }).absolute === 'string'
    ) {
      const absolute = (value as { absolute: string }).absolute;
      const relative = absolute.startsWith(cwd) ? absolute.slice(cwd.length + 1) : absolute;
      return `<code>${escapeHtml(relative)}</code>`;
    }
    return escapeHtml(JSON.stringify(value));
  }
  return escapeHtml(String(value));
}

function serialisePolicyResult(policy: PolicyExecutionResult): {
  readonly name: string;
  readonly violationCount: number;
  readonly violations: readonly ReturnType<typeof serialiseViolation>[];
} {
  return {
    name: policy.name,
    violationCount: policy.violations.length,
    violations: policy.violations.map((violation) => serialiseViolation(violation)),
  };
}

function serialiseViolation(violation: PolicyExecutionResult['violations'][number]): {
  readonly pointer: string;
  readonly severity: string;
  readonly message: string;
  readonly tokenType?: string;
  readonly provenance: typeof violation.snapshot.provenance;
  readonly context: typeof violation.snapshot.context;
  readonly details?: Readonly<Record<string, unknown>>;
} {
  return {
    pointer: violation.pointer,
    severity: violation.severity,
    message: violation.message,
    ...(violation.snapshot.token.type === undefined
      ? {}
      : { tokenType: violation.snapshot.token.type }),
    provenance: violation.snapshot.provenance,
    context: violation.snapshot.context,
    ...(violation.details ? { details: violation.details } : {}),
  };
}

function auditLogData(result: AuditRunResult): Readonly<Record<string, unknown>> {
  return {
    summary: {
      policyCount: result.summary.policyCount,
      violationCount: result.summary.violationCount,
      severity: result.summary.severity,
      tokenCount: result.summary.tokenCount,
    },
    timings: result.timings,
    ...(result.metadata?.runContext ? { runContext: result.metadata.runContext } : {}),
  } satisfies Readonly<Record<string, unknown>>;
}

function auditStatus(summary: AuditSummary): 'ok' | 'warn' | 'error' {
  if (summary.severity.error > 0) {
    return 'error';
  }
  if (summary.violationCount > 0) {
    return 'warn';
  }
  return 'ok';
}

function logLevelForStatus(status: 'ok' | 'warn' | 'error'): 'info' | 'warn' | 'error' {
  if (status === 'error') {
    return 'error';
  }
  if (status === 'warn') {
    return 'warn';
  }
  return 'info';
}

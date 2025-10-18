import { createRequire } from 'node:module';
import { env, stdout } from 'node:process';

import cliTruncate from 'cli-truncate';
import isUnicodeSupported from 'is-unicode-supported';
import stripAnsi from 'strip-ansi';
import { createSupportsHyperlinks } from 'supports-hyperlinks';
import wrapAnsi from 'wrap-ansi';

import type {
  TokenAddition,
  TokenDiffResult,
  TokenChangeKind,
  TokenModification,
  TokenRemoval,
  TokenRename,
  VersionBump,
} from '../../diff.js';
import { DiagnosticCategories, DiagnosticScopes } from '../../application/ports/diagnostics.js';
import type { ReportRendererContext } from '../../application/ports/reporting.js';
import type { TokenPointer, TokenSnapshot } from '../../token-set.js';
import { append } from '../../utils/append.js';
import type { TokenColor } from '../formatting.js';
import {
  createReportDescriptor,
  type ReportHotspot,
  type ReportRiskItem,
  type ReportSummaryView,
  type ReportGroupSection,
  type ReportTypeOperations,
  type ReportTypeSection,
} from '../report-descriptor.js';
import {
  describeAddition,
  describeModification,
  describeRemoval,
  describeRename,
  type EntryGuidance,
} from '../change-guidance.js';
import { createOperationSummaryDescriptor } from '../layout/operations.js';
import {
  describeRunComparison,
  formatRunDuration,
  formatRunTimestamp,
  type ReportRunContext,
} from '../run-context.js';
import {
  formatAlpha,
  formatSignedDimension,
  formatSignedPercentage,
  formatMaybeUndefined,
  formatTokenValueForSummary,
  formatValue,
  getDimensionComparison,
  getTokenColor,
  getTypographyPreview,
} from '../formatting.js';
import { emitRendererDiagnostic } from '../diagnostics.js';

export interface CliFormatterOptions {
  readonly color?: boolean;
  readonly mode?: 'full' | 'summary' | 'condensed' | 'detailed';
  readonly width?: number;
  readonly verbose?: boolean;
  readonly showWhy?: boolean;
  readonly diffContext?: number;
  readonly topRisks?: number;
  readonly links?: boolean;
  readonly runContext?: ReportRunContext;
  readonly unicode?: boolean;
}

interface CliRenderRuntime {
  readonly useColor: boolean;
  readonly includeWhy: boolean;
  readonly diffContext: number;
  readonly pointerLimit: number;
  readonly enableLinks: boolean;
  readonly useUnicode: boolean;
}

const RESET = '\u001B[0m';
const COLORS: Record<string, string> = {
  green: '\u001B[32m',
  red: '\u001B[31m',
  yellow: '\u001B[33m',
  cyan: '\u001B[36m',
  bold: '\u001B[1m',
  dim: '\u001B[2m',
};

type Color = keyof typeof COLORS;

const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require('../../../package.json') as {
  readonly version?: string;
};

const REPORTER_VERSION = PACKAGE_VERSION ?? '0.0.0';
const HEADER_TITLE = 'DTIFX DIFF REPORT';
const DEFAULT_REPORT_WIDTH = 100;
const MINIMUM_REPORT_WIDTH = 60;
const DEFAULT_TOP_RISKS_LIMIT = 10;
const DEFAULT_DIFF_CONTEXT = 3;
const MAX_TOP_RISKS = 50;
const HOTSPOT_LIMIT = 4;
const CLI_DIAGNOSTIC_SCOPE = DiagnosticScopes.reportingCli;
const CLI_DIAGNOSTIC_CATEGORY = DiagnosticCategories.reportingCli;

/**
 * Renders a diff result for interactive CLI output with optional colour and hyperlink support.
 *
 * @param diff - The diff result to render.
 * @param options - Renderer options including verbosity and output mode.
 * @param context - The renderer context supplying runtime configuration.
 * @returns The formatted CLI report as a string.
 */
export function formatDiffAsCli(
  diff: TokenDiffResult,
  options: CliFormatterOptions = {},
  context?: ReportRendererContext,
): string {
  const useColor = options.color ?? false;
  const verbose = options.verbose ?? false;
  const mode = resolveCliMode(options.mode, verbose ? 'full' : 'condensed', context);
  const includeWhy = mode === 'condensed' ? false : (options.showWhy ?? true);
  const diffContext = normalizeDiffContext(options.diffContext, context);
  const pointerLimit = mode === 'full' || verbose ? Number.POSITIVE_INFINITY : diffContext;
  const hyperlinkEnabled = createSupportsHyperlinks(stdout);
  const hyperlinkReason = hyperlinkEnabled ? undefined : inferHyperlinkDisableReason();
  const enableLinks = options.links ?? hyperlinkEnabled;

  if (options.links === undefined && !hyperlinkEnabled) {
    emitRendererDiagnostic(
      context,
      {
        level: 'info',
        code: 'CLI_LINKS_DISABLED',
        message: describeHyperlinkSupport(hyperlinkEnabled, hyperlinkReason),
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
  } else if (options.links === true && !hyperlinkEnabled) {
    emitRendererDiagnostic(
      context,
      {
        level: 'warn',
        code: 'CLI_LINKS_FORCED',
        message: `${describeHyperlinkSupport(hyperlinkEnabled, hyperlinkReason)} Output will still include hyperlink escape sequences.`,
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
  }

  const unicodeEnabled = isUnicodeSupported();
  const unicodeReason = unicodeEnabled ? undefined : inferUnicodeDisableReason();
  const useUnicode = options.unicode ?? unicodeEnabled;

  if (options.unicode === undefined && !unicodeEnabled) {
    emitRendererDiagnostic(
      context,
      {
        level: 'info',
        code: 'CLI_UNICODE_DISABLED',
        message: describeUnicodeSupport(unicodeEnabled, unicodeReason),
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
  } else if (options.unicode === true && !unicodeEnabled) {
    emitRendererDiagnostic(
      context,
      {
        level: 'warn',
        code: 'CLI_UNICODE_FORCED',
        message: `${describeUnicodeSupport(unicodeEnabled, unicodeReason)} Unicode output was explicitly requested and may render incorrectly.`,
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
  }

  const topRiskLimit = normalizeTopRiskLimit(options.topRisks, context);
  const runContext = options.runContext;

  const width = resolveReportWidth(options.width, context);
  const runtime: CliRenderRuntime = {
    useColor,
    includeWhy,
    diffContext,
    pointerLimit,
    enableLinks,
    useUnicode,
  };
  const lines: string[] = [];
  const report = createReportDescriptor(diff, { topRiskLimit });

  append(
    lines,
    renderHeader(diff, runtime, width, runContext),
    renderDivider(width, runtime),
    ...renderExecutiveSummary(report.summary, runtime),
  );

  if (mode !== 'summary') {
    const riskLines = renderTopRisks(report.topRisks, mode, width, runtime);

    if (riskLines.length > 0) {
      append(lines, '', ...riskLines);
    }

    const detailLines = renderChangeSections(report.typeSections, mode, width, runtime);

    if (detailLines.length > 0) {
      append(lines, '', ...detailLines);
    }
  }

  const footers = renderFooters();

  if (footers.length > 0) {
    append(lines, '', ...footers);
  }

  return lines.join('\n');
}

function resolveCliMode(
  requested: CliFormatterOptions['mode'] | undefined,
  defaultMode: 'full' | 'condensed',
  context: ReportRendererContext | undefined,
): 'full' | 'summary' | 'condensed' {
  if (requested === undefined) {
    return defaultMode;
  }

  if (requested === 'full' || requested === 'summary' || requested === 'condensed') {
    return requested;
  }

  if (requested === 'detailed') {
    emitRendererDiagnostic(
      context,
      {
        level: 'info',
        code: 'CLI_MODE_DETAILED_ALIAS',
        message: 'Detailed mode is treated as an alias for the full report.',
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
    return 'full';
  }

  emitRendererDiagnostic(
    context,
    {
      level: 'warn',
      code: 'CLI_MODE_UNRECOGNIZED',
      message: `Unrecognized mode "${requested}"; defaulting to ${defaultMode}.`,
    },
    CLI_DIAGNOSTIC_SCOPE,
    CLI_DIAGNOSTIC_CATEGORY,
  );

  return defaultMode;
}

function clampReportWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) {
    return DEFAULT_REPORT_WIDTH;
  }

  const rounded = Math.floor(width);
  return Math.max(MINIMUM_REPORT_WIDTH, rounded);
}

function resolveReportWidth(
  explicitWidth: number | undefined,
  context: ReportRendererContext | undefined,
): number {
  if (typeof explicitWidth === 'number') {
    if (!Number.isFinite(explicitWidth) || explicitWidth <= 0) {
      emitRendererDiagnostic(
        context,
        {
          level: 'warn',
          code: 'CLI_WIDTH_INVALID',
          message: `Ignoring report width "${String(explicitWidth)}"; using default width of ${DEFAULT_REPORT_WIDTH}.`,
        },
        CLI_DIAGNOSTIC_SCOPE,
        CLI_DIAGNOSTIC_CATEGORY,
      );
      return DEFAULT_REPORT_WIDTH;
    }

    const rounded = Math.floor(explicitWidth);
    const clamped = Math.max(MINIMUM_REPORT_WIDTH, rounded);

    if (rounded !== explicitWidth) {
      emitRendererDiagnostic(
        context,
        {
          level: 'info',
          code: 'CLI_WIDTH_ROUNDED',
          message: `Rounded report width from ${explicitWidth} to ${rounded}.`,
        },
        CLI_DIAGNOSTIC_SCOPE,
        CLI_DIAGNOSTIC_CATEGORY,
      );
    }

    if (clamped !== rounded) {
      const reason = rounded < MINIMUM_REPORT_WIDTH ? 'minimum of' : 'default maximum of';
      const target = rounded < MINIMUM_REPORT_WIDTH ? MINIMUM_REPORT_WIDTH : DEFAULT_REPORT_WIDTH;
      emitRendererDiagnostic(
        context,
        {
          level: 'warn',
          code: 'CLI_WIDTH_CLAMPED',
          message: `Clamped report width to the ${reason} ${target}.`,
        },
        CLI_DIAGNOSTIC_SCOPE,
        CLI_DIAGNOSTIC_CATEGORY,
      );
    }

    return clamped;
  }

  const detectedWidth =
    typeof stdout.columns === 'number' && stdout.columns > 0 ? stdout.columns : undefined;

  if (detectedWidth === undefined) {
    return DEFAULT_REPORT_WIDTH;
  }

  if (detectedWidth >= DEFAULT_REPORT_WIDTH) {
    return DEFAULT_REPORT_WIDTH;
  }

  const clamped = clampReportWidth(detectedWidth);

  emitRendererDiagnostic(
    context,
    {
      level: 'info',
      code: 'CLI_WIDTH_DETECTED',
      message: `Detected terminal width of ${detectedWidth}; rendering report at ${clamped} columns.`,
    },
    CLI_DIAGNOSTIC_SCOPE,
    CLI_DIAGNOSTIC_CATEGORY,
  );

  return clamped;
}

function normalizeDiffContext(
  value: number | undefined,
  context: ReportRendererContext | undefined,
): number {
  if (value === undefined) {
    return DEFAULT_DIFF_CONTEXT;
  }

  if (!Number.isFinite(value)) {
    emitRendererDiagnostic(
      context,
      {
        level: 'warn',
        code: 'CLI_DIFF_CONTEXT_INVALID',
        message: `Ignoring diff context "${String(value)}"; using default of ${DEFAULT_DIFF_CONTEXT}.`,
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
    return DEFAULT_DIFF_CONTEXT;
  }

  const normalized = Math.floor(value);

  if (normalized < 0) {
    emitRendererDiagnostic(
      context,
      {
        level: 'warn',
        code: 'CLI_DIFF_CONTEXT_NEGATIVE',
        message: 'Diff context cannot be negative; using 0.',
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
    return 0;
  }

  if (normalized !== value) {
    emitRendererDiagnostic(
      context,
      {
        level: 'info',
        code: 'CLI_DIFF_CONTEXT_ROUNDED',
        message: `Rounded diff context from ${value} to ${normalized}.`,
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
  }

  return normalized;
}

function normalizeTopRiskLimit(
  value: number | undefined,
  context: ReportRendererContext | undefined,
): number {
  if (value === undefined) {
    return DEFAULT_TOP_RISKS_LIMIT;
  }

  if (!Number.isFinite(value)) {
    emitRendererDiagnostic(
      context,
      {
        level: 'warn',
        code: 'CLI_TOP_RISKS_INVALID',
        message: `Ignoring top risk limit "${String(value)}"; using default of ${DEFAULT_TOP_RISKS_LIMIT}.`,
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
    return DEFAULT_TOP_RISKS_LIMIT;
  }

  const normalized = Math.floor(value);

  if (normalized <= 0) {
    emitRendererDiagnostic(
      context,
      {
        level: 'warn',
        code: 'CLI_TOP_RISKS_DISABLED',
        message: 'Top risk output disabled because the limit is zero or negative.',
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
    return 0;
  }

  if (normalized > MAX_TOP_RISKS) {
    emitRendererDiagnostic(
      context,
      {
        level: 'info',
        code: 'CLI_TOP_RISKS_CLAMPED',
        message: `Clamped top risk limit to ${MAX_TOP_RISKS}.`,
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
    return MAX_TOP_RISKS;
  }

  if (normalized !== value) {
    emitRendererDiagnostic(
      context,
      {
        level: 'info',
        code: 'CLI_TOP_RISKS_ROUNDED',
        message: `Rounded top risk limit from ${value} to ${normalized}.`,
      },
      CLI_DIAGNOSTIC_SCOPE,
      CLI_DIAGNOSTIC_CATEGORY,
    );
  }

  return normalized;
}

type UnicodeSupportReason = 'linux-terminal' | 'posix-locale' | 'unknown';

function describeUnicodeSupport(
  enabled: boolean,
  reason: UnicodeSupportReason | undefined,
): string {
  if (enabled) {
    return 'Unicode output enabled.';
  }

  if (reason === 'linux-terminal') {
    return 'Unicode output disabled because the terminal reports itself as the Linux console.';
  }

  if (reason === 'posix-locale') {
    return 'Unicode output disabled because the process locale is POSIX/C.';
  }

  return 'Unicode output disabled because the current terminal does not report Unicode support.';
}

function inferUnicodeDisableReason(): UnicodeSupportReason {
  const term = (env['TERM'] ?? '').toLowerCase();

  if (term === 'linux') {
    return 'linux-terminal';
  }

  const locale = env['LC_ALL'] ?? env['LC_CTYPE'] ?? env['LANG'] ?? env['LANGUAGE'] ?? '';
  const normalizedLocale = locale.toLowerCase();

  if (locale === 'C' || normalizedLocale === 'posix') {
    return 'posix-locale';
  }

  return 'unknown';
}

type HyperlinkSupportReason = 'not-tty' | 'ci' | 'unsupported';

function describeHyperlinkSupport(
  enabled: boolean,
  reason: HyperlinkSupportReason | undefined,
): string {
  if (enabled) {
    return 'Hyperlink output enabled.';
  }

  if (reason === 'not-tty') {
    return 'Hyperlink output disabled because stdout is not a TTY device.';
  }

  if (reason === 'ci') {
    return 'Hyperlink output disabled in continuous integration environments.';
  }

  return 'Hyperlink output disabled because the current terminal does not report hyperlink support.';
}

function inferHyperlinkDisableReason(): HyperlinkSupportReason {
  if (!stdout.isTTY) {
    return 'not-tty';
  }

  if (isContinuousIntegration()) {
    return 'ci';
  }

  return 'unsupported';
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return normalized !== 'false' && normalized !== '0';
}

function isContinuousIntegration(): boolean {
  return isTruthyEnv(env['CI']) || isTruthyEnv(env['CONTINUOUS_INTEGRATION']);
}

/**
 * Determines if the CLI renderer should emit OSC-8 hyperlinks.
 *
 * @returns True when hyperlinks are supported.
 */
export function supportsCliHyperlinks(): boolean {
  return createSupportsHyperlinks(stdout);
}

function selectSummarySeparator(runtime: CliRenderRuntime): string {
  return runtime.useUnicode ? ' · ' : ' | ';
}

function formatArrow(runtime: CliRenderRuntime): string {
  return runtime.useUnicode ? '→' : '->';
}

function formatRenameGlyph(runtime: CliRenderRuntime): string {
  return runtime.useUnicode ? '↪' : '->';
}

function formatDash(runtime: CliRenderRuntime): string {
  return runtime.useUnicode ? '—' : '-';
}

function formatVerticalDivider(runtime: CliRenderRuntime): string {
  return runtime.useUnicode ? '│' : '|';
}

function formatHorizontalDivider(runtime: CliRenderRuntime): string {
  return runtime.useUnicode ? '─' : '-';
}

function formatBullet(runtime: CliRenderRuntime): string {
  return runtime.useUnicode ? '•' : '*';
}

function formatSubBullet(runtime: CliRenderRuntime): string {
  return runtime.useUnicode ? '◦' : '-';
}

function formatEllipsis(runtime: CliRenderRuntime): string {
  return runtime.useUnicode ? '…' : '...';
}

function adaptArrows(value: string | undefined, useUnicode: boolean): string | undefined {
  if (!value) {
    return value;
  }

  if (useUnicode) {
    return value;
  }

  return value.replaceAll('→', '->');
}

function renderHeader(
  diff: TokenDiffResult,
  runtime: CliRenderRuntime,
  width: number,
  context: ReportRunContext | undefined,
): string {
  const { useColor, useUnicode } = runtime;
  const title = `${colorize(HEADER_TITLE, 'bold', useColor)} v${REPORTER_VERSION}`;
  const bump = `recommended bump: ${formatVersionBump(diff.summary.recommendedBump, useColor)}`;
  const separator = selectSummarySeparator(runtime);
  const impact = `impact ${formatSummaryCount(
    diff.summary.breaking,
    'breaking',
    useColor,
  )}${separator}${formatSummaryCount(diff.summary.nonBreaking, 'non-breaking', useColor)}`;
  const arrow = formatArrow(runtime);
  const totals = `tokens ${String(diff.summary.totalPrevious)} ${arrow} ${String(
    diff.summary.totalNext,
  )}`;
  const comparison = adaptArrows(describeRunComparison(context), useUnicode);
  const startedAt = formatRunTimestamp(context);
  const duration = formatRunDuration(context);
  const segments = [title];

  const optionalSegments = [
    comparison ? `compare ${comparison}` : undefined,
    startedAt ? `started ${startedAt}` : undefined,
    duration ? `duration ${duration}` : undefined,
  ].filter((segment): segment is string => segment !== undefined);

  append(segments, ...optionalSegments, bump, impact, totals);
  return joinHeaderSegments(segments, width, runtime);
}

function joinHeaderSegments(
  segments: readonly string[],
  width: number,
  runtime: CliRenderRuntime,
): string {
  const visibleWidth = clampReportWidth(width);
  const cleanedSegments = segments.filter((segment) => segment.length > 0);

  if (cleanedSegments.length === 0) {
    return '';
  }

  const lines: string[] = [];
  let currentLine = '';

  const divider = ` ${formatVerticalDivider(runtime)} `;

  for (const segment of cleanedSegments) {
    const wrappedSegments = wrapCliText(segment, visibleWidth);

    for (const wrapped of wrappedSegments) {
      if (currentLine.length === 0) {
        currentLine = wrapped;
        continue;
      }

      const prospective = `${currentLine}${divider}${wrapped}`;

      if (getVisibleLength(prospective) <= visibleWidth) {
        currentLine = prospective;
        continue;
      }

      append(lines, currentLine);
      currentLine = wrapped;
    }
  }

  if (currentLine.length > 0) {
    append(lines, currentLine);
  }

  return lines.join('\n');
}

const OSC_HYPERLINK_OPEN = /\u001B]8;;[^\u0007]*\u0007/g;
const OSC_HYPERLINK_CLOSE = /\u001B]8;;\u0007/g;

function getVisibleLength(text: string): number {
  const withoutAnsi = stripAnsi(text).replaceAll(OSC_HYPERLINK_OPEN, '');
  return withoutAnsi.replaceAll(OSC_HYPERLINK_CLOSE, '').length;
}

function wrapCliText(text: string, width: number): readonly string[] {
  const normalizedWidth = Math.max(1, Math.floor(width));
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return [''];
  }

  const wrapped = wrapAnsi(trimmed, normalizedWidth, { trim: true });
  return wrapped.split('\n');
}

function wrapCliTextWithIndent(
  text: string,
  width: number,
  indent: string,
  options?: { readonly includeFirstLineIndent?: boolean },
): readonly string[] {
  const normalizedWidth = clampReportWidth(width);
  const includeFirstLineIndent = options?.includeFirstLineIndent ?? false;
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return [''];
  }

  const availableWidth = Math.max(1, normalizedWidth - indent.length);
  const wrapped = wrapAnsi(trimmed, availableWidth, { trim: true });
  const lines = wrapped.split('\n');

  return lines.map((line: string, index: number) => {
    const needsIndent = includeFirstLineIndent || index > 0;
    return needsIndent ? `${indent}${line}` : line;
  });
}

function truncateCliText(text: string, width: number, runtime: CliRenderRuntime): string {
  if (!Number.isFinite(width) || width <= 0) {
    return text;
  }

  const normalizedWidth = Math.max(1, Math.floor(width));

  return cliTruncate(text, normalizedWidth, {
    space: true,
    truncationCharacter: formatEllipsis(runtime),
  });
}

function formatTokenPathForWidth(path: string, width: number, runtime: CliRenderRuntime): string {
  const normalizedWidth = clampReportWidth(width);
  const arrow = formatArrow(runtime);
  const parts = path.split(' → ');

  if (parts.length > 1) {
    return parts
      .map((part) => formatSingleTokenPath(part, normalizedWidth, runtime))
      .join(` ${arrow} `);
  }

  return formatSingleTokenPath(path, normalizedWidth, runtime);
}

function formatSingleTokenPath(path: string, width: number, runtime: CliRenderRuntime): string {
  const trimmed = path.trim();

  if (!trimmed.startsWith('#/')) {
    return trimmed;
  }

  const segments = trimmed.slice(2).split('/');
  const maxSegments = getPointerSegmentBudget(width);

  if (segments.length <= maxSegments) {
    return trimmed;
  }

  const tail = segments.slice(-maxSegments).join('/');
  const ellipsis = formatEllipsis(runtime);
  return `#/${ellipsis}/${tail}`;
}

function getPointerSegmentBudget(width: number): number {
  if (width >= 100) {
    return 4;
  }

  if (width >= 80) {
    return 3;
  }

  return 2;
}

function renderDivider(width: number, runtime: CliRenderRuntime): string {
  const safeWidth = clampReportWidth(width);
  const glyph = formatHorizontalDivider(runtime);
  return glyph.repeat(safeWidth);
}

function renderExecutiveSummary(
  summary: ReportSummaryView,
  runtime: CliRenderRuntime,
): readonly string[] {
  const { useColor } = runtime;
  const lines = [colorize('Executive summary', 'bold', useColor)];
  const severityLine = joinSummaryParts(
    [
      formatSummaryCount(summary.impact.breaking, 'breaking', useColor),
      formatSummaryCount(summary.impact.nonBreaking, 'non-breaking', useColor),
    ],
    runtime,
  );
  const changeLine = joinSummaryParts(
    [
      formatSummaryCount(summary.operations.added, 'added', useColor),
      formatSummaryCount(summary.operations.changed, 'changed', useColor),
      formatSummaryCount(summary.operations.removed, 'removed', useColor),
      formatSummaryCount(summary.operations.renamed, 'renamed', useColor),
    ],
    runtime,
  );
  const arrow = formatArrow(runtime);

  append(
    lines,
    `  Impact: ${severityLine}`,
    `  Changes: ${changeLine}`,
    `  Tokens analysed: ${String(summary.totals.previous)} previous ${arrow} ${String(
      summary.totals.next,
    )} next`,
    `  Change mix: ${[
      formatValueChangeCount(summary.changeMix.valueChanged, useColor),
      formatMetadataChangeCount(summary.changeMix.metadataChanged, useColor),
    ].join(', ')}`,
  );

  const typeHotspots = formatHotspotSummaries(summary.typeHotspots, useColor);

  if (typeHotspots.length > 0) {
    append(lines, `  Type hotspots: ${typeHotspots.join('; ')}`);
  }

  const groupHotspots = formatHotspotSummaries(summary.groupHotspots, useColor);

  if (groupHotspots.length > 0) {
    append(lines, `  Group hotspots: ${groupHotspots.join('; ')}`);
  }

  return lines;
}

function joinSummaryParts(parts: readonly string[], runtime: CliRenderRuntime): string {
  const separator = selectSummarySeparator(runtime);
  return parts.filter((part) => part.length > 0).join(separator);
}

function formatHotspotSummaries(
  hotspots: readonly ReportHotspot[],
  useColor: boolean,
): readonly string[] {
  return hotspots.slice(0, HOTSPOT_LIMIT).map((hotspot) => formatHotspotLabel(hotspot, useColor));
}

function formatHotspotLabel(hotspot: ReportHotspot, useColor: boolean): string {
  const changeText = formatChangeTotal(hotspot.changes, useColor);
  const impactParts = [
    hotspot.breaking > 0 ? formatSummaryCount(hotspot.breaking, 'breaking', useColor) : undefined,
    hotspot.breaking === 0 && hotspot.nonBreaking > 0
      ? formatSummaryCount(hotspot.nonBreaking, 'non-breaking', useColor)
      : undefined,
  ].filter((part): part is string => part !== undefined);

  const impactText = impactParts.length > 0 ? `, ${impactParts.join(', ')}` : '';

  return `${hotspot.label} (${changeText}${impactText})`;
}

function formatChangeTotal(count: number, useColor: boolean): string {
  const label = count === 1 ? 'change' : 'changes';
  return formatCustomSummaryCount(count, label, 'yellow', useColor);
}

type RiskEntryKind = TokenChangeKind;

function renderTopRisks(
  risks: readonly ReportRiskItem[],
  mode: 'condensed' | 'full',
  width: number,
  runtime: CliRenderRuntime,
): readonly string[] {
  if (risks.length === 0) {
    return [];
  }

  const lines: string[] = [
    colorize(`Top risks (${String(risks.length)})`, 'bold', runtime.useColor),
  ];

  for (const entry of risks) {
    const typeLabel = colorize(
      sanitizeCliString(entry.typeLabel, runtime),
      'cyan',
      runtime.useColor,
    );
    const labelPath = sanitizeCliString(
      formatTokenPathForWidth(entry.labelPath, width, runtime),
      runtime,
    );
    const title = sanitizeCliString(entry.title, runtime);
    const headline = `${formatSeverityGlyph(entry.impact, runtime)} ${formatSeverityLabel(
      entry.impact,
      runtime.useColor,
    )} ${formatOperationGlyph(entry.kind)} ${typeLabel} ${labelPath} ${formatDash(
      runtime,
    )} ${title}`;
    const sanitizedHeadline = sanitizeCliString(headline.trim(), runtime);
    append(lines, ...wrapCliTextWithIndent(sanitizedHeadline, width, '    '));

    if (mode === 'condensed') {
      continue;
    }

    if (runtime.includeWhy) {
      const why = sanitizeCliString(entry.why, runtime);
      append(
        lines,
        ...wrapCliTextWithIndent(`Why: ${why}`, width, '    ', {
          includeFirstLineIndent: true,
        }),
      );
    }
    const impactSummary = sanitizeCliString(entry.impactSummary, runtime);
    append(
      lines,
      ...wrapCliTextWithIndent(`Impact: ${impactSummary}`, width, '    ', {
        includeFirstLineIndent: true,
      }),
    );
    const nextStep = sanitizeCliString(entry.nextStep, runtime);
    append(
      lines,
      ...wrapCliTextWithIndent(`Next: ${nextStep}`, width, '    ', {
        includeFirstLineIndent: true,
      }),
    );

    append(lines, '');
  }

  if (mode !== 'condensed') {
    while (lines.length > 0 && lines.at(-1) === '') {
      lines.pop();
    }
  }

  return lines;
}

const OPERATION_GLYPHS: Record<RiskEntryKind, string> = {
  added: '+',
  removed: '-',
  changed: '~',
  renamed: '>',
};

const SEVERITY_GLYPHS: Record<TokenAddition['impact'], string> = {
  breaking: '!',
  'non-breaking': '·',
};

function formatOperationGlyph(kind: RiskEntryKind): string {
  return OPERATION_GLYPHS[kind];
}

function formatSeverityGlyph(impact: TokenAddition['impact'], runtime: CliRenderRuntime): string {
  if (!runtime.useUnicode && impact === 'non-breaking') {
    return ':';
  }

  return SEVERITY_GLYPHS[impact];
}

function formatSeverityLabel(impact: TokenAddition['impact'], useColor: boolean): string {
  const label = impact === 'breaking' ? '[BREAKING]' : '[NON-BREAKING]';
  const color: Color = impact === 'breaking' ? 'red' : 'green';
  return colorize(label, color, useColor);
}

type TypeOperationKey = keyof ReportTypeSection['operations'];

const TYPE_OPERATION_ORDER: readonly TypeOperationKey[] = [
  'changed',
  'removed',
  'added',
  'renamed',
];

const TYPE_OPERATION_HEADING_COLORS: Record<TypeOperationKey, Color> = {
  added: 'green',
  removed: 'red',
  changed: 'yellow',
  renamed: 'cyan',
};

const TYPE_OPERATION_LABELS: Record<TypeOperationKey, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
  renamed: 'Renamed',
};

function renderChangeSections(
  sections: readonly ReportTypeSection[],
  mode: 'condensed' | 'full',
  width: number,
  runtime: CliRenderRuntime,
): readonly string[] {
  const relevantSections = sections.filter((section) => sectionHasEntries(section));

  if (relevantSections.length === 0) {
    return [];
  }

  const lines: string[] = [colorize('Grouped detail', 'bold', runtime.useColor), ''];
  let isFirstSection = true;

  for (const section of relevantSections) {
    if (!isFirstSection) {
      append(lines, '');
    }

    append(lines, ...renderTypeSection(section, mode, width, runtime));
    isFirstSection = false;
  }

  return lines;
}

function sectionHasEntries(section: ReportTypeSection): boolean {
  const { counts } = section;
  return counts.added > 0 || counts.changed > 0 || counts.removed > 0 || counts.renamed > 0;
}

function renderTypeSection(
  section: ReportTypeSection,
  mode: 'condensed' | 'full',
  width: number,
  runtime: CliRenderRuntime,
): readonly string[] {
  const lines: string[] = [];
  append(
    lines,
    colorize(`  ${formatTypeSectionHeading(section, runtime)}`, 'bold', runtime.useColor),
  );

  const groups = section.groups.filter((group) => groupHasEntries(group));

  if (groups.length > 0) {
    for (const group of groups) {
      append(lines, '');
      append(lines, ...renderGroupSection(group, mode, width, runtime));
    }

    return lines;
  }

  const fallback = renderOperationCollection(
    section.operations,
    mode,
    width,
    runtime,
    '    ',
    '      ',
  );

  if (fallback.length > 0) {
    append(lines, '');
    append(lines, ...fallback);
  }

  return lines;
}

function renderTypeOperation(
  key: TypeOperationKey,
  entries: readonly ReportTypeSection['operations'][TypeOperationKey][number][],
  mode: 'condensed' | 'full',
  width: number,
  runtime: CliRenderRuntime,
  headingIndent: string,
  bulletIndent: string,
): readonly string[] {
  const lines: string[] = [];
  const headingColor = TYPE_OPERATION_HEADING_COLORS[key];
  const headingLabel = `${TYPE_OPERATION_LABELS[key]} (${String(entries.length)})`;
  append(lines, colorize(`${headingIndent}${headingLabel}`, headingColor, runtime.useColor));

  switch (key) {
    case 'added': {
      append(
        lines,
        ...renderOperationEntries(
          entries as readonly TokenAddition[],
          mode,
          width,
          createAddedListOptions(width),
          bulletIndent,
          runtime,
        ),
      );
      break;
    }
    case 'removed': {
      append(
        lines,
        ...renderOperationEntries(
          entries as readonly TokenRemoval[],
          mode,
          width,
          createRemovedListOptions(width),
          bulletIndent,
          runtime,
        ),
      );
      break;
    }
    case 'renamed': {
      append(
        lines,
        ...renderOperationEntries(
          entries as readonly TokenRename[],
          mode,
          width,
          createRenamedListOptions(width),
          bulletIndent,
          runtime,
        ),
      );
      break;
    }
    case 'changed': {
      append(
        lines,
        ...renderModificationEntries(
          entries as readonly TokenModification[],
          mode,
          width,
          bulletIndent,
          runtime,
        ),
      );
      break;
    }
  }

  return lines;
}

function renderGroupSection(
  group: ReportGroupSection,
  mode: 'condensed' | 'full',
  width: number,
  runtime: CliRenderRuntime,
): readonly string[] {
  const lines: string[] = [];
  append(
    lines,
    colorize(`    ${formatGroupSectionHeading(group, runtime)}`, 'bold', runtime.useColor),
  );

  const blocks = renderOperationCollection(
    group.operations,
    mode,
    width,
    runtime,
    '      ',
    '        ',
  );

  if (blocks.length > 0) {
    append(lines, ...blocks);
  }

  return lines;
}

function renderOperationCollection(
  operations: ReportTypeOperations,
  mode: 'condensed' | 'full',
  width: number,
  runtime: CliRenderRuntime,
  headingIndent: string,
  bulletIndent: string,
): readonly string[] {
  const lines: string[] = [];
  let hasRenderedOperation = false;

  for (const key of TYPE_OPERATION_ORDER) {
    const entries = operations[key];

    if (entries.length === 0) {
      continue;
    }

    if (hasRenderedOperation) {
      append(lines, '');
    }

    append(
      lines,
      ...renderTypeOperation(key, entries, mode, width, runtime, headingIndent, bulletIndent),
    );
    hasRenderedOperation = true;
  }

  return lines;
}

function formatTypeSectionHeading(section: ReportTypeSection, runtime: CliRenderRuntime): string {
  const summary = createOperationSummaryDescriptor(section.counts);
  const details = summary.parts.length > 0 ? `: ${joinSummaryParts(summary.parts, runtime)}` : '';
  return `${section.label} (${summary.total.toString()} ${summary.changeLabel}${details})`;
}

function formatGroupSectionHeading(section: ReportGroupSection, runtime: CliRenderRuntime): string {
  const summary = createOperationSummaryDescriptor(section.counts);
  const details = summary.parts.length > 0 ? `: ${joinSummaryParts(summary.parts, runtime)}` : '';
  return `${formatGroupLabel(section.label)} (${summary.total.toString()} ${summary.changeLabel}${details})`;
}

function formatGroupLabel(label: string): string {
  if (label === 'root') {
    return 'root';
  }

  return label;
}

function groupHasEntries(section: ReportGroupSection): boolean {
  const { counts } = section;
  return counts.added > 0 || counts.changed > 0 || counts.removed > 0 || counts.renamed > 0;
}

function renderFooters(): readonly string[] {
  return [];
}

function createAddedListOptions(width: number): GroupedListOptions<TokenAddition> {
  return {
    color: 'green',
    buildLine: (entry, runtime) => ({
      text: `+ ${formatTokenPathForWidth(entry.id, width, runtime)} = ${formatTokenValueForSummary(entry.next)}`,
      impact: formatImpactLabel(entry.impact, runtime.useColor),
    }),
    buildCondensedLine: (entry, runtime) => ({
      text: `+ ${formatTokenPathForWidth(entry.id, width, runtime)}`,
      impact: formatImpactLabel(entry.impact, runtime.useColor),
    }),
    getToken: (entry) => entry.next,
    describe: describeAddition,
    renderDetails: (entry, runtime) => collectCliSnapshotDetails(entry.next, runtime),
    getLinkDetails: (entry, runtime) => ({
      pointer: sanitizeCliString(formatTokenPathForWidth(entry.id, width, runtime), runtime),
      source: entry.next.source,
    }),
  };
}

function createRemovedListOptions(width: number): GroupedListOptions<TokenRemoval> {
  return {
    color: 'red',
    buildLine: (entry, runtime) => ({
      text: `- ${formatTokenPathForWidth(entry.id, width, runtime)} (was ${formatTokenValueForSummary(entry.previous)})`,
      impact: formatImpactLabel(entry.impact, runtime.useColor),
    }),
    buildCondensedLine: (entry, runtime) => ({
      text: `- ${formatTokenPathForWidth(entry.id, width, runtime)}`,
      impact: formatImpactLabel(entry.impact, runtime.useColor),
    }),
    getToken: (entry) => entry.previous,
    describe: describeRemoval,
    renderDetails: (entry, runtime) => collectCliSnapshotDetails(entry.previous, runtime),
    getLinkDetails: (entry, runtime) => ({
      pointer: sanitizeCliString(formatTokenPathForWidth(entry.id, width, runtime), runtime),
      source: entry.previous.source,
    }),
  };
}

function createRenamedListOptions(width: number): GroupedListOptions<TokenRename> {
  return {
    color: 'cyan',
    buildLine: (entry, runtime) => {
      const previousPath = formatTokenPathForWidth(entry.previousId, width, runtime);
      const nextPath = formatTokenPathForWidth(entry.nextId, width, runtime);
      const arrow = formatArrow(runtime);
      return {
        text: `${formatRenameGlyph(runtime)} ${previousPath} ${arrow} ${nextPath} = ${formatTokenValueForSummary(entry.next)}`,
        impact: formatImpactLabel(entry.impact, runtime.useColor),
      };
    },
    buildCondensedLine: (entry, runtime) => {
      const previousPath = formatTokenPathForWidth(entry.previousId, width, runtime);
      const nextPath = formatTokenPathForWidth(entry.nextId, width, runtime);
      const arrow = formatArrow(runtime);
      return {
        text: `${formatRenameGlyph(runtime)} ${previousPath} ${arrow} ${nextPath}`,
        impact: formatImpactLabel(entry.impact, runtime.useColor),
      };
    },
    getToken: (entry) => entry.next,
    describe: describeRename,
    renderDetails: (entry, runtime) => collectCliRenameDetails(entry, runtime),
    getLinkDetails: (entry, runtime) => ({
      pointer: sanitizeCliString(formatTokenPathForWidth(entry.nextId, width, runtime), runtime),
      occurrence: 'last',
      source: entry.next.source,
    }),
  };
}

function formatGuidanceLines(
  guidance: EntryGuidance,
  indent: string,
  runtime: CliRenderRuntime,
): readonly string[] {
  const lines: string[] = [];

  if (runtime.includeWhy) {
    append(lines, `${indent}  ${sanitizeCliString(`Why: ${guidance.why}`, runtime)}`);
  }

  append(lines, `${indent}  ${sanitizeCliString(`Impact: ${guidance.impactSummary}`, runtime)}`);
  append(lines, `${indent}  ${sanitizeCliString(`Next: ${guidance.nextStep}`, runtime)}`);

  return lines;
}

function colorize(text: string, color: Color, useColor: boolean): string {
  if (!useColor) {
    return text;
  }

  const code = COLORS[color];
  return `${code}${text}${RESET}`;
}

type SummaryLabel =
  | 'added'
  | 'removed'
  | 'renamed'
  | 'changed'
  | 'unchanged'
  | 'breaking'
  | 'non-breaking';

const SUMMARY_COLORS: Record<SummaryLabel, Color> = {
  added: 'green',
  removed: 'red',
  renamed: 'cyan',
  changed: 'yellow',
  unchanged: 'dim',
  breaking: 'red',
  'non-breaking': 'green',
};

function formatSummaryCount(count: number, label: SummaryLabel, useColor: boolean): string {
  return formatCustomSummaryCount(count, label, SUMMARY_COLORS[label], useColor);
}

function formatValueChangeCount(count: number, useColor: boolean): string {
  const label = count === 1 ? 'value change' : 'value changes';
  return formatCustomSummaryCount(count, label, 'red', useColor);
}

function formatMetadataChangeCount(count: number, useColor: boolean): string {
  const label = count === 1 ? 'metadata change' : 'metadata changes';
  return formatCustomSummaryCount(count, label, 'cyan', useColor);
}

function formatCustomSummaryCount(
  count: number,
  label: string,
  color: Color,
  useColor: boolean,
): string {
  const text = `${String(count)} ${label}`;

  if (!useColor) {
    return text;
  }

  const appliedColor = count === 0 ? 'dim' : color;
  return colorize(text, appliedColor, useColor);
}

function formatVersionBump(bump: VersionBump, useColor: boolean): string {
  const descriptors: Record<VersionBump, { readonly label: string; readonly color: Color }> = {
    none: { label: 'None', color: 'dim' },
    patch: { label: 'Patch', color: 'green' },
    minor: { label: 'Minor', color: 'yellow' },
    major: { label: 'Major', color: 'red' },
  };

  const descriptor = descriptors[bump];
  return colorize(descriptor.label, descriptor.color, useColor);
}

function formatCliValue(value: unknown, runtime: CliRenderRuntime): string {
  return value === undefined ? 'undefined' : sanitizeCliString(formatValue(value), runtime);
}

function createBeforeAfterSection(
  label: string,
  previous: string,
  next: string,
  runtime: CliRenderRuntime,
): string[] {
  const bullet = formatBullet(runtime);
  return [`${bullet} ${label}`, `  Before: ${previous}`, `  After: ${next}`];
}

function formatCliReference(value: string | undefined, runtime: CliRenderRuntime): string {
  if (!value || value.trim().length === 0) {
    return 'none';
  }

  return sanitizeCliString(value, runtime);
}

const URI_SANITIZE_PATTERN = /file:\/\/[^\s'"\)]+/g;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

function stripControlCharacters(text: string): string {
  return text.replaceAll(CONTROL_CHARACTER_PATTERN, '');
}

function sanitizeCliString(text: string, runtime: CliRenderRuntime): string {
  const normalized = runtime.useUnicode ? text : text.replaceAll('…', '...');
  const stripped = stripControlCharacters(normalized);
  return stripped.replaceAll(URI_SANITIZE_PATTERN, (match) => truncateUri(match, runtime));
}

function truncateUri(uri: string, runtime: CliRenderRuntime): string {
  const safeUri = stripControlCharacters(uri);

  try {
    const parsed = new URL(safeUri);

    if (parsed.protocol === 'file:') {
      const segments = parsed.pathname
        .split('/')
        .filter((segment) => segment.length > 0)
        .map((segment) => decodeURIComponent(segment));

      if (segments.length === 0) {
        return 'file';
      }

      return stripControlCharacters(formatSegmentTail(segments, 1, runtime));
    }
  } catch {
    // Ignore parsing errors and fall back to manual truncation below.
  }

  const sanitized = safeUri.replace(/^file:\/\//, '');
  const segments = sanitized.split('/').filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return safeUri;
  }

  return stripControlCharacters(formatSegmentTail(segments, 4, runtime));
}

function formatSegmentTail(
  segments: readonly string[],
  keep: number,
  runtime: CliRenderRuntime,
): string {
  const truncated = segments.length <= keep ? segments : segments.slice(segments.length - keep);
  const prefix = segments.length > keep ? `${formatEllipsis(runtime)}/` : '';
  return `${prefix}${truncated.join('/')}`;
}

function formatCliPointer(pointer: TokenPointer, runtime: CliRenderRuntime): string {
  const location = truncateUri(pointer.uri, runtime);
  const pointerTextRaw = pointer.pointer.startsWith('#') ? pointer.pointer : `#${pointer.pointer}`;
  const pointerText = stripControlCharacters(pointerTextRaw);
  const suffix = pointer.external ? ' (external)' : '';

  const displayRaw =
    location.length === 0 ? `${pointerText}${suffix}` : `${location}${pointerText}${suffix}`;
  const display = sanitizeCliString(displayRaw, runtime);

  if (!runtime.enableLinks) {
    return display;
  }

  const target = createPointerLinkTarget(pointer);

  if (!target) {
    return display;
  }

  const linked = applyHyperlink(display, target);
  return linked;
}

function applyCliHyperlink(text: string, source: TokenSnapshot['source']): string {
  const target = createSourceLinkTarget(source);

  if (!target) {
    return text;
  }

  return applyHyperlink(text, target);
}

function applyHyperlinkToPointerOccurrence(
  text: string,
  pointer: string,
  source: TokenSnapshot['source'],
  occurrence: PointerOccurrence,
): string {
  if (pointer.length === 0) {
    return text;
  }

  const index = occurrence === 'last' ? text.lastIndexOf(pointer) : text.indexOf(pointer);

  if (index < 0) {
    return text;
  }

  const before = text.slice(0, index);
  const after = text.slice(index + pointer.length);
  const linkedPointer = applyCliHyperlink(pointer, source);
  return `${before}${linkedPointer}${after}`;
}

function applyHyperlink(text: string, target: string): string {
  const sanitizedTarget = stripControlCharacters(target);

  if (sanitizedTarget.length === 0 || sanitizedTarget !== target) {
    return text;
  }

  return `\u001B]8;;${sanitizedTarget}\u0007${text}\u001B]8;;\u0007`;
}

function createSourceLinkTarget(source: TokenSnapshot['source']): string | undefined {
  const { uri, line, column } = source;

  if (!uri || uri.trim().length === 0) {
    return undefined;
  }

  const normalized = uri.trim();

  try {
    const parsed = new URL(normalized);
    const lineLabel = String(line);
    const columnLabel = String(column);
    parsed.hash = `L${lineLabel}:C${columnLabel}`;
    return parsed.toString();
  } catch {
    const lineLabel = String(line);
    const columnLabel = String(column);
    return `${normalized}#L${lineLabel}:C${columnLabel}`;
  }
}

function createPointerLinkTarget(pointer: TokenPointer): string | undefined {
  const { uri } = pointer;

  if (!uri || uri.trim().length === 0) {
    return undefined;
  }

  const normalized = uri.trim();
  const pointerPart = pointer.pointer.startsWith('#') ? pointer.pointer.slice(1) : pointer.pointer;

  try {
    const parsed = new URL(normalized);
    parsed.hash = pointerPart;
    return parsed.toString();
  } catch {
    const separator = normalized.includes('#') ? '' : '#';
    return `${normalized}${separator}${pointerPart}`;
  }
}

function formatCliPointerListLines(
  pointers: readonly TokenPointer[],
  indent: string,
  runtime: CliRenderRuntime,
): string[] {
  if (pointers.length === 0) {
    return [`${indent}${formatSubBullet(runtime)} none`];
  }

  const limit = Number.isFinite(runtime.pointerLimit)
    ? Math.max(0, Math.floor(runtime.pointerLimit))
    : undefined;
  const entries =
    limit === undefined || limit >= pointers.length ? pointers : pointers.slice(0, limit);
  const rendered = entries.map(
    (pointer) => `${indent}${formatSubBullet(runtime)} ${formatCliPointer(pointer, runtime)}`,
  );

  if (limit !== undefined && limit < pointers.length) {
    const remaining = pointers.length - limit;
    append(
      rendered,
      `${indent}${formatSubBullet(runtime)} ${formatEllipsis(runtime)} (${remaining.toString()} more)`,
    );
  }

  return rendered;
}

function collectCliSnapshotDetails(
  token: TokenSnapshot,
  runtime: CliRenderRuntime,
): readonly string[] {
  const lines: string[] = [];

  append(lines, `Source: ${formatCliTokenSource(token, runtime)}`);

  if (token.type && token.type.trim().length > 0) {
    append(lines, `Type: ${sanitizeCliString(token.type, runtime)}`);
  }

  if (token.description && token.description.trim().length > 0) {
    append(lines, `Description: ${sanitizeCliString(token.description, runtime)}`);
  }

  if (token.ref !== undefined) {
    append(lines, `Ref: ${formatCliReference(token.ref, runtime)}`);
  }

  if (token.raw !== undefined) {
    append(lines, `Raw: ${formatCliValue(token.raw, runtime)}`);
  }

  if (Object.keys(token.extensions).length > 0) {
    append(lines, `Extensions: ${formatCliValue(token.extensions, runtime)}`);
  }

  if (token.deprecated !== undefined) {
    append(lines, `Deprecated: ${formatCliValue(token.deprecated, runtime)}`);
  }

  if (token.references.length > 0) {
    append(lines, 'References:');
    append(lines, ...formatCliPointerListLines(token.references, '  ', runtime));
  }

  if (token.resolutionPath.length > 0) {
    append(lines, 'Resolution path:');
    append(lines, ...formatCliPointerListLines(token.resolutionPath, '  ', runtime));
  }

  if (token.appliedAliases.length > 0) {
    append(lines, 'Applied aliases:');
    append(lines, ...formatCliPointerListLines(token.appliedAliases, '  ', runtime));
  }

  return lines;
}

function collectCliRenameDetails(entry: TokenRename, runtime: CliRenderRuntime): readonly string[] {
  const lines: string[] = [];
  const previousDetails = collectCliSnapshotDetails(entry.previous, runtime);
  const nextDetails = collectCliSnapshotDetails(entry.next, runtime);

  if (previousDetails.length > 0) {
    append(lines, 'Previous snapshot:');
    append(lines, ...indentLines(previousDetails, '  '));
  }

  if (nextDetails.length > 0) {
    append(lines, 'Next snapshot:');
    append(lines, ...indentLines(nextDetails, '  '));
  }

  return lines;
}

function collectCliModificationDetails(
  entry: TokenModification,
  runtime: CliRenderRuntime,
): readonly string[] {
  const lines: string[] = [];
  const previousDetails = collectCliSnapshotDetails(entry.previous, runtime);
  const nextDetails = collectCliSnapshotDetails(entry.next, runtime);

  if (previousDetails.length === 0 && nextDetails.length === 0) {
    return lines;
  }

  append(lines, 'Snapshot details:');

  if (previousDetails.length > 0) {
    append(lines, '  Previous:');
    append(lines, ...indentLines(previousDetails, '    '));
  }

  if (nextDetails.length > 0) {
    append(lines, '  Next:');
    append(lines, ...indentLines(nextDetails, '    '));
  }

  return lines;
}

function indentLines(lines: readonly string[], indent: string): string[] {
  return lines.map((line) => `${indent}${line}`);
}

function formatCliTokenSource(token: TokenSnapshot, runtime: CliRenderRuntime): string {
  const { uri, line, column } = token.source;
  const location = truncateUri(uri, runtime);
  const prefix = location.length > 0 ? `${location}:` : '';
  const position = `${line.toString()}:${column.toString()}`;
  const display = sanitizeCliString(`${prefix}${position}`, runtime);

  if (!runtime.enableLinks) {
    return display;
  }

  const target = createSourceLinkTarget(token.source);

  if (!target) {
    return display;
  }

  return applyHyperlink(display, target);
}

function createPointerComparisonSection(
  label: string,
  previous: readonly TokenPointer[],
  next: readonly TokenPointer[],
  runtime: CliRenderRuntime,
): string[] {
  const bullet = formatBullet(runtime);
  const lines = [`${bullet} ${label}`, '  Before:'];
  append(lines, ...formatCliPointerListLines(previous, '    ', runtime));
  append(lines, '  After:');
  append(lines, ...formatCliPointerListLines(next, '    ', runtime));
  return lines;
}

function getDeltaColor(delta: number, percentChange: number | undefined): Color {
  if (percentChange !== undefined) {
    const magnitude = Math.abs(percentChange);

    if (magnitude <= 10) {
      return 'green';
    }

    if (magnitude <= 25) {
      return 'yellow';
    }

    return 'red';
  }

  if (delta === 0) {
    return 'dim';
  }

  return delta > 0 ? 'green' : 'red';
}

function formatCliDelta(
  delta: number,
  unit: string,
  percentChange: number | undefined,
  useColor: boolean,
): string {
  const formattedDelta = formatSignedDimension(delta, unit);
  const percentSuffix =
    percentChange === undefined ? '' : ` (${formatSignedPercentage(percentChange)})`;
  const coloredDelta = colorize(
    `${formattedDelta}${percentSuffix}`,
    getDeltaColor(delta, percentChange),
    useColor,
  );
  return `  Delta: ${coloredDelta}`;
}

const FIELD_RENDERERS: Record<
  TokenModification['changes'][number],
  (previous: TokenSnapshot, next: TokenSnapshot, runtime: CliRenderRuntime) => readonly string[]
> = {
  value: (previous, next, runtime) => {
    const lines = createBeforeAfterSection(
      'Value updated',
      formatCliValue(previous.value, runtime),
      formatCliValue(next.value, runtime),
      runtime,
    );

    const previousColor = getTokenColor(previous);
    const nextColor = getTokenColor(next);

    if (previousColor && nextColor) {
      append(lines, `  ${renderCliColorComparison(previousColor, nextColor, runtime)}`);
    }

    const previousTypography = getTypographyPreview(previous);
    const nextTypography = getTypographyPreview(next);

    if (previousTypography && nextTypography) {
      append(
        lines,
        `  Typography: ${previousTypography.label} ${formatArrow(runtime)} ${nextTypography.label}`,
      );
    }

    const dimensionComparison = getDimensionComparison(previous, next);

    if (dimensionComparison) {
      append(
        lines,
        formatCliDelta(
          dimensionComparison.delta,
          dimensionComparison.unit,
          dimensionComparison.percentChange,
          runtime.useColor,
        ),
      );
    }

    return lines;
  },
  raw: (previous, next, runtime) =>
    createBeforeAfterSection(
      'Raw value updated',
      formatCliValue(previous.raw, runtime),
      formatCliValue(next.raw, runtime),
      runtime,
    ),
  ref: (previous, next, runtime) =>
    createBeforeAfterSection(
      'Reference updated',
      formatCliReference(previous.ref, runtime),
      formatCliReference(next.ref, runtime),
      runtime,
    ),
  type: (previous, next, runtime) =>
    createBeforeAfterSection(
      'Type updated',
      sanitizeCliString(formatMaybeUndefined(previous.type), runtime),
      sanitizeCliString(formatMaybeUndefined(next.type), runtime),
      runtime,
    ),
  description: (previous, next, runtime) =>
    createBeforeAfterSection(
      'Description updated',
      sanitizeCliString(formatMaybeUndefined(previous.description), runtime),
      sanitizeCliString(formatMaybeUndefined(next.description), runtime),
      runtime,
    ),
  extensions: (previous, next, runtime) =>
    createBeforeAfterSection(
      'Extensions updated',
      formatCliValue(previous.extensions, runtime),
      formatCliValue(next.extensions, runtime),
      runtime,
    ),
  deprecated: (previous, next, runtime) =>
    createBeforeAfterSection(
      'Deprecation metadata updated',
      formatCliValue(previous.deprecated, runtime),
      formatCliValue(next.deprecated, runtime),
      runtime,
    ),
  references: (previous, next, runtime) =>
    createPointerComparisonSection(
      'References updated',
      previous.references,
      next.references,
      runtime,
    ),
  resolutionPath: (previous, next, runtime) =>
    createPointerComparisonSection(
      'Resolution path updated',
      previous.resolutionPath,
      next.resolutionPath,
      runtime,
    ),
  appliedAliases: (previous, next, runtime) =>
    createPointerComparisonSection(
      'Applied aliases updated',
      previous.appliedAliases,
      next.appliedAliases,
      runtime,
    ),
};

function renderFieldChange(
  field: TokenModification['changes'][number],
  previous: TokenSnapshot,
  next: TokenSnapshot,
  runtime: CliRenderRuntime,
): readonly string[] {
  return FIELD_RENDERERS[field](previous, next, runtime);
}

function appendCliTokenDetails(
  text: string,
  token: TokenSnapshot,
  runtime: CliRenderRuntime,
  color: Color,
): string {
  let result = text;

  const tokenColor = getTokenColor(token);

  if (tokenColor) {
    const reapply = runtime.useColor ? COLORS[color] : undefined;
    result += formatCliColorSwatch(tokenColor, runtime, reapply);
  }

  const typography = getTypographyPreview(token);

  if (typography) {
    result += formatCliTypographyLabel(typography);
  }

  return result;
}

function formatCliTypographyLabel(
  preview: NonNullable<ReturnType<typeof getTypographyPreview>>,
): string {
  return ` [type ${preview.label}]`;
}

type PointerOccurrence = 'first' | 'last';

interface GroupedListOptions<Entry> {
  readonly color: Color;
  readonly buildLine: (entry: Entry, runtime: CliRenderRuntime) => { text: string; impact: string };
  readonly buildCondensedLine?: (
    entry: Entry,
    runtime: CliRenderRuntime,
  ) => { text: string; impact: string };
  readonly getToken: (entry: Entry) => TokenSnapshot | undefined;
  readonly describe?: (entry: Entry) => EntryGuidance;
  readonly renderDetails?: (
    entry: Entry,
    runtime: CliRenderRuntime,
    context: { readonly pointerIndent: string },
  ) => readonly string[];
  readonly getLinkDetails?: (
    entry: Entry,
    runtime: CliRenderRuntime,
    width: number,
  ) =>
    | {
        readonly pointer: string;
        readonly occurrence?: PointerOccurrence;
        readonly source: TokenSnapshot['source'];
      }
    | undefined;
}

function renderModificationEntries(
  entries: readonly TokenModification[],
  mode: 'condensed' | 'full',
  width: number,
  indent: string,
  runtime: CliRenderRuntime,
): readonly string[] {
  const lines: string[] = [];
  const lastEntryIndex = entries.length - 1;
  const showDetails = mode === 'full';
  const showMetadata = mode !== 'condensed';

  for (const [index, entry] of entries.entries()) {
    const pointerLabelRaw = formatTokenPathForWidth(entry.id, width, runtime);
    const pointerLabel = sanitizeCliString(pointerLabelRaw, runtime);
    const linkedPointer = runtime.enableLinks
      ? applyCliHyperlink(pointerLabel, entry.next.source)
      : pointerLabel;
    const impactLabel = sanitizeCliString(
      formatImpactLabel(entry.impact, runtime.useColor),
      runtime,
    );
    const headerContent = `${formatBullet(runtime)} ~ ${linkedPointer} ${impactLabel}`;
    const header = colorize(headerContent, 'yellow', runtime.useColor);
    append(lines, `${indent}${header}`);

    if (showMetadata) {
      const guidance = describeModification(entry);
      append(lines, ...formatGuidanceLines(guidance, indent, runtime));

      for (const field of entry.changes) {
        const fieldLines = renderFieldChange(field, entry.previous, entry.next, runtime);

        for (const fieldLine of fieldLines) {
          append(lines, `${indent}  ${fieldLine}`);
        }
      }
    }

    if (showDetails) {
      const detailLines = collectCliModificationDetails(entry, runtime);

      for (const detail of detailLines) {
        append(lines, `${indent}  ${sanitizeCliString(detail, runtime)}`);
      }
    }

    if (index < lastEntryIndex && showMetadata) {
      append(lines, '');
    }
  }

  return lines;
}

function renderOperationEntries<Entry>(
  entries: readonly Entry[],
  mode: 'condensed' | 'full',
  width: number,
  options: GroupedListOptions<Entry>,
  indent: string,
  runtime: CliRenderRuntime,
): readonly string[] {
  const lines: string[] = [];
  const availableWidth = clampReportWidth(width);
  const contentWidth = Math.max(1, availableWidth - (indent.length + 2));

  for (const entry of entries) {
    const build =
      mode === 'condensed' && options.buildCondensedLine
        ? options.buildCondensedLine
        : options.buildLine;
    const { text, impact } = build(entry, runtime);
    const includePreview = mode !== 'condensed';
    const token = includePreview ? options.getToken(entry) : undefined;
    const sanitizedText = sanitizeCliString(text, runtime);
    const truncatedText = truncateCliText(sanitizedText, contentWidth, runtime);
    const withPreview =
      !includePreview || token === undefined
        ? truncatedText
        : appendCliTokenDetails(truncatedText, token, runtime, options.color);
    let finalLine = impact.length > 0 ? `${withPreview} ${impact}` : withPreview;

    if (runtime.enableLinks && options.getLinkDetails) {
      const details = options.getLinkDetails(entry, runtime, width);

      if (details) {
        finalLine = applyHyperlinkToPointerOccurrence(
          finalLine,
          details.pointer,
          details.source,
          details.occurrence ?? 'first',
        );
      }
    }

    const prefixed = `${indent}${formatBullet(runtime)} ${finalLine}`;
    append(lines, colorize(prefixed, options.color, runtime.useColor));

    if (mode !== 'condensed' && options.describe) {
      const guidance = options.describe(entry);
      append(lines, ...formatGuidanceLines(guidance, indent, runtime));
    }

    if (mode === 'full' && options.renderDetails) {
      const detailLines = options.renderDetails(entry, runtime, {
        pointerIndent: '  ',
      });

      for (const detail of detailLines) {
        const sanitized = sanitizeCliString(detail, runtime);

        if (sanitized.length === 0) {
          continue;
        }

        append(lines, `${indent}  ${sanitized}`);
      }
    }
  }

  return lines;
}

function formatCliColorSwatch(
  color: TokenColor,
  runtime: CliRenderRuntime,
  reapplyColorCode?: string,
): string {
  const label = formatCliColorLabel(color, runtime.useUnicode);

  if (!runtime.useColor) {
    return ` ${label}`;
  }

  const background = `\u001B[48;2;${String(color.red)};${String(color.green)};${String(color.blue)}m`;
  const block = `${background}  ${RESET}`;
  const reapply = reapplyColorCode ?? '';
  return ` ${block}${reapply} ${label}`;
}

function formatCliColorLabel(color: TokenColor, useUnicode: boolean): string {
  const segments = [`swatch ${color.hex}`];

  if (color.alpha !== undefined) {
    const alphaLabel = useUnicode ? 'α' : 'alpha';
    append(segments, `${alphaLabel}=${formatAlpha(color.alpha)}`);
  }

  return `[${segments.join(' ')}]`;
}

function renderCliColorComparison(
  previous: TokenColor,
  next: TokenColor,
  runtime: CliRenderRuntime,
): string {
  const previousSwatch = formatCliColorSwatch(previous, runtime).replace(/^\s+/, '');
  const nextSwatch = formatCliColorSwatch(next, runtime).replace(/^\s+/, '');
  return `Swatch: ${previousSwatch} ${formatArrow(runtime)} ${nextSwatch}`;
}

function formatImpactLabel(impact: TokenAddition['impact'], useColor: boolean): string {
  const color: Color = impact === 'breaking' ? 'red' : 'green';
  const label = impact === 'breaking' ? 'breaking' : 'non-breaking';
  return colorize(`[${label}]`, color, useColor);
}

import type {
  TokenAddition,
  TokenDiffResult,
  TokenModification,
  TokenRemoval,
  TokenRename,
  VersionBump,
} from '../../diff.js';
import type { ReportRendererContext } from '../../application/ports/reporting.js';
import type { TokenPointer, TokenSnapshot } from '../../token-set.js';
import { append } from '../../utils/append.js';
import type { CssDeclaration, TokenColor, TypographyPreview } from '../formatting.js';
import {
  escapeHtml,
  formatColorLabel,
  formatCssColor,
  formatSignedDimension,
  formatSignedPercentage,
  formatMaybeUndefined,
  formatPointer,
  formatPointerList,
  formatTokenSourceLocation,
  formatTokenValueForSummary,
  formatValue,
  getDimensionComparison,
  getTokenColor,
  getTypographyPreview,
} from '../formatting.js';
import {
  describeAddition,
  describeModification,
  describeRemoval,
  describeRename,
} from '../change-guidance.js';
import { getStandardFooterSections } from '../layout/footers.js';
import { createOperationSummaryDescriptor } from '../layout/operations.js';
import {
  createReportDescriptor,
  type ReportGroupSection,
  type ReportHotspot,
  type ReportRiskItem,
  type ReportSummaryView,
  type ReportTypeSection,
  type ReportTypeOperations,
} from '../report-descriptor.js';
import {
  describeRunComparison,
  formatRunDuration,
  formatRunTimestamp,
  type ReportRunContext,
} from '../run-context.js';

export interface MarkdownFormatterOptions {
  readonly mode?: 'full' | 'summary' | 'condensed' | 'detailed';
  readonly topRisks?: number;
  readonly showWhy?: boolean;
  readonly diffContext?: number;
  readonly runContext?: ReportRunContext;
}

interface MarkdownRuntime {
  readonly includeWhy: boolean;
  readonly pointerLimit: number;
  readonly mode: 'full' | 'summary' | 'condensed' | 'detailed';
}

/**
 * Renders a diff as Markdown suited for documentation or static reporting.
 *
 * @param diff - The diff result to render.
 * @param options - Formatter options selecting verbosity and risk limits.
 * @param _context - Unused renderer context placeholder for API parity.
 * @returns The Markdown representation of the diff.
 */
export function formatDiffAsMarkdown(
  diff: TokenDiffResult,
  options: MarkdownFormatterOptions = {},
  _context?: ReportRendererContext,
): string {
  const requestedMode = options.mode ?? 'full';
  let mode: 'full' | 'summary' | 'condensed' | 'detailed' = 'full';

  switch (requestedMode) {
    case 'summary': {
      mode = 'summary';
      break;
    }
    case 'detailed': {
      mode = 'detailed';
      break;
    }
    case 'condensed': {
      mode = 'condensed';
      break;
    }
    default: {
      break;
    }
  }
  const includeWhy = (options.showWhy ?? false) || mode === 'detailed';
  const topRiskLimit = normalizeTopRiskLimit(options.topRisks);
  const diffContext = normalizeDiffContext(options.diffContext);
  let pointerLimit: number;

  if (mode === 'detailed') {
    pointerLimit = Number.POSITIVE_INFINITY;
  } else if (mode === 'condensed') {
    pointerLimit = Math.min(diffContext, 1);
  } else {
    pointerLimit = diffContext;
  }
  const runtime: MarkdownRuntime = {
    includeWhy,
    pointerLimit,
    mode,
  };
  const report = createReportDescriptor(diff, { topRiskLimit });
  const sections: string[] = [];

  append(sections, renderMarkdownHeader());
  append(sections, renderExecutiveSummary(report.summary, diff, options.runContext));

  if (mode !== 'summary') {
    if (mode !== 'condensed') {
      const topRisksSection = renderTopRisks(report.topRisks, runtime);

      if (topRisksSection.length > 0) {
        append(sections, topRisksSection);
      }
    }

    const detailSection = renderGroupedDetail(report.typeSections, runtime);

    if (detailSection.length > 0) {
      append(sections, detailSection);
    }
  }

  append(sections, renderFooters());

  return sections.filter((section) => section.length > 0).join('\n\n');
}
const DEFAULT_TOP_RISKS_LIMIT = 10;
const DEFAULT_DIFF_CONTEXT = 3;
const MAX_TOP_RISKS = 50;

function normalizeTopRiskLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_TOP_RISKS_LIMIT;
  }

  const normalized = Math.floor(value);

  if (normalized <= 0) {
    return 0;
  }

  return Math.min(normalized, MAX_TOP_RISKS);
}

function normalizeDiffContext(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_DIFF_CONTEXT;
  }

  const normalized = Math.floor(value);

  if (normalized < 0) {
    return 0;
  }

  return normalized;
}
const HOTSPOT_LIMIT = 4;
const BACKTICK = '`';

function renderMarkdownHeader(): string {
  return '# DTIFx Diff report';
}

function renderExecutiveSummary(
  summary: ReportSummaryView,
  diff: TokenDiffResult,
  context: ReportRunContext | undefined,
): string {
  const lines = [
    '## Executive summary',
    `- Recommended version bump: ${formatMarkdownVersionBump(diff.summary.recommendedBump)}`,
  ];

  const comparison = describeRunComparison(context);

  if (comparison) {
    append(lines, `- Compared: ${comparison}`);
  }

  const startedAt = formatRunTimestamp(context);

  if (startedAt) {
    append(lines, `- Started: ${startedAt}`);
  }

  const duration = formatRunDuration(context);

  if (duration) {
    append(lines, `- Duration: ${duration}`);
  }

  append(
    lines,
    `- Impact: ${formatImpactSummary(summary.impact)}`,
    `- Changes: ${formatOperationSummary(summary.operations)}`,
    `- Tokens analysed: ${formatTokenTotals(summary.totals)}`,
    `- Change mix: ${formatChangeMix(summary.changeMix)}`,
  );

  const typeHotspots = formatHotspotSummaries(summary.typeHotspots);

  if (typeHotspots.length > 0) {
    append(lines, `- Type hotspots: ${typeHotspots.join(', ')}`);
  }

  const groupHotspots = formatHotspotSummaries(summary.groupHotspots);

  if (groupHotspots.length > 0) {
    append(lines, `- Group hotspots: ${groupHotspots.join(', ')}`);
  }

  const tables = renderSummaryTables(diff);

  if (tables.length > 0) {
    append(lines, '');
    append(lines, ...tables);
  }

  return lines.join('\n');
}

function renderSummaryTables(diff: TokenDiffResult): readonly string[] {
  const lines: string[] = [];

  if (diff.summary.types.length > 0) {
    append(lines, '### Type breakdown');
    append(
      lines,
      '| Type | Previous | Next | Added | Removed | Renamed | Changed | Value changes | Metadata changes | Unchanged | Breaking | Non-breaking |',
    );
    append(
      lines,
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    );

    for (const type of diff.summary.types) {
      append(
        lines,
        `| ${type.type} | ${String(type.totalPrevious)} | ${String(type.totalNext)} | ${String(type.added)} | ${String(type.removed)} | ${String(type.renamed)} | ${String(type.changed)} | ${String(type.valueChanged)} | ${String(type.metadataChanged)} | ${String(type.unchanged)} | ${String(type.breaking)} | ${String(type.nonBreaking)} |`,
      );
    }
  }

  if (diff.summary.groups.length > 0) {
    if (lines.length > 0) {
      append(lines, '');
    }

    append(lines, '### Group breakdown');
    append(
      lines,
      '| Group | Previous | Next | Added | Removed | Renamed | Changed | Value changes | Metadata changes | Unchanged | Breaking | Non-breaking |',
    );
    append(
      lines,
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    );

    for (const group of diff.summary.groups) {
      append(
        lines,
        `| ${group.group} | ${String(group.totalPrevious)} | ${String(group.totalNext)} | ${String(group.added)} | ${String(group.removed)} | ${String(group.renamed)} | ${String(group.changed)} | ${String(group.valueChanged)} | ${String(group.metadataChanged)} | ${String(group.unchanged)} | ${String(group.breaking)} | ${String(group.nonBreaking)} |`,
      );
    }
  }

  return lines;
}

function renderTopRisks(risks: readonly ReportRiskItem[], runtime: MarkdownRuntime): string {
  if (risks.length === 0) {
    return '';
  }

  const lines = [`## Top risks (${String(risks.length)})`];

  for (const [index, risk] of risks.entries()) {
    const headline = `${String(index + 1)}. ${formatRiskSeverity(risk.impact)} ${formatOperationGlyph(risk.kind)} ${risk.typeLabel} ${wrapCode(risk.labelPath)} — ${risk.title}`;
    append(lines, headline);
    if (runtime.includeWhy) {
      append(lines, `   - Why: ${risk.why}`);
    }
    append(lines, `   - Impact: ${risk.impactSummary}`);
    append(lines, `   - Next: ${risk.nextStep}`);

    if (risk.changedFields && risk.changedFields.length > 0) {
      const fields = risk.changedFields.map((field) => wrapCode(field)).join(', ');
      append(lines, `   - Fields: ${fields}`);
    }
  }

  return lines.join('\n');
}

const RISK_OPERATION_GLYPHS: Record<ReportRiskItem['kind'], string> = {
  added: '+',
  removed: '-',
  renamed: '>',
  changed: '~',
};

function formatRiskSeverity(impact: TokenAddition['impact']): string {
  return impact === 'breaking' ? '**[BREAKING]**' : '**[NON-BREAKING]**';
}

function formatOperationGlyph(kind: ReportRiskItem['kind']): string {
  return RISK_OPERATION_GLYPHS[kind];
}

function wrapCode(value: string): string {
  return `${BACKTICK}${value}${BACKTICK}`;
}

const TYPE_OPERATION_ORDER: readonly (keyof ReportTypeSection['operations'])[] = [
  'changed',
  'removed',
  'added',
  'renamed',
];

const TYPE_OPERATION_LABELS: Record<keyof ReportTypeSection['operations'], string> = {
  changed: 'Changed',
  removed: 'Removed',
  added: 'Added',
  renamed: 'Renamed',
};

function renderGroupedDetail(
  sections: readonly ReportTypeSection[],
  runtime: MarkdownRuntime,
): string {
  const relevantSections = sections.filter((section) => hasSectionEntries(section));

  if (relevantSections.length === 0) {
    return '';
  }

  const lines: string[] = ['## Grouped detail'];

  for (const section of relevantSections) {
    append(lines, '');
    append(lines, formatTypeSectionHeading(section));

    const groups = section.groups.filter((group) => hasGroupEntries(group));

    if (groups.length > 0) {
      for (const group of groups) {
        append(lines, '');
        append(lines, formatGroupSectionHeading(group));
        append(lines, ...renderOperationSections(group.operations, runtime, 5));
      }

      continue;
    }

    append(lines, ...renderOperationSections(section.operations, runtime, 4));
  }

  return lines.join('\n');
}

function hasSectionEntries(section: ReportTypeSection): boolean {
  const { counts } = section;
  return counts.added > 0 || counts.changed > 0 || counts.removed > 0 || counts.renamed > 0;
}

function hasGroupEntries(section: ReportGroupSection): boolean {
  const { counts } = section;
  return counts.added > 0 || counts.changed > 0 || counts.removed > 0 || counts.renamed > 0;
}

function formatTypeSectionHeading(section: ReportTypeSection): string {
  const summary = createOperationSummaryDescriptor(section.counts);
  const details = summary.parts.length > 0 ? `: ${summary.parts.join(' · ')}` : '';
  return `### ${section.label} (${summary.total.toString()} ${summary.changeLabel}${details})`;
}

function formatGroupSectionHeading(section: ReportGroupSection): string {
  const summary = createOperationSummaryDescriptor(section.counts);
  const details = summary.parts.length > 0 ? `: ${summary.parts.join(' · ')}` : '';
  return `#### ${formatGroupLabel(section.label)} (${summary.total.toString()} ${summary.changeLabel}${details})`;
}

function formatGroupLabel(label: string): string {
  if (label === 'root') {
    return 'root';
  }

  return label;
}

function renderOperationSections(
  operations: ReportTypeOperations,
  runtime: MarkdownRuntime,
  headingLevel: number,
): readonly string[] {
  const lines: string[] = [];
  const headingPrefix = '#'.repeat(headingLevel);

  for (const key of TYPE_OPERATION_ORDER) {
    const entries = operations[key];

    if (entries.length === 0) {
      continue;
    }

    if (lines.length > 0) {
      append(lines, '');
    }

    append(lines, `${headingPrefix} ${TYPE_OPERATION_LABELS[key]} (${String(entries.length)})`);

    switch (key) {
      case 'added': {
        append(lines, ...renderAddedEntries(entries as readonly TokenAddition[], runtime));
        break;
      }
      case 'removed': {
        append(lines, ...renderRemovedEntries(entries as readonly TokenRemoval[], runtime));
        break;
      }
      case 'renamed': {
        append(lines, ...renderRenamedEntries(entries as readonly TokenRename[], runtime));
        break;
      }
      case 'changed': {
        append(
          lines,
          ...renderModificationEntries(entries as readonly TokenModification[], runtime),
        );
        break;
      }
    }
  }

  return lines;
}

function renderAddedEntries(
  entries: readonly TokenAddition[],
  runtime: MarkdownRuntime,
): readonly string[] {
  const lines: string[] = [];

  for (const entry of entries) {
    const decorations = collectMarkdownTokenDecorations(entry.next);
    const suffix = decorations.length > 0 ? ` ${decorations}` : '';
    const headline = `- + ${wrapCode(entry.id)} = ${formatTokenValueForSummary(entry.next)}${suffix}${formatMarkdownImpact(entry.impact)}`;
    append(lines, headline);

    const guidance = describeAddition(entry);
    if (runtime.includeWhy) {
      append(lines, `  - Why: ${guidance.why}`);
    }
    append(lines, `  - Impact: ${guidance.impactSummary}`);
    append(lines, `  - Next: ${guidance.nextStep}`);

    if (runtime.mode === 'detailed') {
      const details = collectMarkdownSnapshotDetails(entry.next, runtime.pointerLimit);

      for (const detail of details) {
        append(lines, detail);
      }
    }
  }

  return lines;
}

function renderRemovedEntries(
  entries: readonly TokenRemoval[],
  runtime: MarkdownRuntime,
): readonly string[] {
  const lines: string[] = [];

  for (const entry of entries) {
    const decorations = collectMarkdownTokenDecorations(entry.previous);
    const suffix = decorations.length > 0 ? ` ${decorations}` : '';
    const headline = `- - ${wrapCode(entry.id)} (was ${formatTokenValueForSummary(entry.previous)})${suffix}${formatMarkdownImpact(entry.impact)}`;
    append(lines, headline);

    const guidance = describeRemoval(entry);
    if (runtime.includeWhy) {
      append(lines, `  - Why: ${guidance.why}`);
    }
    append(lines, `  - Impact: ${guidance.impactSummary}`);
    append(lines, `  - Next: ${guidance.nextStep}`);

    if (runtime.mode === 'detailed') {
      const details = collectMarkdownSnapshotDetails(entry.previous, runtime.pointerLimit);

      for (const detail of details) {
        append(lines, detail);
      }
    }
  }

  return lines;
}

function renderRenamedEntries(
  entries: readonly TokenRename[],
  runtime: MarkdownRuntime,
): readonly string[] {
  const lines: string[] = [];

  for (const entry of entries) {
    const decorations = collectMarkdownTokenDecorations(entry.next);
    const suffix = decorations.length > 0 ? ` ${decorations}` : '';
    const headline = `- > ${wrapCode(entry.previousId)} → ${wrapCode(entry.nextId)} = ${formatTokenValueForSummary(entry.next)}${suffix}${formatMarkdownImpact(entry.impact)}`;
    append(lines, headline);

    const guidance = describeRename(entry);
    if (runtime.includeWhy) {
      append(lines, `  - Why: ${guidance.why}`);
    }
    append(lines, `  - Impact: ${guidance.impactSummary}`);
    append(lines, `  - Next: ${guidance.nextStep}`);

    if (runtime.mode === 'detailed') {
      const details = collectMarkdownRenameDetails(entry, runtime.pointerLimit);

      for (const detail of details) {
        append(lines, detail);
      }
    }
  }

  return lines;
}

function renderModificationEntries(
  entries: readonly TokenModification[],
  runtime: MarkdownRuntime,
): readonly string[] {
  const lines: string[] = [];

  for (const entry of entries) {
    const decorations = collectMarkdownTokenDecorations(entry.next);
    const suffix = decorations.length > 0 ? ` ${decorations}` : '';
    const modification = describeModification(entry);
    const headline = `- ~ ${wrapCode(entry.id)} — ${modification.title}${suffix}${formatMarkdownImpact(entry.impact)}`;
    append(lines, headline);
    if (runtime.includeWhy) {
      append(lines, `  - Why: ${modification.why}`);
    }
    append(lines, `  - Impact: ${modification.impactSummary}`);
    append(lines, `  - Next: ${modification.nextStep}`);

    for (const field of entry.changes) {
      const fieldLines = renderFieldChange(field, entry.previous, entry.next, runtime.pointerLimit);

      for (const fieldLine of fieldLines) {
        append(lines, `  ${fieldLine}`);
      }
    }

    if (runtime.mode === 'detailed') {
      const details = collectMarkdownModificationDetails(entry, runtime.pointerLimit);

      for (const detail of details) {
        append(lines, detail);
      }
    }
  }

  return lines;
}

function formatImpactSummary(impact: ReportSummaryView['impact']): string {
  return `${String(impact.breaking)} breaking · ${String(impact.nonBreaking)} non-breaking`;
}

function formatOperationSummary(operations: ReportSummaryView['operations']): string {
  return [
    formatSummaryCount(operations.added, 'added'),
    formatSummaryCount(operations.changed, 'changed'),
    formatSummaryCount(operations.removed, 'removed'),
    formatSummaryCount(operations.renamed, 'renamed'),
  ].join(' · ');
}

function formatSummaryCount(count: number, label: string): string {
  return `${String(count)} ${label}`;
}

function formatTokenTotals(totals: ReportSummaryView['totals']): string {
  return `${String(totals.previous)} previous → ${String(totals.next)} next`;
}

function formatChangeMix(changeMix: ReportSummaryView['changeMix']): string {
  const valueLabel = changeMix.valueChanged === 1 ? 'value change' : 'value changes';
  const metadataLabel = changeMix.metadataChanged === 1 ? 'metadata change' : 'metadata changes';
  return `${String(changeMix.valueChanged)} ${valueLabel}, ${String(changeMix.metadataChanged)} ${metadataLabel}`;
}

function formatHotspotSummaries(hotspots: readonly ReportHotspot[]): readonly string[] {
  return hotspots.slice(0, HOTSPOT_LIMIT).map((hotspot) => formatHotspotLabel(hotspot));
}

function formatHotspotLabel(hotspot: ReportHotspot): string {
  const changeText = formatChangeTotal(hotspot.changes);
  const impactParts: string[] = [];

  if (hotspot.breaking > 0) {
    append(impactParts, formatSummaryCount(hotspot.breaking, 'breaking'));
  }

  if (hotspot.breaking === 0 && hotspot.nonBreaking > 0) {
    append(impactParts, formatSummaryCount(hotspot.nonBreaking, 'non-breaking'));
  }

  const impactText = impactParts.length > 0 ? `, ${impactParts.join(', ')}` : '';
  return `${hotspot.label} (${changeText}${impactText})`;
}

function formatChangeTotal(count: number): string {
  return `${String(count)} ${count === 1 ? 'change' : 'changes'}`;
}

function formatMarkdownVersionBump(bump: VersionBump): string {
  const label = bump === 'none' ? 'None' : bump.charAt(0).toUpperCase() + bump.slice(1);

  if (bump === 'none') {
    return label;
  }

  return `**${label}**`;
}

function renderFooters(): string {
  const sections = getStandardFooterSections();

  if (sections.length === 0) {
    return '';
  }

  const lines: string[] = [];

  for (const [index, section] of sections.entries()) {
    if (index > 0) {
      append(lines, '');
    }

    append(lines, `## ${section.title}`);

    for (const item of section.items) {
      append(lines, `- ${item}`);
    }
  }

  return lines.join('\n');
}

const FIELD_RENDERERS: Record<
  TokenModification['changes'][number],
  (previous: TokenSnapshot, next: TokenSnapshot, pointerLimit: number) => readonly string[]
> = {
  value: (previous, next, pointerLimit) => {
    void pointerLimit;
    const lines = [`- value: ${formatValue(previous.value)} → ${formatValue(next.value)}`];

    const comparison = renderMarkdownColorComparison(previous, next);
    const typographyComparison = renderMarkdownTypographyComparison(previous, next);

    if (comparison) {
      append(lines, `  - ${comparison}`);
    }

    if (typographyComparison) {
      append(lines, `  - ${typographyComparison}`);
    }

    const dimensionComparison = getDimensionComparison(previous, next);

    if (dimensionComparison) {
      append(
        lines,
        `  - delta: ${formatSignedDimension(
          dimensionComparison.delta,
          dimensionComparison.unit,
        )}${formatMarkdownPercentSuffix(dimensionComparison.percentChange)}`,
      );
    }

    return lines;
  },
  raw: (previous, next, pointerLimit) => {
    void pointerLimit;
    return [`- raw: ${formatValue(previous.raw)} → ${formatValue(next.raw)}`];
  },
  ref: (previous, next, pointerLimit) => {
    void pointerLimit;
    return [`- ref: ${formatPointer(previous.ref)} → ${formatPointer(next.ref)}`];
  },
  type: (previous, next, pointerLimit) => {
    void pointerLimit;
    return [`- type: ${formatMaybeUndefined(previous.type)} → ${formatMaybeUndefined(next.type)}`];
  },
  description: (previous, next, pointerLimit) => {
    void pointerLimit;
    return [
      `- description: ${formatMaybeUndefined(previous.description)} → ${formatMaybeUndefined(next.description)}`,
    ];
  },
  extensions: (previous, next, pointerLimit) => {
    void pointerLimit;
    return [`- extensions: ${formatValue(previous.extensions)} → ${formatValue(next.extensions)}`];
  },
  deprecated: (previous, next, pointerLimit) => {
    void pointerLimit;
    return [`- deprecated: ${formatValue(previous.deprecated)} → ${formatValue(next.deprecated)}`];
  },
  references: (previous, next, pointerLimit) => [
    `- references: ${formatPointerListWithLimit(previous.references, pointerLimit)} → ${formatPointerListWithLimit(next.references, pointerLimit)}`,
  ],
  resolutionPath: (previous, next, pointerLimit) => [
    `- resolutionPath: ${formatPointerListWithLimit(previous.resolutionPath, pointerLimit)} → ${formatPointerListWithLimit(next.resolutionPath, pointerLimit)}`,
  ],
  appliedAliases: (previous, next, pointerLimit) => [
    `- appliedAliases: ${formatPointerListWithLimit(previous.appliedAliases, pointerLimit)} → ${formatPointerListWithLimit(next.appliedAliases, pointerLimit)}`,
  ],
};

function renderFieldChange(
  field: TokenModification['changes'][number],
  previous: TokenSnapshot,
  next: TokenSnapshot,
  pointerLimit: number,
): readonly string[] {
  return FIELD_RENDERERS[field](previous, next, pointerLimit);
}

function formatPointerListWithLimit(pointers: readonly TokenPointer[], limit: number): string {
  if (!Number.isFinite(limit) || limit < 0 || limit >= pointers.length) {
    return formatPointerList(pointers);
  }

  const normalized = Math.floor(limit);

  if (normalized <= 0) {
    return `[ … (+${pointers.length.toString()} more)]`;
  }

  const subset = pointers.slice(0, normalized);
  const formattedSubset = formatPointerList(subset);
  const trimmed = formattedSubset.endsWith(']') ? formattedSubset.slice(0, -1) : formattedSubset;
  const remaining = pointers.length - normalized;
  return `${trimmed}, … (+${remaining.toString()} more)]`;
}

function formatMarkdownPercentSuffix(percent: number | undefined): string {
  if (percent === undefined) {
    return '';
  }

  return ` (${formatSignedPercentage(percent)})`;
}

function collectMarkdownSnapshotDetails(
  token: TokenSnapshot,
  pointerLimit: number,
): readonly string[] {
  const lines: string[] = [];
  const sourceLabel = formatTokenSourceLocation(token.source);
  append(lines, `  - Source: <code>${escapeHtml(sourceLabel)}</code>`);

  if (token.type && token.type.trim().length > 0) {
    append(lines, `  - Type: <code>${escapeHtml(token.type)}</code>`);
  }

  if (token.description && token.description.trim().length > 0) {
    append(lines, `  - Description: ${escapeHtml(token.description)}`);
  }

  if (token.ref !== undefined) {
    append(lines, `  - Ref: <code>${escapeHtml(formatPointer(token.ref))}</code>`);
  }

  if (token.raw !== undefined) {
    append(lines, `  - Raw: <code>${escapeHtml(formatValue(token.raw))}</code>`);
  }

  if (Object.keys(token.extensions).length > 0) {
    append(lines, `  - Extensions: <code>${escapeHtml(formatValue(token.extensions))}</code>`);
  }

  if (token.deprecated !== undefined) {
    append(lines, `  - Deprecated: <code>${escapeHtml(formatValue(token.deprecated))}</code>`);
  }

  if (token.references.length > 0) {
    append(
      lines,
      `  - References: <code>${escapeHtml(
        formatPointerListWithLimit(token.references, pointerLimit),
      )}</code>`,
    );
  }

  if (token.resolutionPath.length > 0) {
    append(
      lines,
      `  - Resolution path: <code>${escapeHtml(
        formatPointerListWithLimit(token.resolutionPath, pointerLimit),
      )}</code>`,
    );
  }

  if (token.appliedAliases.length > 0) {
    append(
      lines,
      `  - Applied aliases: <code>${escapeHtml(
        formatPointerListWithLimit(token.appliedAliases, pointerLimit),
      )}</code>`,
    );
  }

  return lines;
}

function collectMarkdownRenameDetails(entry: TokenRename, pointerLimit: number): readonly string[] {
  const lines: string[] = [];
  const previousDetails = collectMarkdownSnapshotDetails(entry.previous, pointerLimit);
  const nextDetails = collectMarkdownSnapshotDetails(entry.next, pointerLimit);

  if (previousDetails.length > 0) {
    append(lines, '  - Previous snapshot:');
    append(lines, ...indentMarkdownLines(previousDetails, '  '));
  }

  if (nextDetails.length > 0) {
    append(lines, '  - Next snapshot:');
    append(lines, ...indentMarkdownLines(nextDetails, '  '));
  }

  return lines;
}

function collectMarkdownModificationDetails(
  entry: TokenModification,
  pointerLimit: number,
): readonly string[] {
  const lines: string[] = [];
  const previousDetails = collectMarkdownSnapshotDetails(entry.previous, pointerLimit);
  const nextDetails = collectMarkdownSnapshotDetails(entry.next, pointerLimit);

  if (previousDetails.length === 0 && nextDetails.length === 0) {
    return lines;
  }

  append(lines, '  - Snapshot details:');

  if (previousDetails.length > 0) {
    append(lines, '    - Previous:');
    append(lines, ...indentMarkdownLines(previousDetails, '    '));
  }

  if (nextDetails.length > 0) {
    append(lines, '    - Next:');
    append(lines, ...indentMarkdownLines(nextDetails, '    '));
  }

  return lines;
}

function indentMarkdownLines(lines: readonly string[], prefix: string): readonly string[] {
  return lines.map((line) => `${prefix}${line}`);
}

function getMarkdownColorSpan(token: TokenSnapshot): string | undefined {
  const color = getTokenColor(token);

  if (!color) {
    return undefined;
  }

  return renderMarkdownColorSpan(color);
}

interface MarkdownTypographySample {
  readonly sample: string;
  readonly caption: string;
  readonly labeled: string;
}

function collectMarkdownTokenDecorations(token: TokenSnapshot): string {
  const parts: string[] = [];
  const swatch = getMarkdownColorSpan(token);

  if (swatch) {
    append(parts, swatch);
  }

  const typography = getMarkdownTypographySample(token);

  if (typography) {
    append(parts, typography.labeled);
  }

  return parts.join(' ');
}

function getMarkdownTypographySample(token: TokenSnapshot): MarkdownTypographySample | undefined {
  const preview = getTypographyPreview(token);

  if (!preview) {
    return undefined;
  }

  const style = formatMarkdownTypographyStyle(preview);
  const label = escapeHtml(preview.label);
  const sample = `<span style="${style}" aria-label="${label}" title="${label}">Ag</span>`;
  const caption = `<span style="font-size:0.75em;margin-left:0.35rem;">${label}</span>`;

  return {
    sample,
    caption,
    labeled: `${sample} ${caption}`,
  };
}

function formatMarkdownTypographyStyle(preview: TypographyPreview): string {
  const provided = new Set(preview.declarations.map((declaration) => declaration.name));
  const extras: CssDeclaration[] = [
    { name: 'display', value: 'inline-block' },
    { name: 'padding', value: '0.15rem 0.4rem' },
    { name: 'border', value: '1px solid currentColor' },
    { name: 'border-radius', value: '0.5rem' },
  ];

  if (!provided.has('line-height')) {
    append(extras, { name: 'line-height', value: '1' });
  }

  const declarations = [...extras, ...preview.declarations];
  const style = declarations
    .map((declaration) => `${declaration.name}:${declaration.value}`)
    .join(';');

  return `${escapeAttributeValue(style)};`;
}

function renderMarkdownColorComparison(
  previous: TokenSnapshot,
  next: TokenSnapshot,
): string | undefined {
  const previousSpan = getMarkdownColorSpan(previous);
  const nextSpan = getMarkdownColorSpan(next);

  if (!previousSpan || !nextSpan) {
    return undefined;
  }

  return `Swatch: ${previousSpan} → ${nextSpan}`;
}

function renderMarkdownTypographyComparison(
  previous: TokenSnapshot,
  next: TokenSnapshot,
): string | undefined {
  const previousSample = getMarkdownTypographySample(previous);
  const nextSample = getMarkdownTypographySample(next);

  if (!previousSample || !nextSample) {
    return undefined;
  }

  return `Typography: ${previousSample.labeled} → ${nextSample.labeled}`;
}

function renderMarkdownColorSpan(color: TokenColor): string {
  const style = [
    'display:inline-block',
    'width:0.75rem',
    'height:0.75rem',
    'border-radius:0.25rem',
    'border:1px solid #d0d7de',
    'vertical-align:middle',
    'margin-left:0.5rem',
    `background:${formatCssColor(color)}`,
  ].join(';');

  const label = formatColorLabel(color);
  const escapedLabel = escapeHtml(label);

  return `<span style="${style};" aria-label="${escapedLabel}" title="${escapedLabel}"></span>`;
}

function formatMarkdownImpact(impact: TokenAddition['impact']): string {
  if (impact === 'breaking') {
    return ' (**breaking**)';
  }

  return ' (_non-breaking_)';
}

function escapeAttributeValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

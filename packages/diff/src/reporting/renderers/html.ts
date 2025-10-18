import { readFileSync } from 'node:fs';

import Handlebars from 'handlebars';

import type {
  TokenAddition,
  TokenDiffGroupSummary,
  TokenDiffResult,
  TokenDiffSummary,
  TokenDiffTypeSummary,
  TokenModification,
  TokenRemoval,
  TokenRename,
  VersionBump,
} from '../../diff.js';
import type { ReportRendererContext } from '../../application/ports/reporting.js';
import type { TokenPointer, TokenSnapshot } from '../../token-set.js';
import { append } from '../../utils/append.js';
import type { TokenColor, TypographyPreview } from '../formatting.js';
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
  createReportDescriptor,
  type ReportGroupSection,
  type ReportHotspot,
  type ReportRiskItem,
  type ReportSummaryView,
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
import {
  describeRunComparison,
  formatRunDuration,
  formatRunTimestamp,
  type ReportRunContext,
} from '../run-context.js';

export interface HtmlFormatterOptions {
  readonly mode?: 'full' | 'summary' | 'condensed' | 'detailed';
  readonly topRisks?: number;
  readonly showWhy?: boolean;
  readonly diffContext?: number;
  readonly runContext?: ReportRunContext;
}

interface HtmlRuntime {
  readonly includeWhy: boolean;
  readonly pointerLimit: number;
  readonly mode: 'full' | 'summary' | 'condensed' | 'detailed';
}

interface HtmlSectionDescriptor {
  readonly id: string;
  readonly title: string;
  readonly markup: string;
  readonly count: number;
  readonly summary?: string;
}

interface HtmlHeaderContext {
  readonly comparison?: string;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly startedAt?: string;
  readonly duration?: string;
}

interface HtmlNavigationItem {
  readonly href: string;
  readonly title: string;
  readonly meta: string;
}

interface HtmlNavigationDescriptor {
  readonly id: string;
  readonly title: string;
  readonly count: number;
  readonly summary?: string;
  readonly visible: boolean;
}

interface SummarySectionModel {
  readonly attributes: {
    readonly totalPrevious: number;
    readonly totalNext: number;
  };
  readonly totals: {
    readonly previous: string;
    readonly next: string;
  };
  readonly delta: {
    readonly label: string;
    readonly modifier: string;
  };
  readonly counts: readonly SummaryCountModel[];
  readonly meta: SummaryMetaModel;
  readonly typeBreakdown?: ChangeTableViewModel;
  readonly groupBreakdown?: ChangeTableViewModel;
}

interface SummaryCountModel {
  readonly label: string;
  readonly value: string | number;
  readonly modifier: string;
}

interface SummaryMetaModel {
  readonly comparison?: string;
  readonly startedAt?: string;
  readonly duration?: string;
  readonly impact: string;
  readonly changes: string;
  readonly changeMix: string;
  readonly typeHotspots: readonly string[];
  readonly groupHotspots: readonly string[];
}

interface ChangeTableViewModel {
  readonly caption: string;
  readonly headerLabel: string;
  readonly columns: readonly ChangeTableColumn[];
  readonly rows: readonly ChangeTableRow[];
}

interface ChangeTableColumn {
  readonly label: string;
}

interface ChangeTableRow {
  readonly header: string;
  readonly cells: readonly string[];
}

interface HtmlTemplateContext {
  readonly styles: string;
  readonly header: HtmlHeaderContext;
  readonly showNavigation: boolean;
  readonly navigation: readonly HtmlNavigationItem[];
  readonly summary: SummarySectionModel;
  readonly sections: readonly HtmlSectionDescriptor[];
}

const DEFAULT_TOP_RISKS_LIMIT = 10;
const DEFAULT_DIFF_CONTEXT = 3;
const MAX_TOP_RISKS = 50;
const HOTSPOT_LIMIT = 4;
const TYPE_OPERATION_ORDER = ['changed', 'removed', 'added', 'renamed'] as const;
type TypeOperationKey = (typeof TYPE_OPERATION_ORDER)[number];
const TYPE_OPERATION_LABELS: Record<TypeOperationKey, string> = {
  changed: 'Changed',
  removed: 'Removed',
  added: 'Added',
  renamed: 'Renamed',
};
const TYPE_OPERATION_ACTIONS: Record<TypeOperationKey, string> = {
  changed: 'updated',
  removed: 'removed',
  added: 'added',
  renamed: 'renamed',
};

const TEMPLATE_ROOT = new URL('../templates/', import.meta.url);

let cachedTemplate: Handlebars.TemplateDelegate<HtmlTemplateContext> | undefined;

function getHtmlTemplate(): Handlebars.TemplateDelegate<HtmlTemplateContext> {
  cachedTemplate ??= compileHtmlTemplate();
  return cachedTemplate;
}

function compileHtmlTemplate(): Handlebars.TemplateDelegate<HtmlTemplateContext> {
  const environment = Handlebars.create();
  registerHtmlPartials(environment);

  return environment.compile<HtmlTemplateContext>(readTemplateAsset('diff-report.hbs'), {
    strict: true,
  });
}

function registerHtmlPartials(environment: typeof Handlebars): void {
  environment.registerPartial('summary-section', readTemplateAsset('partials/summary-section.hbs'));
  environment.registerPartial('summary-card', readTemplateAsset('partials/summary-card.hbs'));
  environment.registerPartial('change-table', readTemplateAsset('partials/change-table.hbs'));
}

function readTemplateAsset(relativePath: string): string {
  return readFileSync(new URL(relativePath, TEMPLATE_ROOT), 'utf8');
}

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

/**
 * Renders a diff as an embeddable HTML document with optional sections for
 * risks, changes, and metadata.
 *
 * @param diff - The diff result to render.
 * @param options - Formatter options controlling layout and verbosity.
 * @param _context - Unused renderer context placeholder for API parity.
 * @returns The HTML representation of the diff.
 */
export function formatDiffAsHtml(
  diff: TokenDiffResult,
  options: HtmlFormatterOptions = {},
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
  const runtime: HtmlRuntime = {
    includeWhy,
    pointerLimit,
    mode,
  };
  const report = createReportDescriptor(diff, { topRiskLimit });
  const runContext = options.runContext;
  const summarySection = createSummarySectionModel(report.summary, diff, runContext);
  const sections: HtmlSectionDescriptor[] = [];
  const navigationDescriptors: HtmlNavigationDescriptor[] = [
    {
      id: 'summary',
      title: 'Executive summary',
      count: diff.summary.totalNext,
      summary: formatSummaryNavLabel(diff.summary),
      visible: true,
    },
  ];

  if (mode !== 'summary') {
    if (mode !== 'condensed') {
      const riskMarkup = renderTopRisksSection(report.topRisks, runtime);

      if (riskMarkup.length > 0) {
        const descriptor: HtmlSectionDescriptor = {
          id: 'top-risks',
          title: 'Top risks',
          markup: riskMarkup,
          count: report.topRisks.length,
          summary: formatTokenCountLabel(report.topRisks.length, 'items'),
        };
        append(sections, descriptor);
        append(navigationDescriptors, createNavigationDescriptor(descriptor));
      }
    }

    for (const descriptor of buildTypeSectionDescriptors(report.typeSections, runtime)) {
      append(sections, descriptor);
      append(navigationDescriptors, createNavigationDescriptor(descriptor));
    }
  }

  const navigation = createNavigationItems(navigationDescriptors);
  const visibleSections = sections.filter((section) => section.markup.trim().length > 0);
  const previousLabel = formatTokenCountLabel(diff.summary.totalPrevious);
  const nextLabel = formatTokenCountLabel(diff.summary.totalNext);
  const comparison = describeRunComparison(runContext);
  const startedAt = formatRunTimestamp(runContext);
  const duration = formatRunDuration(runContext);
  const header: HtmlHeaderContext = {
    previousLabel,
    nextLabel,
    ...(comparison ? { comparison } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(duration ? { duration } : {}),
  };

  return getHtmlTemplate()({
    styles: STYLES.trim(),
    header,
    showNavigation: navigation.length > 0,
    navigation,
    summary: summarySection,
    sections: visibleSections,
  });
}
function createSummarySectionModel(
  summary: ReportSummaryView,
  diff: TokenDiffResult,
  context: ReportRunContext | undefined,
): SummarySectionModel {
  const counts: SummaryCountModel[] = [
    { label: 'Breaking', value: summary.impact.breaking, modifier: 'breaking' },
    { label: 'Non-breaking', value: summary.impact.nonBreaking, modifier: 'non-breaking' },
    { label: 'Added', value: summary.operations.added, modifier: 'added' },
    { label: 'Changed', value: summary.operations.changed, modifier: 'changed' },
    { label: 'Removed', value: summary.operations.removed, modifier: 'removed' },
    { label: 'Renamed', value: summary.operations.renamed, modifier: 'renamed' },
    { label: 'Value changes', value: summary.changeMix.valueChanged, modifier: 'value-changed' },
    {
      label: 'Metadata changes',
      value: summary.changeMix.metadataChanged,
      modifier: 'metadata-changed',
    },
  ];

  const bumpSummary = formatVersionBumpSummary(diff.summary.recommendedBump);
  counts.unshift({
    label: 'Recommended bump',
    value: bumpSummary.label,
    modifier: bumpSummary.modifier,
  });

  const { label: deltaLabel, modifier: deltaModifier } = formatDeltaLabel(
    diff.summary.totalNext - diff.summary.totalPrevious,
  );

  const comparison = describeRunComparison(context);
  const startedAt = formatRunTimestamp(context);
  const duration = formatRunDuration(context);

  const meta: SummaryMetaModel = {
    impact: formatImpactSummaryText(summary.impact),
    changes: formatOperationSummaryText(summary.operations),
    changeMix: formatChangeMixText(summary.changeMix),
    typeHotspots: collectHotspotLabels(summary.typeHotspots),
    groupHotspots: collectHotspotLabels(summary.groupHotspots),
    ...(comparison ? { comparison } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(duration ? { duration } : {}),
  };

  const typeBreakdown = createTypeSummaryTable(diff.summary.types);
  const groupBreakdown = createGroupSummaryTable(diff.summary.groups);

  return {
    attributes: {
      totalPrevious: diff.summary.totalPrevious,
      totalNext: diff.summary.totalNext,
    },
    totals: {
      previous: diff.summary.totalPrevious.toString(),
      next: diff.summary.totalNext.toString(),
    },
    delta: {
      label: deltaLabel,
      modifier: deltaModifier,
    },
    counts,
    meta,
    ...(typeBreakdown ? { typeBreakdown } : {}),
    ...(groupBreakdown ? { groupBreakdown } : {}),
  };
}

function createTypeSummaryTable(
  summaries: readonly TokenDiffTypeSummary[],
): ChangeTableViewModel | undefined {
  if (summaries.length === 0) {
    return undefined;
  }

  return {
    caption: 'Diff by token type',
    headerLabel: 'Type',
    columns: [
      { label: 'Previous' },
      { label: 'Next' },
      { label: 'Added' },
      { label: 'Removed' },
      { label: 'Renamed' },
      { label: 'Changed' },
      { label: 'Value changes' },
      { label: 'Metadata changes' },
      { label: 'Unchanged' },
      { label: 'Breaking' },
      { label: 'Non-breaking' },
    ],
    rows: summaries.map((summary) => ({
      header: summary.type,
      cells: [
        String(summary.totalPrevious),
        String(summary.totalNext),
        String(summary.added),
        String(summary.removed),
        String(summary.renamed),
        String(summary.changed),
        String(summary.valueChanged),
        String(summary.metadataChanged),
        String(summary.unchanged),
        String(summary.breaking),
        String(summary.nonBreaking),
      ],
    })),
  };
}

function createGroupSummaryTable(
  summaries: readonly TokenDiffGroupSummary[],
): ChangeTableViewModel | undefined {
  if (summaries.length === 0) {
    return undefined;
  }

  return {
    caption: 'Diff by token group',
    headerLabel: 'Group',
    columns: [
      { label: 'Previous' },
      { label: 'Next' },
      { label: 'Added' },
      { label: 'Removed' },
      { label: 'Renamed' },
      { label: 'Changed' },
      { label: 'Value changes' },
      { label: 'Metadata changes' },
      { label: 'Unchanged' },
      { label: 'Breaking' },
      { label: 'Non-breaking' },
    ],
    rows: summaries.map((summary) => ({
      header: summary.group,
      cells: [
        String(summary.totalPrevious),
        String(summary.totalNext),
        String(summary.added),
        String(summary.removed),
        String(summary.renamed),
        String(summary.changed),
        String(summary.valueChanged),
        String(summary.metadataChanged),
        String(summary.unchanged),
        String(summary.breaking),
        String(summary.nonBreaking),
      ],
    })),
  };
}

function createNavigationDescriptor(section: HtmlSectionDescriptor): HtmlNavigationDescriptor {
  const visible = section.markup.trim().length > 0;

  return {
    id: section.id,
    title: section.title,
    count: section.count,
    ...(section.summary ? { summary: section.summary } : {}),
    visible,
  };
}

function createNavigationItems(
  descriptors: readonly HtmlNavigationDescriptor[],
): readonly HtmlNavigationItem[] {
  const visible = descriptors.filter((descriptor) => descriptor.visible);

  if (visible.length <= 1) {
    return [];
  }

  return visible.map((descriptor) => ({
    href: `#${descriptor.id}`,
    title: descriptor.title,
    meta: descriptor.summary ?? formatTokenCountLabel(descriptor.count),
  }));
}

function formatImpactSummaryText(impact: ReportSummaryView['impact']): string {
  const parts = [
    `${String(impact.breaking)} ${impact.breaking === 1 ? 'breaking change' : 'breaking changes'}`,
    `${String(impact.nonBreaking)} ${impact.nonBreaking === 1 ? 'non-breaking change' : 'non-breaking changes'}`,
  ];
  return parts.join(', ');
}

function formatOperationSummaryText(operations: ReportSummaryView['operations']): string {
  const parts: string[] = [];

  if (operations.changed > 0) {
    append(parts, `${String(operations.changed)} changed`);
  }

  if (operations.removed > 0) {
    append(parts, `${String(operations.removed)} removed`);
  }

  if (operations.added > 0) {
    append(parts, `${String(operations.added)} added`);
  }

  if (operations.renamed > 0) {
    append(parts, `${String(operations.renamed)} renamed`);
  }

  return parts.length > 0 ? parts.join(', ') : 'No changes recorded';
}

function formatChangeMixText(changeMix: ReportSummaryView['changeMix']): string {
  const parts: string[] = [];

  if (changeMix.valueChanged > 0) {
    append(parts, `${String(changeMix.valueChanged)} value changes`);
  }

  if (changeMix.metadataChanged > 0) {
    append(parts, `${String(changeMix.metadataChanged)} metadata changes`);
  }

  return parts.length > 0 ? parts.join(', ') : 'No value or metadata changes';
}

function collectHotspotLabels(hotspots: readonly ReportHotspot[]): readonly string[] {
  return hotspots.slice(0, HOTSPOT_LIMIT).map((hotspot) => {
    const parts = [`${String(hotspot.changes)} ${hotspot.changes === 1 ? 'change' : 'changes'}`];

    if (hotspot.breaking > 0) {
      append(parts, `${String(hotspot.breaking)} breaking`);
    } else if (hotspot.nonBreaking > 0) {
      append(parts, `${String(hotspot.nonBreaking)} non-breaking`);
    }

    return `${hotspot.label} (${parts.join(', ')})`;
  });
}

function formatVersionBumpSummary(bump: VersionBump): {
  readonly label: string;
  readonly modifier: string;
} {
  let label: string;

  switch (bump) {
    case 'none': {
      label = 'None';
      break;
    }
    case 'patch': {
      label = 'Patch';
      break;
    }
    case 'minor': {
      label = 'Minor';
      break;
    }
    default: {
      label = 'Major';
      break;
    }
  }

  return { label, modifier: `version-bump-${bump}` };
}

function buildTypeSectionDescriptors(
  sections: readonly ReportTypeSection[],
  runtime: HtmlRuntime,
): HtmlSectionDescriptor[] {
  const descriptors: HtmlSectionDescriptor[] = [];

  for (const section of sections) {
    if (!sectionHasEntries(section)) {
      continue;
    }

    const id = `type-${escapeAttribute(section.key)}`;
    const markup = renderTypeSection(section, runtime, id);
    const total =
      section.counts.added +
      section.counts.changed +
      section.counts.removed +
      section.counts.renamed;

    append(descriptors, {
      id,
      title: section.label,
      markup,
      count: total,
      summary: formatTypeSectionSummary(section),
    });
  }

  return descriptors;
}

function sectionHasEntries(section: ReportTypeSection): boolean {
  const { counts } = section;
  return counts.added > 0 || counts.changed > 0 || counts.removed > 0 || counts.renamed > 0;
}

function renderTypeSection(
  section: ReportTypeSection,
  runtime: HtmlRuntime,
  sectionId: string,
): string {
  const total =
    section.counts.added + section.counts.changed + section.counts.removed + section.counts.renamed;
  const subtitle = formatTypeSectionSummary(section);
  const normalizedKey = escapeAttribute(section.key);
  const lines = [
    `<section id="${sectionId}" class="dtifx-diff__section dtifx-diff__section--type" data-kind="${normalizedKey}" data-count="${escapeAttributeValue(String(total))}">`,
    '  <header class="dtifx-diff__section-header">',
    `    <h2>${escapeHtml(section.label)}</h2>`,
    `    <p class="dtifx-diff__section-subtitle">${escapeHtml(subtitle)}</p>`,
    '  </header>',
    '  <div class="dtifx-diff__section-body dtifx-diff__section-body--type">',
  ];

  const groups = section.groups.filter((group) => groupHasEntries(group));

  if (groups.length > 0) {
    for (const group of groups) {
      const block = renderGroupSection(group, runtime);

      if (block.length > 0) {
        append(lines, indent(block, 2));
      }
    }
  } else {
    const blocks = renderOperationBlocks(section.operations, runtime);

    for (const block of blocks) {
      append(lines, indent(block, 2));
    }
  }

  append(lines, '  </div>');
  append(lines, '</section>');

  return lines.join('\n');
}

function groupHasEntries(section: ReportGroupSection): boolean {
  const { counts } = section;
  return counts.added > 0 || counts.changed > 0 || counts.removed > 0 || counts.renamed > 0;
}

function formatTypeSectionSummary(section: ReportTypeSection): string {
  const total =
    section.counts.added + section.counts.changed + section.counts.removed + section.counts.renamed;
  const changeLabel = total === 1 ? 'change' : 'changes';
  const parts: string[] = [];

  if (section.counts.changed > 0) {
    append(parts, `${String(section.counts.changed)} changed`);
  }

  if (section.counts.removed > 0) {
    append(parts, `${String(section.counts.removed)} removed`);
  }

  if (section.counts.added > 0) {
    append(parts, `${String(section.counts.added)} added`);
  }

  if (section.counts.renamed > 0) {
    append(parts, `${String(section.counts.renamed)} renamed`);
  }

  const suffix = parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
  return `${String(total)} ${changeLabel}${suffix}`;
}

function formatGroupSectionSummary(section: ReportGroupSection): string {
  const total =
    section.counts.added + section.counts.changed + section.counts.removed + section.counts.renamed;
  const changeLabel = total === 1 ? 'change' : 'changes';
  const parts: string[] = [];

  if (section.counts.changed > 0) {
    append(parts, `${String(section.counts.changed)} changed`);
  }

  if (section.counts.removed > 0) {
    append(parts, `${String(section.counts.removed)} removed`);
  }

  if (section.counts.added > 0) {
    append(parts, `${String(section.counts.added)} added`);
  }

  if (section.counts.renamed > 0) {
    append(parts, `${String(section.counts.renamed)} renamed`);
  }

  const suffix = parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
  return `${String(total)} ${changeLabel}${suffix}`;
}

function renderTypeOperationBlock(
  key: TypeOperationKey,
  entries: readonly ReportTypeSection['operations'][TypeOperationKey][number][],
  runtime: HtmlRuntime,
): string {
  if (entries.length === 0) {
    return '';
  }

  switch (key) {
    case 'added': {
      return renderAdditionBlock(entries as readonly TokenAddition[], runtime);
    }
    case 'removed': {
      return renderRemovalBlock(entries as readonly TokenRemoval[], runtime);
    }
    case 'renamed': {
      return renderRenameBlock(entries as readonly TokenRename[], runtime);
    }
    case 'changed': {
      return renderModificationBlock(entries as readonly TokenModification[], runtime);
    }
    default: {
      return '';
    }
  }
}

function renderGroupSection(section: ReportGroupSection, runtime: HtmlRuntime): string {
  const blocks = renderOperationBlocks(section.operations, runtime);

  if (blocks.length === 0) {
    return '';
  }

  const total =
    section.counts.added + section.counts.changed + section.counts.removed + section.counts.renamed;
  const normalizedKey = escapeAttribute(section.key);
  const lines = [
    `<div class="dtifx-diff__group" data-group="${normalizedKey}" data-count="${escapeAttributeValue(String(total))}">`,
    '  <div class="dtifx-diff__group-header">',
    `    <h3 class="dtifx-diff__group-title">${escapeHtml(formatGroupLabel(section.label))}</h3>`,
    `    <p class="dtifx-diff__group-meta">${escapeHtml(formatGroupSectionSummary(section))}</p>`,
    '  </div>',
    '  <div class="dtifx-diff__group-body">',
  ];

  for (const block of blocks) {
    append(lines, indent(block, 4));
  }

  append(lines, '  </div>');
  append(lines, '</div>');

  return lines.join('\n');
}

function renderOperationBlocks(
  operations: ReportTypeOperations,
  runtime: HtmlRuntime,
): readonly string[] {
  const blocks: string[] = [];

  for (const key of TYPE_OPERATION_ORDER) {
    const entries = operations[key];
    const block = renderTypeOperationBlock(key, entries, runtime);

    if (block.length > 0) {
      append(blocks, block);
    }
  }

  return blocks;
}

function formatGroupLabel(label: string): string {
  if (label === 'root') {
    return 'root';
  }

  return label;
}

function renderAdditionBlock(entries: readonly TokenAddition[], runtime: HtmlRuntime): string {
  const summary = summarizeImpacts(entries, (entry) => entry.impact, TYPE_OPERATION_ACTIONS.added);
  const listLines = ['<ul class="dtifx-diff__list">'];

  for (const entry of entries) {
    append(listLines, indent(renderAddedListItem(entry, runtime), 2));
  }

  append(listLines, '</ul>');

  return renderTypeOperationContainer(
    'added',
    TYPE_OPERATION_LABELS.added,
    entries.length,
    summary.subtitle,
    listLines.join('\n'),
  );
}

function renderRemovalBlock(entries: readonly TokenRemoval[], runtime: HtmlRuntime): string {
  const summary = summarizeImpacts(
    entries,
    (entry) => entry.impact,
    TYPE_OPERATION_ACTIONS.removed,
  );
  const listLines = ['<ul class="dtifx-diff__list">'];

  for (const entry of entries) {
    append(listLines, indent(renderRemovedListItem(entry, runtime), 2));
  }

  append(listLines, '</ul>');

  return renderTypeOperationContainer(
    'removed',
    TYPE_OPERATION_LABELS.removed,
    entries.length,
    summary.subtitle,
    listLines.join('\n'),
  );
}

function renderRenameBlock(entries: readonly TokenRename[], runtime: HtmlRuntime): string {
  const summary = summarizeImpacts(
    entries,
    (entry) => entry.impact,
    TYPE_OPERATION_ACTIONS.renamed,
  );
  const listLines = ['<ul class="dtifx-diff__list">'];

  for (const entry of entries) {
    append(listLines, indent(renderRenamedListItem(entry, runtime), 2));
  }

  append(listLines, '</ul>');

  return renderTypeOperationContainer(
    'renamed',
    TYPE_OPERATION_LABELS.renamed,
    entries.length,
    summary.subtitle,
    listLines.join('\n'),
  );
}

function renderModificationBlock(
  entries: readonly TokenModification[],
  runtime: HtmlRuntime,
): string {
  const summary = summarizeImpacts(
    entries,
    (entry) => entry.impact,
    TYPE_OPERATION_ACTIONS.changed,
  );
  const articles = entries.map((entry) => indent(renderModificationArticle(entry, runtime), 2));
  const body = articles.join('\n\n');

  return renderTypeOperationContainer(
    'changed',
    TYPE_OPERATION_LABELS.changed,
    entries.length,
    summary.subtitle,
    body,
    {
      bodyClass: 'dtifx-diff__type-operation-body dtifx-diff__type-operation-body--changes',
    },
  );
}

function renderTypeOperationContainer(
  key: TypeOperationKey,
  heading: string,
  count: number,
  subtitle: string,
  body: string,
  options?: { readonly bodyClass?: string },
): string {
  const bodyClass = options?.bodyClass ?? 'dtifx-diff__type-operation-body';
  const lines = [
    `<section class="dtifx-diff__type-operation dtifx-diff__type-operation--${escapeAttribute(key)}" data-operation="${escapeAttribute(key)}" data-count="${escapeAttributeValue(String(count))}">`,
    '  <header class="dtifx-diff__type-operation-header">',
    `    <h3>${escapeHtml(`${heading} (${String(count)})`)}</h3>`,
  ];

  if (subtitle.length > 0) {
    append(lines, `    <p class="dtifx-diff__type-operation-subtitle">${escapeHtml(subtitle)}</p>`);
  }

  append(lines, '  </header>');
  append(lines, `  <div class="${bodyClass}">`);
  append(lines, indent(body, 4));
  append(lines, '  </div>');
  append(lines, '</section>');

  return lines.join('\n');
}

function renderAddedListItem(entry: TokenAddition, runtime: HtmlRuntime): string {
  const summaryValue = escapeHtml(formatTokenValueForSummary(entry.next));
  const details = collectHtmlDetails(entry.next, entry.impact);
  const guidance = describeAddition(entry);
  const lines = [
    '<li class="dtifx-diff__list-item dtifx-diff__list-item--added">',
    `  <div class="dtifx-diff__item-row"><code>${escapeHtml(entry.id)}</code> = <code>${summaryValue}</code>${details}</div>`,
  ];

  append(lines, indent(renderHtmlGuidanceBlock(guidance, runtime.includeWhy), 2));

  if (runtime.mode === 'detailed') {
    const extra = renderHtmlTokenDetails(entry.next, runtime.pointerLimit);

    if (extra) {
      append(lines, indent(extra, 2));
    }
  }

  append(lines, '</li>');
  return lines.join('\n');
}

function renderRemovedListItem(entry: TokenRemoval, runtime: HtmlRuntime): string {
  const summaryValue = escapeHtml(formatTokenValueForSummary(entry.previous));
  const details = collectHtmlDetails(entry.previous, entry.impact);
  const guidance = describeRemoval(entry);
  const lines = [
    '<li class="dtifx-diff__list-item dtifx-diff__list-item--removed">',
    `  <div class="dtifx-diff__item-row"><code>${escapeHtml(entry.id)}</code> (was <code>${summaryValue}</code>)${details}</div>`,
  ];

  append(lines, indent(renderHtmlGuidanceBlock(guidance, runtime.includeWhy), 2));

  if (runtime.mode === 'detailed') {
    const extra = renderHtmlTokenDetails(entry.previous, runtime.pointerLimit);

    if (extra) {
      append(lines, indent(extra, 2));
    }
  }

  append(lines, '</li>');
  return lines.join('\n');
}

function renderRenamedListItem(entry: TokenRename, runtime: HtmlRuntime): string {
  const summaryValue = escapeHtml(formatTokenValueForSummary(entry.next));
  const details = collectHtmlDetails(entry.next, entry.impact);
  const guidance = describeRename(entry);
  const lines = [
    '<li class="dtifx-diff__list-item dtifx-diff__list-item--renamed">',
    `  <div class="dtifx-diff__item-row"><code>${escapeHtml(entry.previousId)}</code> → <code>${escapeHtml(entry.nextId)}</code> = <code>${summaryValue}</code>${details}</div>`,
  ];

  append(lines, indent(renderHtmlGuidanceBlock(guidance, runtime.includeWhy), 2));

  if (runtime.mode === 'detailed') {
    const extra = renderHtmlSnapshotColumns(
      [
        { title: 'Previous snapshot', token: entry.previous },
        { title: 'Next snapshot', token: entry.next },
      ],
      runtime.pointerLimit,
    );

    if (extra) {
      append(lines, indent(extra, 2));
    }
  }

  append(lines, '</li>');
  return lines.join('\n');
}

function renderModificationArticle(entry: TokenModification, runtime: HtmlRuntime): string {
  const guidance = describeModification(entry);
  const lines = [
    '<article class="dtifx-diff__change">',
    `  <h4><code>${escapeHtml(entry.id)}</code> ${renderHtmlImpact(entry.impact)}</h4>`,
    indent(
      renderHtmlGuidanceBlock(guidance, runtime.includeWhy, {
        title: guidance.title,
      }),
      2,
    ),
    '  <dl class="dtifx-diff__fields">',
  ];

  for (const field of entry.changes) {
    append(
      lines,
      indent(renderFieldChange(field, entry.previous, entry.next, runtime.pointerLimit), 4),
    );
  }

  append(lines, '  </dl>');

  if (runtime.mode === 'detailed') {
    const extra = renderHtmlSnapshotColumns(
      [
        { title: 'Previous snapshot', token: entry.previous },
        { title: 'Next snapshot', token: entry.next },
      ],
      runtime.pointerLimit,
    );

    if (extra) {
      append(lines, indent(extra, 2));
    }
  }

  append(lines, '</article>');
  return lines.join('\n');
}

function renderTopRisksSection(risks: readonly ReportRiskItem[], runtime: HtmlRuntime): string {
  if (risks.length === 0) {
    return '';
  }

  const lines = [
    `<section id="top-risks" class="dtifx-diff__section dtifx-diff__section--risks" data-count="${escapeAttributeValue(String(risks.length))}">`,
    '  <header class="dtifx-diff__section-header">',
    '    <h2>Top risks</h2>',
    '    <p class="dtifx-diff__section-subtitle">Highest priority changes ranked by impact.</p>',
    '  </header>',
    '  <div class="dtifx-diff__section-body dtifx-diff__section-body--risks">',
    '    <ol class="dtifx-diff__risk-list">',
  ];

  for (const risk of risks) {
    append(lines, indent(renderRiskListItem(risk, runtime), 6));
  }

  append(lines, '    </ol>');
  append(lines, '  </div>');
  append(lines, '</section>');

  return lines.join('\n');
}

function renderRiskListItem(risk: ReportRiskItem, runtime: HtmlRuntime): string {
  const impactModifier = risk.impact === 'breaking' ? 'breaking' : 'non-breaking';
  const impactLabel = risk.impact === 'breaking' ? 'Breaking' : 'Non-breaking';
  const kindLabel = formatRiskKindLabel(risk.kind);
  const lines = [
    `<li class="dtifx-diff__risk dtifx-diff__risk--${escapeAttribute(impactModifier)}" data-kind="${escapeAttribute(risk.kind)}" data-score="${escapeAttributeValue(String(risk.score))}">`,
    '  <header class="dtifx-diff__risk-header">',
    `    <span class="dtifx-diff__risk-kind">${escapeHtml(kindLabel)}</span>`,
    `    <span class="dtifx-diff__risk-impact">${escapeHtml(impactLabel)}</span>`,
    '  </header>',
    `  <p class="dtifx-diff__risk-path"><code>${escapeHtml(risk.labelPath)}</code> • ${escapeHtml(risk.typeLabel)}</p>`,
    `  <p class="dtifx-diff__risk-title">${escapeHtml(risk.title)}</p>`,
    `  <p class="dtifx-diff__risk-impact-summary">${escapeHtml(risk.impactSummary)}</p>`,
    `  <p class="dtifx-diff__risk-next"><strong>Next:</strong> ${escapeHtml(risk.nextStep)}</p>`,
  ];

  if (runtime.includeWhy) {
    lines.splice(6, 0, `  <p class="dtifx-diff__risk-why">${escapeHtml(risk.why)}</p>`);
  }

  if (risk.changedFields && risk.changedFields.length > 0) {
    append(lines, '  <div class="dtifx-diff__risk-fields">');
    append(lines, '    <span class="dtifx-diff__text-muted">Changed fields:</span>');
    append(lines, '    <ul>');

    for (const field of risk.changedFields) {
      append(lines, `      <li>${escapeHtml(field)}</li>`);
    }

    append(lines, '    </ul>');
    append(lines, '  </div>');
  }

  const tokenRefs: string[] = [];

  if (risk.tokens.previous) {
    append(tokenRefs, `Previous: <code>${escapeHtml(risk.tokens.previous)}</code>`);
  }

  if (risk.tokens.next) {
    append(tokenRefs, `Next: <code>${escapeHtml(risk.tokens.next)}</code>`);
  }

  if (tokenRefs.length > 0) {
    append(lines, `  <p class="dtifx-diff__risk-tokens">${tokenRefs.join(' • ')}</p>`);
  }

  append(lines, '</li>');
  return lines.join('\n');
}

function formatRiskKindLabel(kind: ReportRiskItem['kind']): string {
  switch (kind) {
    case 'added': {
      return 'Addition';
    }
    case 'removed': {
      return 'Removal';
    }
    case 'renamed': {
      return 'Rename';
    }
    case 'changed': {
      return 'Modification';
    }
  }
}

const FIELD_RENDERERS: Record<
  TokenModification['changes'][number],
  (previous: TokenSnapshot, next: TokenSnapshot, pointerLimit: number) => string
> = {
  value: (previous, next) => {
    const previousValue = escapeHtml(formatValue(previous.value));
    const nextValue = escapeHtml(formatValue(next.value));
    const comparison = renderHtmlColorComparison(previous, next);
    const typographyComparison = renderHtmlTypographyComparison(previous, next);

    const lines = [
      '<div class="dtifx-diff__field dtifx-diff__field--value">',
      '  <dt>value</dt>',
      '  <dd>',
      '    <div class="dtifx-diff__comparison dtifx-diff__comparison--value">',
      `      <pre class="dtifx-diff__value dtifx-diff__value--previous">${previousValue}</pre>`,
      '      <span class="dtifx-diff__arrow" aria-hidden="true">→</span>',
      `      <pre class="dtifx-diff__value dtifx-diff__value--next">${nextValue}</pre>`,
      '    </div>',
    ];

    if (comparison) {
      append(lines, `    ${comparison}`);
    }

    if (typographyComparison) {
      append(lines, `    ${typographyComparison}`);
    }

    const dimensionComparison = renderHtmlDimensionComparison(previous, next);

    if (dimensionComparison) {
      append(lines, `    ${dimensionComparison}`);
    }

    append(lines, '  </dd>');
    append(lines, '</div>');

    return lines.join('\n');
  },
  raw: (previous, next) =>
    renderInlineField('raw', formatValue(previous.raw), formatValue(next.raw)),
  ref: (previous, next) =>
    renderInlineField('ref', formatPointer(previous.ref), formatPointer(next.ref)),
  type: (previous, next) =>
    renderInlineField('type', formatMaybeUndefined(previous.type), formatMaybeUndefined(next.type)),
  description: (previous, next) =>
    renderInlineField(
      'description',
      formatMaybeUndefined(previous.description),
      formatMaybeUndefined(next.description),
    ),
  extensions: (previous, next) =>
    renderInlineField('extensions', formatValue(previous.extensions), formatValue(next.extensions)),
  deprecated: (previous, next) =>
    renderInlineField('deprecated', formatValue(previous.deprecated), formatValue(next.deprecated)),
  references: (previous, next, pointerLimit) =>
    renderPointerField('references', previous.references, next.references, pointerLimit),
  resolutionPath: (previous, next, pointerLimit) =>
    renderPointerField(
      'resolutionPath',
      previous.resolutionPath,
      next.resolutionPath,
      pointerLimit,
    ),
  appliedAliases: (previous, next, pointerLimit) =>
    renderPointerField(
      'appliedAliases',
      previous.appliedAliases,
      next.appliedAliases,
      pointerLimit,
    ),
};

function renderFieldChange(
  field: TokenModification['changes'][number],
  previous: TokenSnapshot,
  next: TokenSnapshot,
  pointerLimit: number,
): string {
  return FIELD_RENDERERS[field](previous, next, pointerLimit);
}

function renderInlineField(field: string, previous: string, next: string): string {
  const lines = [
    `<div class="dtifx-diff__field dtifx-diff__field--${escapeAttribute(field)}">`,
    `  <dt>${escapeHtml(field)}</dt>`,
    '  <dd>',
    '    <div class="dtifx-diff__comparison">',
    `      <code class="dtifx-diff__code">${escapeHtml(previous)}</code>`,
    '      <span class="dtifx-diff__arrow" aria-hidden="true">→</span>',
    `      <code class="dtifx-diff__code">${escapeHtml(next)}</code>`,
    '    </div>',
    '  </dd>',
    '</div>',
  ];

  return lines.join('\n');
}

function renderPointerField(
  field: string,
  previous: readonly TokenPointer[],
  next: readonly TokenPointer[],
  limit: number,
): string {
  const previousFormatted = formatPointerListWithLimit(previous, limit);
  const nextFormatted = formatPointerListWithLimit(next, limit);
  return renderInlineField(field, previousFormatted, nextFormatted);
}

function renderHtmlColorComparison(
  previous: TokenSnapshot,
  next: TokenSnapshot,
): string | undefined {
  const previousChip = getHtmlColorChip(previous);
  const nextChip = getHtmlColorChip(next);

  if (!previousChip || !nextChip) {
    return undefined;
  }

  return `<div class="dtifx-diff__swatch-row"><span class="dtifx-diff__text-muted">Swatch:</span> ${previousChip} <span class="dtifx-diff__arrow" aria-hidden="true">→</span> ${nextChip}</div>`;
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

function getHtmlColorChip(token: TokenSnapshot): string | undefined {
  const color = getTokenColor(token);

  if (!color) {
    return undefined;
  }

  return renderHtmlColorChip(color);
}

function renderHtmlColorChip(color: TokenColor): string {
  const style = `background:${formatCssColor(color)};`;
  const label = escapeHtml(formatColorLabel(color));

  return `<span class="dtifx-diff__chip" role="img" aria-label="${label}" title="${label}"><span class="dtifx-diff__chip-swatch" style="${style}"></span><span class="dtifx-diff__chip-label">${label}</span></span>`;
}

function renderHtmlTypographyComparison(
  previous: TokenSnapshot,
  next: TokenSnapshot,
): string | undefined {
  const previousChip = getHtmlTypographyChip(previous);
  const nextChip = getHtmlTypographyChip(next);

  if (!previousChip || !nextChip) {
    return undefined;
  }

  return `<div class="dtifx-diff__typography-row"><span class="dtifx-diff__text-muted">Typography:</span> ${previousChip} <span class="dtifx-diff__arrow" aria-hidden="true">→</span> ${nextChip}</div>`;
}

function renderHtmlDimensionComparison(
  previous: TokenSnapshot,
  next: TokenSnapshot,
): string | undefined {
  const comparison = getDimensionComparison(previous, next);

  if (!comparison) {
    return undefined;
  }

  const max = Math.max(Math.abs(comparison.previous.value), Math.abs(comparison.next.value));

  const previousMeter = renderHtmlDimensionMeter(
    comparison.previous.label,
    comparison.previous.value,
    max,
    'previous',
  );
  const nextMeter = renderHtmlDimensionMeter(
    comparison.next.label,
    comparison.next.value,
    max,
    'next',
  );
  const delta = escapeHtml(formatSignedDimension(comparison.delta, comparison.unit));
  const percent =
    comparison.percentChange === undefined
      ? ''
      : ` (${escapeHtml(formatSignedPercentage(comparison.percentChange))})`;

  return (
    '<div class="dtifx-diff__dimension-row">' +
    '  <span class="dtifx-diff__text-muted">Dimension:</span>' +
    `  ${previousMeter}` +
    '  <span class="dtifx-diff__arrow" aria-hidden="true">→</span>' +
    `  ${nextMeter}` +
    `  <span class="dtifx-diff__dimension-delta">${delta}${percent}</span>` +
    '</div>'
  );
}

function renderHtmlDimensionMeter(
  label: string,
  value: number,
  max: number,
  modifier: 'previous' | 'next',
): string {
  const safeLabel = escapeHtml(label);
  const clampedMax = Math.max(0, max);
  const ratio = clampedMax === 0 ? 0 : Math.min(1, Math.abs(value) / clampedMax);
  const percent = Math.max(0, Math.min(100, ratio * 100));
  const style = `--dtifx-diff-dimension-width:${percent.toFixed(2)}%;`;
  const hasValue = Math.abs(value) > 0 ? 'true' : 'false';

  return (
    `<span class="dtifx-diff__dimension-meter dtifx-diff__dimension-meter--${escapeAttribute(modifier)}">` +
    `<span class="dtifx-diff__dimension-meter-bar" style="${escapeAttributeValue(style)}" data-has-value="${hasValue}"></span>` +
    `<span class="dtifx-diff__dimension-meter-label">${safeLabel}</span>` +
    '</span>'
  );
}

function getHtmlTypographyChip(token: TokenSnapshot): string | undefined {
  const preview = getTypographyPreview(token);

  if (!preview) {
    return undefined;
  }

  return renderHtmlTypographyChip(preview);
}

function renderHtmlTypographyChip(preview: TypographyPreview): string {
  const styleParts = preview.declarations.map(
    (declaration) => `${declaration.name}: ${declaration.value}`,
  );
  const styleText = styleParts.join('; ');
  const styleAttribute = styleText.length === 0 ? undefined : escapeAttributeValue(`${styleText};`);
  const label = escapeHtml(preview.label);
  const styleAttr = styleAttribute ? ` style="${styleAttribute}"` : '';

  return (
    `<span class="dtifx-diff__chip dtifx-diff__chip--typography" role="img" aria-label="${label}" title="${label}">` +
    `<span class="dtifx-diff__typography-chip-text"${styleAttr}>Ag</span>` +
    `<span class="dtifx-diff__chip-label">${label}</span>` +
    '</span>'
  );
}

function renderHtmlGuidanceBlock(
  guidance: EntryGuidance,
  includeWhy: boolean,
  options: { readonly title?: string } = {},
): string {
  const lines = ['<div class="dtifx-diff__guidance">'];

  if (options.title) {
    append(lines, `  <p class="dtifx-diff__guidance-title">${escapeHtml(options.title)}</p>`);
  }

  if (includeWhy) {
    append(
      lines,
      `  <p class="dtifx-diff__guidance-line dtifx-diff__guidance-line--why"><strong>Why:</strong> ${escapeHtml(guidance.why)}</p>`,
    );
  }

  append(
    lines,
    `  <p class="dtifx-diff__guidance-line dtifx-diff__guidance-line--impact"><strong>Impact:</strong> ${escapeHtml(guidance.impactSummary)}</p>`,
  );
  append(
    lines,
    `  <p class="dtifx-diff__guidance-line dtifx-diff__guidance-line--next"><strong>Next:</strong> ${escapeHtml(guidance.nextStep)}</p>`,
  );
  append(lines, '</div>');

  return lines.join('\n');
}

function collectHtmlDetails(token: TokenSnapshot, impact: TokenAddition['impact']): string {
  const parts: string[] = [];
  const swatch = getHtmlColorChip(token);

  if (swatch) {
    append(parts, swatch);
  }

  const typography = getHtmlTypographyChip(token);

  if (typography) {
    append(parts, typography);
  }

  append(parts, renderHtmlImpact(impact));

  if (parts.length === 0) {
    return '';
  }

  return ` ${parts.join(' ')}`;
}

function renderHtmlTokenDetails(token: TokenSnapshot, pointerLimit: number): string | undefined {
  const list = renderHtmlTokenDetailList(token, pointerLimit);

  if (!list) {
    return undefined;
  }

  return ['<div class="dtifx-diff__details">', indent(list, 2), '</div>'].join('\n');
}

function renderHtmlSnapshotColumns(
  snapshots: readonly { title: string; token: TokenSnapshot }[],
  pointerLimit: number,
): string | undefined {
  const sections: string[] = [];

  for (const snapshot of snapshots) {
    const list = renderHtmlTokenDetailList(snapshot.token, pointerLimit);

    if (!list) {
      continue;
    }

    append(sections, '  <div class="dtifx-diff__snapshot">');
    append(sections, `    <h4>${escapeHtml(snapshot.title)}</h4>`);
    append(sections, indent(list, 4));
    append(sections, '  </div>');
  }

  if (sections.length === 0) {
    return undefined;
  }

  return [
    '<div class="dtifx-diff__details dtifx-diff__details--split">',
    ...sections,
    '</div>',
  ].join('\n');
}

function renderHtmlTokenDetailList(token: TokenSnapshot, pointerLimit: number): string | undefined {
  const rows: string[] = [];
  const source = formatTokenSourceLocation(token.source);

  append(
    rows,
    renderHtmlDetail('Source', `<code class="dtifx-diff__code">${escapeHtml(source)}</code>`),
  );

  if (token.type && token.type.trim().length > 0) {
    append(
      rows,
      renderHtmlDetail('Type', `<code class="dtifx-diff__code">${escapeHtml(token.type)}</code>`),
    );
  }

  if (token.description && token.description.trim().length > 0) {
    append(rows, renderHtmlDetail('Description', escapeHtml(token.description)));
  }

  if (token.ref !== undefined) {
    append(
      rows,
      renderHtmlDetail(
        'Ref',
        `<code class="dtifx-diff__code">${escapeHtml(formatPointer(token.ref))}</code>`,
      ),
    );
  }

  if (token.raw !== undefined) {
    append(
      rows,
      renderHtmlDetail(
        'Raw',
        `<code class="dtifx-diff__code">${escapeHtml(formatValue(token.raw))}</code>`,
      ),
    );
  }

  if (Object.keys(token.extensions).length > 0) {
    append(
      rows,
      renderHtmlDetail(
        'Extensions',
        `<code class="dtifx-diff__code">${escapeHtml(formatValue(token.extensions))}</code>`,
      ),
    );
  }

  if (token.deprecated !== undefined) {
    append(
      rows,
      renderHtmlDetail(
        'Deprecated',
        `<code class="dtifx-diff__code">${escapeHtml(formatValue(token.deprecated))}</code>`,
      ),
    );
  }

  if (token.references.length > 0) {
    append(
      rows,
      renderHtmlDetail(
        'References',
        `<code class="dtifx-diff__code">${escapeHtml(
          formatPointerListWithLimit(token.references, pointerLimit),
        )}</code>`,
      ),
    );
  }

  if (token.resolutionPath.length > 0) {
    append(
      rows,
      renderHtmlDetail(
        'Resolution path',
        `<code class="dtifx-diff__code">${escapeHtml(
          formatPointerListWithLimit(token.resolutionPath, pointerLimit),
        )}</code>`,
      ),
    );
  }

  if (token.appliedAliases.length > 0) {
    append(
      rows,
      renderHtmlDetail(
        'Applied aliases',
        `<code class="dtifx-diff__code">${escapeHtml(
          formatPointerListWithLimit(token.appliedAliases, pointerLimit),
        )}</code>`,
      ),
    );
  }

  if (rows.length === 0) {
    return undefined;
  }

  return [
    '<dl class="dtifx-diff__detail-list">',
    ...rows.map((row) => indent(row, 2)),
    '</dl>',
  ].join('\n');
}

function renderHtmlDetail(label: string, value: string): string {
  return [
    '<div class="dtifx-diff__detail">',
    `  <dt>${escapeHtml(label)}</dt>`,
    `  <dd>${value}</dd>`,
    '</div>',
  ].join('\n');
}

function renderHtmlImpact(impact: TokenAddition['impact']): string {
  const modifier = impact === 'breaking' ? 'breaking' : 'non-breaking';
  const label = impact === 'breaking' ? 'Breaking' : 'Non-breaking';
  return `<span class="dtifx-diff__impact dtifx-diff__impact--${escapeAttribute(modifier)}">${escapeHtml(label)}</span>`;
}

function summarizeImpacts<Entry>(
  entries: readonly Entry[],
  getImpact: (entry: Entry) => TokenAddition['impact'],
  action?: string,
): { total: number; breaking: number; subtitle: string } {
  let breaking = 0;

  for (const entry of entries) {
    if (getImpact(entry) === 'breaking') {
      breaking += 1;
    }
  }

  const total = entries.length;

  return {
    total,
    breaking,
    subtitle: formatImpactSummary(total, breaking, action),
  };
}

function formatImpactSummary(total: number, breaking: number, action?: string): string {
  const base = formatTokenCountLabel(total, action);

  if (total === 0) {
    return base;
  }

  if (breaking === 0) {
    return `${base} • All non-breaking`;
  }

  if (breaking === total) {
    return `${base} • All breaking`;
  }

  const nonBreaking = total - breaking;
  const breakingLabel = `${String(breaking)} ${breaking === 1 ? 'breaking change' : 'breaking changes'}`;
  const nonBreakingLabel = `${String(nonBreaking)} ${nonBreaking === 1 ? 'non-breaking change' : 'non-breaking changes'}`;

  return `${base} • ${breakingLabel}, ${nonBreakingLabel}`;
}

function formatTokenCountLabel(count: number, action?: string): string {
  const noun = count === 1 ? 'token' : 'tokens';
  const base = `${String(count)} ${noun}`;

  return action ? `${base} ${action}` : base;
}

function formatSummaryNavLabel(summary: TokenDiffSummary): string {
  const delta = summary.totalNext - summary.totalPrevious;
  const { label: deltaLabel } = formatDeltaLabel(delta);
  const previous = formatTokenCountLabel(summary.totalPrevious);
  const next = formatTokenCountLabel(summary.totalNext);
  const bump = formatVersionBumpSummary(summary.recommendedBump);

  return `Previous: ${previous} • Next: ${next} • Net: ${deltaLabel} • Bump: ${bump.label}`;
}

function formatDeltaLabel(delta: number): {
  label: string;
  modifier: 'increase' | 'decrease' | 'neutral';
} {
  if (delta === 0) {
    return { label: 'No net change', modifier: 'neutral' };
  }

  const modifier = delta > 0 ? 'increase' : 'decrease';
  const magnitude = Math.abs(delta);
  const noun = magnitude === 1 ? 'token' : 'tokens';
  const sign = delta > 0 ? '+' : '−';

  return { label: `${sign}${String(magnitude)} ${noun}`, modifier };
}

function indent(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => (line.length === 0 ? line : prefix + line))
    .join('\n');
}

function escapeAttribute(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/gu, '-');
}

function escapeAttributeValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

const STYLES = `
:root {
  color-scheme: light dark;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background-color: var(--dtifx-diff-background);
  color: var(--dtifx-diff-foreground);
  line-height: 1.6;
  --dtifx-diff-background: #f4f6fb;
  --dtifx-diff-foreground: #1f2328;
  --dtifx-diff-muted: #5b6672;
  --dtifx-diff-surface: #ffffff;
  --dtifx-diff-surface-muted: #f7f9fc;
  --dtifx-diff-border: #d0d7e2;
  --dtifx-diff-border-strong: #8c96a3;
  --dtifx-diff-accent: #3d63dd;
  --dtifx-diff-accent-muted: rgba(61, 99, 221, 0.12);
  --dtifx-diff-chip-bg: #ffffff;
  --dtifx-diff-breaking-text: #86181d;
  --dtifx-diff-breaking-border: #ff8182;
  --dtifx-diff-breaking-background: #ffebe9;
  --dtifx-diff-non-breaking-text: #116329;
  --dtifx-diff-non-breaking-border: #4ac26b;
  --dtifx-diff-non-breaking-background: #dafbe1;
  --dtifx-diff-warning-text: #9a6700;
  --dtifx-diff-warning-border: #f6c64f;
  --dtifx-diff-warning-background: #fff1c2;
  --dtifx-diff-dimension-previous: #8c959f;
  --dtifx-diff-dimension-next: #218bff;
  --dtifx-diff-shadow: 0 14px 30px -24px rgba(31, 35, 40, 0.45);
}
@media (prefers-color-scheme: dark) {
  :root {
    --dtifx-diff-background: #0d1117;
    --dtifx-diff-foreground: #f0f6fc;
    --dtifx-diff-muted: #a4b1c3;
    --dtifx-diff-surface: #161b22;
    --dtifx-diff-surface-muted: #1c2129;
    --dtifx-diff-border: #30363d;
    --dtifx-diff-border-strong: #7a8490;
    --dtifx-diff-accent: #7aa2ff;
    --dtifx-diff-accent-muted: rgba(122, 162, 255, 0.16);
    --dtifx-diff-chip-bg: #0d1117;
    --dtifx-diff-shadow: 0 24px 48px -32px rgba(2, 6, 23, 0.7);
    --dtifx-diff-breaking-background: rgba(134, 24, 29, 0.2);
    --dtifx-diff-non-breaking-background: rgba(17, 99, 41, 0.2);
    --dtifx-diff-warning-text: #d29922;
    --dtifx-diff-warning-border: #d29922;
    --dtifx-diff-warning-background: rgba(210, 153, 34, 0.25);
  }
}
body {
  margin: 0;
  padding: 2.75rem 1.75rem 3.5rem;
  background: radial-gradient(circle at top, rgba(61, 99, 221, 0.08), transparent 55%), var(--dtifx-diff-background);
  color: var(--dtifx-diff-foreground);
}
.dtifx-diff {
  display: grid;
  gap: 2.25rem;
  max-width: 1200px;
  margin: 0 auto;
}
.dtifx-diff__header {
  text-align: center;
}
.dtifx-diff__header-body {
  margin: 0 auto;
  max-width: 720px;
  padding: 1.5rem 1.75rem;
  border: 1px solid var(--dtifx-diff-border);
  border-radius: 1.5rem;
  background: var(--dtifx-diff-surface);
  box-shadow: var(--dtifx-diff-shadow);
}
.dtifx-diff__header-body h1 {
  margin: 0 0 0.5rem;
  font-size: 1.75rem;
}
.dtifx-diff__header-body p {
  margin: 0;
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__layout {
  display: grid;
  gap: 2rem;
  align-items: start;
}
.dtifx-diff__content {
  display: grid;
  gap: 2rem;
}
@media (min-width: 1024px) {
  .dtifx-diff__layout {
    grid-template-columns: minmax(0, 280px) minmax(0, 1fr);
  }
}
.dtifx-diff__nav {
  position: sticky;
  top: 2rem;
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 1.25rem;
  border: 1px solid var(--dtifx-diff-border);
  background: var(--dtifx-diff-surface);
  box-shadow: var(--dtifx-diff-shadow);
}
.dtifx-diff__nav-title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--dtifx-diff-muted);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.dtifx-diff__nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}
.dtifx-diff__nav-item {
  margin: 0;
}
.dtifx-diff__nav-link {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  border-radius: 0.9rem;
  border: 1px solid var(--dtifx-diff-border);
  text-decoration: none;
  color: inherit;
  background: var(--dtifx-diff-surface-muted);
  transition: border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease;
  flex-wrap: wrap;
}
.dtifx-diff__nav-link:hover,
.dtifx-diff__nav-link:focus-visible {
  border-color: var(--dtifx-diff-accent);
  background: var(--dtifx-diff-accent-muted);
  box-shadow: 0 0 0 3px var(--dtifx-diff-accent-muted);
  outline: none;
}
.dtifx-diff__nav-label {
  font-weight: 600;
}
.dtifx-diff__nav-meta {
  font-size: 0.85rem;
  color: var(--dtifx-diff-muted);
  margin-left: auto;
  white-space: nowrap;
}
.dtifx-diff__section {
  background: var(--dtifx-diff-surface);
  border-radius: 1.5rem;
  border: 1px solid var(--dtifx-diff-border);
  padding: 1.75rem;
  box-shadow: var(--dtifx-diff-shadow);
}
.dtifx-diff__section--summary {
  background: linear-gradient(180deg, rgba(61, 99, 221, 0.08), transparent 45%), var(--dtifx-diff-surface);
}
.dtifx-diff__section-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}
.dtifx-diff__section-header--summary {
  align-items: stretch;
}
.dtifx-diff__section-header h2 {
  margin: 0;
  font-size: 1.4rem;
}
.dtifx-diff__section-subtitle {
  margin: 0;
  font-size: 0.95rem;
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__section-body {
  display: grid;
  gap: 1.5rem;
}
.dtifx-diff__section-body--summary {
  gap: 2rem;
}
@media (min-width: 640px) {
  .dtifx-diff__section-header {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
  }
  .dtifx-diff__section-subtitle {
    text-align: right;
  }
}
.dtifx-diff__totals {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  grid-auto-rows: 1fr;
}
.dtifx-diff__totals-item {
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: var(--dtifx-diff-surface-muted);
  border: 1px solid var(--dtifx-diff-border);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.dtifx-diff__totals-item dt {
  margin: 0;
  font-size: 0.85rem;
  color: var(--dtifx-diff-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dtifx-diff__totals-item dd {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
}
.dtifx-diff__totals-item--delta {
  border-style: dashed;
}
.dtifx-diff__totals-delta {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 600;
}
.dtifx-diff__totals-delta--increase {
  color: var(--dtifx-diff-non-breaking-text);
  background: var(--dtifx-diff-non-breaking-background);
  border: 1px solid var(--dtifx-diff-non-breaking-border);
}
.dtifx-diff__totals-delta--decrease {
  color: var(--dtifx-diff-breaking-text);
  background: var(--dtifx-diff-breaking-background);
  border: 1px solid var(--dtifx-diff-breaking-border);
}
.dtifx-diff__totals-delta--neutral {
  color: var(--dtifx-diff-muted);
  background: var(--dtifx-diff-surface-muted);
  border: 1px solid var(--dtifx-diff-border);
}
.dtifx-diff__summary-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  grid-auto-rows: 1fr;
}
.dtifx-diff__summary-overview {
  display: grid;
  gap: 1.5rem;
}
@media (min-width: 768px) {
  .dtifx-diff__summary-overview {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    align-items: start;
  }
}
.dtifx-diff__summary-meta {
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  border: 1px solid var(--dtifx-diff-border);
  background: var(--dtifx-diff-surface);
  display: grid;
  gap: 0.6rem;
  font-size: 0.95rem;
}
.dtifx-diff__summary-meta p {
  margin: 0;
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__summary-meta strong {
  color: var(--dtifx-diff-foreground);
}
.dtifx-diff__summary-count {
  padding: 1rem 1.2rem;
  border-radius: 1.1rem;
  border: 1px solid var(--dtifx-diff-border);
  background: var(--dtifx-diff-surface-muted);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.dtifx-diff__summary-count[data-kind='added'] {
  border-color: var(--dtifx-diff-non-breaking-border);
  background: var(--dtifx-diff-non-breaking-background);
  color: var(--dtifx-diff-non-breaking-text);
}
.dtifx-diff__summary-count[data-kind='removed'],
.dtifx-diff__summary-count[data-kind='breaking'] {
  border-color: var(--dtifx-diff-breaking-border);
  background: var(--dtifx-diff-breaking-background);
  color: var(--dtifx-diff-breaking-text);
}
.dtifx-diff__summary-count[data-kind='renamed'] {
  border-color: #c297ff;
  background: rgba(194, 151, 255, 0.18);
}
.dtifx-diff__summary-count[data-kind='changed'] {
  border-color: #9dd0ff;
  background: rgba(157, 208, 255, 0.22);
}
.dtifx-diff__summary-count[data-kind='value-changed'] {
  border-color: var(--dtifx-diff-breaking-border);
  background: var(--dtifx-diff-breaking-background);
  color: var(--dtifx-diff-breaking-text);
}
.dtifx-diff__summary-count[data-kind='metadata-changed'] {
  border-color: #9dd0ff;
  background: rgba(157, 208, 255, 0.22);
}
.dtifx-diff__summary-count[data-kind='unchanged'] {
  background: var(--dtifx-diff-surface);
}
.dtifx-diff__summary-count[data-kind='non-breaking'] {
  border-color: var(--dtifx-diff-non-breaking-border);
  background: var(--dtifx-diff-non-breaking-background);
  color: var(--dtifx-diff-non-breaking-text);
}
.dtifx-diff__summary-count[data-kind='version-bump-major'] {
  border-color: var(--dtifx-diff-breaking-border);
  background: var(--dtifx-diff-breaking-background);
  color: var(--dtifx-diff-breaking-text);
}
.dtifx-diff__summary-count[data-kind='version-bump-minor'] {
  border-color: var(--dtifx-diff-warning-border);
  background: var(--dtifx-diff-warning-background);
  color: var(--dtifx-diff-warning-text);
}
.dtifx-diff__summary-count[data-kind='version-bump-patch'] {
  border-color: var(--dtifx-diff-non-breaking-border);
  background: var(--dtifx-diff-non-breaking-background);
  color: var(--dtifx-diff-non-breaking-text);
}
.dtifx-diff__summary-count[data-kind='version-bump-none'] {
  color: var(--dtifx-diff-muted);
  background: var(--dtifx-diff-surface);
}
.dtifx-diff__summary-value {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.1;
}
.dtifx-diff__summary-label {
  font-size: 0.9rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: inherit;
}
.dtifx-diff__type-summary h3 {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
}
.dtifx-diff__table-wrapper {
  overflow-x: auto;
  border-radius: 1rem;
  border: 1px solid var(--dtifx-diff-border);
}
.dtifx-diff__type-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 620px;
  background: var(--dtifx-diff-surface);
}
.dtifx-diff__type-table caption {
  caption-side: top;
  padding: 0.75rem 1rem;
  font-weight: 600;
  text-align: left;
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__type-table th,
.dtifx-diff__type-table td {
  border-bottom: 1px solid var(--dtifx-diff-border);
  padding: 0.65rem 1rem;
  text-align: left;
  font-size: 0.9rem;
}
.dtifx-diff__type-table tbody tr:last-of-type th,
.dtifx-diff__type-table tbody tr:last-of-type td {
  border-bottom: none;
}
.dtifx-diff__type-table tbody tr:nth-of-type(even) td,
.dtifx-diff__type-table tbody tr:nth-of-type(even) th {
  background: var(--dtifx-diff-surface-muted);
}
.dtifx-diff__section-body--type {
  gap: 1.75rem;
}
.dtifx-diff__type-operation {
  border-radius: 1.25rem;
  border: 1px solid var(--dtifx-diff-border);
  background: var(--dtifx-diff-surface);
  padding: 1.25rem 1.5rem;
  display: grid;
  gap: 1rem;
  box-shadow: var(--dtifx-diff-shadow);
}
.dtifx-diff__type-operation + .dtifx-diff__type-operation {
  margin-top: 0.25rem;
}
.dtifx-diff__type-operation--added {
  border-color: var(--dtifx-diff-non-breaking-border);
  background: var(--dtifx-diff-non-breaking-background);
}
.dtifx-diff__type-operation--removed {
  border-color: var(--dtifx-diff-breaking-border);
  background: var(--dtifx-diff-breaking-background);
}
.dtifx-diff__type-operation--renamed {
  border-color: #c297ff;
  background: rgba(194, 151, 255, 0.16);
}
.dtifx-diff__type-operation-header {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.dtifx-diff__type-operation-header h3 {
  margin: 0;
  font-size: 1.15rem;
}
.dtifx-diff__type-operation-subtitle {
  margin: 0;
  font-size: 0.95rem;
  color: var(--dtifx-diff-muted);
}
@media (min-width: 640px) {
  .dtifx-diff__type-operation-header {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
  }
}
.dtifx-diff__type-operation-body {
  display: grid;
  gap: 1rem;
}
.dtifx-diff__type-operation-body--changes {
  gap: 1.25rem;
}
.dtifx-diff__group {
  display: grid;
  gap: 1rem;
}
.dtifx-diff__group + .dtifx-diff__group {
  border-top: 1px solid var(--dtifx-diff-border);
  padding-top: 1.5rem;
}
.dtifx-diff__group-body {
  display: grid;
  gap: 1.25rem;
}
.dtifx-diff__group-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.dtifx-diff__group-title {
  margin: 0;
  font-size: 1.05rem;
}
.dtifx-diff__group-meta {
  font-size: 0.85rem;
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1rem;
}
.dtifx-diff__list-item {
  padding: 1rem 1.25rem;
  border-radius: 1rem;
  border: 1px solid var(--dtifx-diff-border);
  background: var(--dtifx-diff-surface-muted);
  display: grid;
  gap: 0.75rem;
}
.dtifx-diff__list-item--added {
  border-color: var(--dtifx-diff-non-breaking-border);
}
.dtifx-diff__list-item--removed {
  border-color: var(--dtifx-diff-breaking-border);
}
.dtifx-diff__list-item--renamed {
  border-color: #c297ff;
}
.dtifx-diff__guidance {
  display: grid;
  gap: 0.35rem;
  font-size: 0.95rem;
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__guidance-title {
  margin: 0;
  font-weight: 600;
  color: var(--dtifx-diff-foreground);
}
.dtifx-diff__guidance-line {
  margin: 0;
}
.dtifx-diff__guidance-line strong {
  color: var(--dtifx-diff-foreground);
}
.dtifx-diff__section-body--risks {
  gap: 1.75rem;
}
.dtifx-diff__risk-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1.5rem;
}
.dtifx-diff__risk {
  border-radius: 1.25rem;
  border: 1px solid var(--dtifx-diff-border);
  background: var(--dtifx-diff-surface);
  padding: 1.25rem 1.5rem;
  display: grid;
  gap: 0.75rem;
  box-shadow: var(--dtifx-diff-shadow);
}
.dtifx-diff__risk--breaking {
  border-color: var(--dtifx-diff-breaking-border);
  background: var(--dtifx-diff-breaking-background);
}
.dtifx-diff__risk--non-breaking {
  border-color: var(--dtifx-diff-non-breaking-border);
  background: var(--dtifx-diff-non-breaking-background);
}
.dtifx-diff__risk-header {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
@media (min-width: 640px) {
  .dtifx-diff__risk-header {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
  }
}
.dtifx-diff__risk-kind {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__risk-impact {
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  border: 1px solid currentColor;
}
.dtifx-diff__risk--breaking .dtifx-diff__risk-impact {
  color: var(--dtifx-diff-breaking-text);
  border-color: var(--dtifx-diff-breaking-border);
  background: var(--dtifx-diff-breaking-background);
}
.dtifx-diff__risk--non-breaking .dtifx-diff__risk-impact {
  color: var(--dtifx-diff-non-breaking-text);
  border-color: var(--dtifx-diff-non-breaking-border);
  background: var(--dtifx-diff-non-breaking-background);
}
.dtifx-diff__risk-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}
.dtifx-diff__risk-path,
.dtifx-diff__risk-why,
.dtifx-diff__risk-impact-summary,
.dtifx-diff__risk-next,
.dtifx-diff__risk-tokens {
  margin: 0;
  font-size: 0.95rem;
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__risk-path code,
.dtifx-diff__risk-tokens code {
  font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.9rem;
}
.dtifx-diff__risk-next strong {
  color: var(--dtifx-diff-foreground);
}
.dtifx-diff__risk-fields {
  display: grid;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.dtifx-diff__risk-fields ul {
  margin: 0.25rem 0 0;
  padding-left: 1.1rem;
}
.dtifx-diff__risk-fields li {
  margin: 0;
}
.dtifx-diff__item-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.dtifx-diff__item-row code {
  font-size: 0.95rem;
}
.dtifx-diff__impact {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  border: 1px solid currentColor;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dtifx-diff__impact--breaking {
  color: var(--dtifx-diff-breaking-text);
  background: var(--dtifx-diff-breaking-background);
  border-color: var(--dtifx-diff-breaking-border);
}
.dtifx-diff__impact--non-breaking {
  color: var(--dtifx-diff-non-breaking-text);
  background: var(--dtifx-diff-non-breaking-background);
  border-color: var(--dtifx-diff-non-breaking-border);
}
.dtifx-diff__change {
  padding: 1.25rem 1.5rem;
  border-radius: 1.15rem;
  border: 1px solid var(--dtifx-diff-border);
  background: var(--dtifx-diff-surface-muted);
  display: grid;
  gap: 1rem;
}
.dtifx-diff__change h4 {
  margin: 0;
  font-size: 1.05rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.dtifx-diff__fields {
  margin: 0;
  display: grid;
  gap: 1rem;
}
.dtifx-diff__field {
  display: grid;
  gap: 0.5rem;
}
.dtifx-diff__field dt {
  margin: 0;
  font-weight: 600;
  color: var(--dtifx-diff-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.8rem;
}
.dtifx-diff__field dd {
  margin: 0;
}
.dtifx-diff__comparison {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.dtifx-diff__comparison--value {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}
.dtifx-diff__value {
  margin: 0;
  padding: 0.9rem;
  border-radius: 1rem;
  border: 1px solid var(--dtifx-diff-border);
  background: var(--dtifx-diff-surface);
  font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.9rem;
  white-space: pre-wrap;
}
.dtifx-diff__value--previous {
  border-color: var(--dtifx-diff-border-strong);
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__value--next {
  border-color: var(--dtifx-diff-accent);
  background: rgba(61, 99, 221, 0.08);
}
.dtifx-diff__arrow {
  font-weight: 700;
}
.dtifx-diff__swatch-row,
.dtifx-diff__typography-row,
.dtifx-diff__dimension-row {
  margin-top: 0.75rem;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.dtifx-diff__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--dtifx-diff-border);
  background: var(--dtifx-diff-chip-bg);
  font-size: 0.85rem;
  font-weight: 600;
}
.dtifx-diff__chip--typography {
  background: var(--dtifx-diff-surface);
}
.dtifx-diff__chip-color {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4);
}
.dtifx-diff__chip-label {
  font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.dtifx-diff__typography-chip-text {
  font-weight: 700;
  font-size: 1.05rem;
}
.dtifx-diff__dimension-meter {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.dtifx-diff__dimension-meter-bar {
  display: inline-block;
  width: var(--dtifx-diff-dimension-width, 0%);
  min-width: 0;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--dtifx-diff-dimension-bar, var(--dtifx-diff-border));
}
.dtifx-diff__dimension-meter-bar[data-has-value='true'] {
  min-width: 0.65rem;
}
.dtifx-diff__dimension-meter--previous .dtifx-diff__dimension-meter-bar {
  --dtifx-diff-dimension-bar: var(--dtifx-diff-dimension-previous);
}
.dtifx-diff__dimension-meter--next .dtifx-diff__dimension-meter-bar {
  --dtifx-diff-dimension-bar: var(--dtifx-diff-dimension-next);
}
.dtifx-diff__dimension-meter-label {
  font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.85rem;
}
.dtifx-diff__dimension-delta {
  font-weight: 600;
}
.dtifx-diff__typography-preview {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.6rem 0.9rem;
  border-radius: 0.9rem;
  border: 1px dashed var(--dtifx-diff-border);
  background: var(--dtifx-diff-surface);
}
.dtifx-diff__text-muted {
  color: var(--dtifx-diff-muted);
  font-weight: 500;
}
.dtifx-diff__detail-list {
  margin: 0;
  display: grid;
  gap: 0.75rem;
}
.dtifx-diff__detail {
  display: grid;
  gap: 0.35rem;
}
.dtifx-diff__detail dt {
  margin: 0;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__detail dd {
  margin: 0;
}
.dtifx-diff__details {
  border-radius: 1.1rem;
  border: 1px dashed var(--dtifx-diff-border);
  background: var(--dtifx-diff-surface);
  padding: 1rem 1.25rem;
}
.dtifx-diff__details--split {
  display: grid;
  gap: 1.25rem;
}
@media (min-width: 720px) {
  .dtifx-diff__details--split {
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }
}
.dtifx-diff__snapshot h4 {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  color: var(--dtifx-diff-muted);
}
.dtifx-diff__comparison--value pre {
  min-height: 100%;
}
.dtifx-diff__code {
  font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 0.9rem;
  background: var(--dtifx-diff-surface);
  padding: 0.15rem 0.4rem;
  border-radius: 0.4rem;
  border: 1px solid var(--dtifx-diff-border);
}
`;

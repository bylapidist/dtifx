import type {
  TokenAddition,
  TokenChangeKind,
  TokenDiffResult,
  TokenModification,
  TokenRemoval,
  TokenRename,
} from '../diff.js';
import { normalizeTokenType } from './formatting.js';
import type { TokenPath } from '../token-set.js';

export interface ReportDescriptor {
  readonly summary: ReportSummaryView;
  readonly topRisks: readonly ReportRiskItem[];
  readonly typeSections: readonly ReportTypeSection[];
}

export interface ReportSummaryView {
  readonly impact: ImpactSummary;
  readonly operations: OperationSummary;
  readonly totals: TokenTotals;
  readonly changeMix: ChangeMixSummary;
  readonly typeHotspots: readonly ReportHotspot[];
  readonly groupHotspots: readonly ReportHotspot[];
}

export interface ImpactSummary {
  readonly breaking: number;
  readonly nonBreaking: number;
}

export interface OperationSummary {
  readonly added: number;
  readonly changed: number;
  readonly removed: number;
  readonly renamed: number;
}

export interface TokenTotals {
  readonly previous: number;
  readonly next: number;
}

export interface ChangeMixSummary {
  readonly valueChanged: number;
  readonly metadataChanged: number;
}

export interface ReportHotspot {
  readonly label: string;
  readonly changes: number;
  readonly breaking: number;
  readonly nonBreaking: number;
}

export interface ReportRiskItem {
  readonly kind: TokenChangeKind;
  readonly impact: TokenAddition['impact'];
  readonly labelPath: string;
  readonly typeLabel: string;
  readonly title: string;
  readonly why: string;
  readonly impactSummary: string;
  readonly nextStep: string;
  readonly score: number;
  readonly tokens: {
    readonly previous?: string;
    readonly next?: string;
  };
  readonly changedFields?: readonly TokenModification['changes'][number][];
}

export interface ReportTypeSection {
  readonly key: string;
  readonly label: string;
  readonly counts: OperationSummary;
  readonly operations: ReportTypeOperations;
  readonly groups: readonly ReportGroupSection[];
}

export interface ReportTypeOperations {
  readonly added: readonly TokenAddition[];
  readonly changed: readonly TokenModification[];
  readonly removed: readonly TokenRemoval[];
  readonly renamed: readonly TokenRename[];
}

export interface ReportGroupSection {
  readonly key: string;
  readonly label: string;
  readonly counts: OperationSummary;
  readonly operations: ReportTypeOperations;
}

export interface CreateReportDescriptorOptions {
  readonly topRiskLimit?: number;
}

interface HotspotDescriptor {
  readonly label: string;
  readonly changes: number;
  readonly breaking: number;
  readonly nonBreaking: number;
}

type MutableArray<T> = T[];

interface TypeBucket {
  readonly label: string;
  readonly added: MutableArray<TokenAddition>;
  readonly changed: MutableArray<TokenModification>;
  readonly removed: MutableArray<TokenRemoval>;
  readonly renamed: MutableArray<TokenRename>;
  readonly groups: Map<string, GroupBucket>;
}

interface GroupBucket {
  readonly key: string;
  readonly label: string;
  readonly added: MutableArray<TokenAddition>;
  readonly changed: MutableArray<TokenModification>;
  readonly removed: MutableArray<TokenRemoval>;
  readonly renamed: MutableArray<TokenRename>;
}

const DEFAULT_TOP_RISK_LIMIT = 10;
const FIELD_LABELS: Record<TokenModification['changes'][number], string> = {
  value: 'value',
  raw: 'raw data',
  ref: 'reference',
  type: 'type',
  description: 'description',
  extensions: 'extensions',
  deprecated: 'deprecation metadata',
  references: 'references',
  resolutionPath: 'resolution path',
  appliedAliases: 'applied aliases',
};

const VALUE_CHANGE_FIELDS: ReadonlySet<TokenModification['changes'][number]> = new Set([
  'value',
  'raw',
  'ref',
  'type',
]);

/**
 * Builds the aggregated report descriptor consumed by renderers, including
 * summary views, risk insights, and grouped change sections.
 *
 * @param diff - The diff result to analyse.
 * @param options - Options controlling risk limits and grouping behaviour.
 * @returns The structured report descriptor used by renderers.
 */
export function createReportDescriptor(
  diff: TokenDiffResult,
  options: CreateReportDescriptorOptions = {},
): ReportDescriptor {
  const topRiskLimit = options.topRiskLimit ?? DEFAULT_TOP_RISK_LIMIT;
  const summary = createSummaryView(diff);
  const topRisks = collectRiskEntries(diff)
    .toSorted((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.labelPath.localeCompare(right.labelPath);
    })
    .slice(0, topRiskLimit);
  const typeSections = buildTypeSections(diff);

  return { summary, topRisks, typeSections };
}

function createSummaryView(diff: TokenDiffResult): ReportSummaryView {
  const { summary } = diff;
  return {
    impact: {
      breaking: summary.breaking,
      nonBreaking: summary.nonBreaking,
    },
    operations: {
      added: summary.added,
      changed: summary.changed,
      removed: summary.removed,
      renamed: summary.renamed,
    },
    totals: {
      previous: summary.totalPrevious,
      next: summary.totalNext,
    },
    changeMix: {
      valueChanged: summary.valueChanged,
      metadataChanged: summary.metadataChanged,
    },
    typeHotspots: collectHotspots(summary.types, (item) => item.type),
    groupHotspots: collectHotspots(summary.groups, (item) => item.group),
  };
}

function collectHotspots<
  Summary extends {
    readonly added: number;
    readonly removed: number;
    readonly renamed: number;
    readonly changed: number;
    readonly breaking: number;
    readonly nonBreaking: number;
  },
>(summaries: readonly Summary[], getLabel: (summary: Summary) => string): readonly ReportHotspot[] {
  const hotspots: HotspotDescriptor[] = summaries
    .map((summary) => ({
      label: getLabel(summary),
      changes: summary.added + summary.removed + summary.renamed + summary.changed,
      breaking: summary.breaking,
      nonBreaking: summary.nonBreaking,
    }))
    .filter((summary) => summary.changes > 0)
    .toSorted((left, right) => {
      if (right.breaking !== left.breaking) {
        return right.breaking - left.breaking;
      }

      if (right.changes !== left.changes) {
        return right.changes - left.changes;
      }

      return left.label.localeCompare(right.label);
    });

  return hotspots;
}

function buildTypeSections(diff: TokenDiffResult): readonly ReportTypeSection[] {
  const buckets = new Map<string, TypeBucket>();

  const ensureBucket = (key: string, label: string) => {
    const existing = buckets.get(key);

    if (existing) {
      return existing;
    }

    const created: TypeBucket = {
      label,
      added: [] as MutableArray<TokenAddition>,
      changed: [] as MutableArray<TokenModification>,
      removed: [] as MutableArray<TokenRemoval>,
      renamed: [] as MutableArray<TokenRename>,
      groups: new Map(),
    };
    buckets.set(key, created);
    return created;
  };

  for (const entry of diff.added) {
    const { key, label } = normalizeTokenType(entry.next.type);
    const bucket = ensureBucket(key, label);
    bucket.added.push(entry);
    assignEntryToGroup(bucket, entry.next.path, (group) => {
      group.added.push(entry);
    });
  }

  for (const entry of diff.changed) {
    const { key, label } = normalizeTokenType(entry.next.type ?? entry.previous.type);
    const bucket = ensureBucket(key, label);
    bucket.changed.push(entry);
    assignEntryToGroup(bucket, entry.next.path, (group) => {
      group.changed.push(entry);
    });
  }

  for (const entry of diff.removed) {
    const { key, label } = normalizeTokenType(entry.previous.type);
    const bucket = ensureBucket(key, label);
    bucket.removed.push(entry);
    assignEntryToGroup(bucket, entry.previous.path, (group) => {
      group.removed.push(entry);
    });
  }

  for (const entry of diff.renamed) {
    const { key, label } = normalizeTokenType(entry.next.type ?? entry.previous.type);
    const bucket = ensureBucket(key, label);
    bucket.renamed.push(entry);
    const groupPath = entry.next.path.length > 0 ? entry.next.path : entry.previous.path;
    assignEntryToGroup(bucket, groupPath, (group) => {
      group.renamed.push(entry);
    });
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      counts: {
        added: bucket.added.length,
        changed: bucket.changed.length,
        removed: bucket.removed.length,
        renamed: bucket.renamed.length,
      },
      operations: {
        added: bucket.added,
        changed: bucket.changed,
        removed: bucket.removed,
        renamed: bucket.renamed,
      },
      groups: buildGroupSections(bucket.groups),
    }))
    .toSorted((left, right) => left.label.localeCompare(right.label));
}

function buildGroupSections(groups: Map<string, GroupBucket>): readonly ReportGroupSection[] {
  return [...groups.values()]
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      counts: {
        added: bucket.added.length,
        changed: bucket.changed.length,
        removed: bucket.removed.length,
        renamed: bucket.renamed.length,
      },
      operations: {
        added: bucket.added,
        changed: bucket.changed,
        removed: bucket.removed,
        renamed: bucket.renamed,
      },
    }))
    .toSorted((left, right) => left.label.localeCompare(right.label));
}

function assignEntryToGroup(
  bucket: TypeBucket,
  path: TokenPath,
  apply: (group: GroupBucket) => void,
): void {
  const descriptor = deriveGroupDescriptor(path);
  const groups = bucket.groups;
  let group = groups.get(descriptor.key);

  if (!group) {
    group = {
      key: descriptor.key,
      label: descriptor.label,
      added: [] as MutableArray<TokenAddition>,
      changed: [] as MutableArray<TokenModification>,
      removed: [] as MutableArray<TokenRemoval>,
      renamed: [] as MutableArray<TokenRename>,
    };
    groups.set(descriptor.key, group);
  }

  apply(group);
}

function deriveGroupDescriptor(path: TokenPath): {
  key: string;
  label: string;
} {
  const labelSegments: string[] = [];

  for (const segment of path.slice(0, -1)) {
    if (!segment) {
      continue;
    }

    const trimmed = segment.trim();

    if (trimmed.length === 0) {
      continue;
    }

    labelSegments.push(trimmed);
  }

  if (labelSegments.length === 0) {
    return { key: 'root', label: 'root' };
  }

  const label = labelSegments.join('/');
  const key = labelSegments.map((segment) => segment.toLowerCase()).join('/');

  return {
    key: key.length > 0 ? key : 'root',
    label,
  };
}

function collectRiskEntries(diff: TokenDiffResult): ReportRiskItem[] {
  const entries: ReportRiskItem[] = [];

  for (const entry of diff.changed) {
    entries.push(createRiskEntryFromModification(entry));
  }

  for (const entry of diff.removed) {
    entries.push(createRiskEntryFromRemoval(entry));
  }

  for (const entry of diff.added) {
    entries.push(createRiskEntryFromAddition(entry));
  }

  for (const entry of diff.renamed) {
    entries.push(createRiskEntryFromRename(entry));
  }

  return entries;
}

function createRiskEntryFromAddition(entry: TokenAddition): ReportRiskItem {
  const type = normalizeTokenType(entry.next.type);
  const baseImpact =
    entry.impact === 'breaking'
      ? 'Breaking addition: coordinate with consumers before release.'
      : 'Non-breaking addition: publicise availability to adopters.';

  return {
    kind: 'added',
    impact: entry.impact,
    labelPath: entry.id,
    typeLabel: type.label,
    title: 'Token added',
    why: `Introduces new ${type.label} token`,
    impactSummary: baseImpact,
    nextStep:
      entry.impact === 'breaking'
        ? `Confirm downstream usage of ${entry.id} can tolerate the new token.`
        : `Plan adoption for ${entry.id} across consuming teams.`,
    score: computeRiskScore(entry.impact, 'added'),
    tokens: { next: entry.id },
  };
}

function createRiskEntryFromRemoval(entry: TokenRemoval): ReportRiskItem {
  const type = normalizeTokenType(entry.previous.type);
  const impactSummary =
    entry.impact === 'breaking'
      ? 'Breaking removal: existing references will fail.'
      : 'Removal flagged as non-breaking; verify aliases or fallbacks.';

  return {
    kind: 'removed',
    impact: entry.impact,
    labelPath: entry.id,
    typeLabel: type.label,
    title: 'Token removed',
    why: `Deletes ${type.label} token`,
    impactSummary,
    nextStep:
      entry.impact === 'breaking'
        ? `Audit consumers of ${entry.id} and migrate to replacements.`
        : `Double-check that replacements for ${entry.id} exist before release.`,
    score: computeRiskScore(entry.impact, 'removed'),
    tokens: { previous: entry.id },
  };
}

function createRiskEntryFromRename(entry: TokenRename): ReportRiskItem {
  const type = normalizeTokenType(entry.next.type ?? entry.previous.type);
  const path = `${entry.previousId} → ${entry.nextId}`;
  const impactSummary =
    entry.impact === 'breaking'
      ? `Breaking rename: references must switch to ${entry.nextId}.`
      : `Rename marked non-breaking; ensure redirects are in place.`;

  return {
    kind: 'renamed',
    impact: entry.impact,
    labelPath: path,
    typeLabel: type.label,
    title: 'Token renamed',
    why: `Pointer moved to ${entry.nextId}`,
    impactSummary,
    nextStep:
      entry.impact === 'breaking'
        ? `Replace usages of ${entry.previousId} with ${entry.nextId}.`
        : `Verify ${entry.previousId} continues to resolve correctly.`,
    score: computeRiskScore(entry.impact, 'renamed'),
    tokens: {
      previous: entry.previousId,
      next: entry.nextId,
    },
  };
}

function createRiskEntryFromModification(entry: TokenModification): ReportRiskItem {
  const type = normalizeTokenType(entry.next.type ?? entry.previous.type);
  const { title, why } = describeModification(entry);
  const impactSummary =
    entry.impact === 'breaking'
      ? 'Breaking update: dependent experiences may regress.'
      : 'Non-breaking update: confirm expected outcomes and visuals.';

  return {
    kind: 'changed',
    impact: entry.impact,
    labelPath: entry.id,
    typeLabel: type.label,
    title,
    why,
    impactSummary,
    nextStep:
      entry.impact === 'breaking'
        ? `Coordinate updates for ${entry.id} before release.`
        : `Spot-check ${entry.id} in consuming products.`,
    score: computeModificationRiskScore(entry),
    tokens: {
      previous: entry.id,
      next: entry.id,
    },
    changedFields: [...entry.changes],
  };
}

function describeModification(entry: TokenModification): {
  readonly title: string;
  readonly why: string;
} {
  const changedFields = entry.changes;
  const hasValueChange = changedFields.some((field) => VALUE_CHANGE_FIELDS.has(field));
  const title = hasValueChange ? 'Value updated' : 'Metadata updated';
  const descriptors = changedFields.map((field) => FIELD_LABELS[field]);
  const why =
    descriptors.length > 0
      ? `Changed fields: ${formatList(descriptors)}`
      : 'Changed fields: none recorded';

  return { title, why };
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    const [only] = values;
    return only ?? '';
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  const head = values.slice(0, -1).join(', ');
  const tail = values.at(-1);

  if (tail === undefined) {
    return head;
  }

  return `${head}, and ${tail}`;
}

function computeRiskScore(impact: TokenAddition['impact'], kind: TokenChangeKind): number {
  const severityWeight = impact === 'breaking' ? 0 : 100;
  const operationWeight = OPERATION_PRIORITY[kind];
  return severityWeight + operationWeight;
}

const OPERATION_PRIORITY: Record<TokenChangeKind, number> = {
  changed: 0,
  removed: 1,
  renamed: 2,
  added: 3,
};

function computeModificationRiskScore(entry: TokenModification): number {
  const severityWeight = entry.impact === 'breaking' ? 0 : 100;
  const changeWeight = entry.changes.includes('value') ? 0 : 10;
  const metadataPenalty = entry.changes.length - (entry.changes.includes('value') ? 1 : 0);
  return severityWeight + changeWeight + metadataPenalty;
}

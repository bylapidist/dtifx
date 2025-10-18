import type {
  SummaryScope,
  TokenAddition,
  TokenChangeImpact,
  TokenDiffGroupSummary,
  TokenDiffSummary,
  TokenDiffTypeSummary,
  TokenFieldChange,
  TokenModification,
  TokenRemoval,
  TokenRename,
  VersionBump,
} from '../diff-types.js';
import type { TokenSnapshot } from '../tokens.js';

export interface SummaryInput {
  readonly previous: ReadonlyMap<string, TokenSnapshot>;
  readonly next: ReadonlyMap<string, TokenSnapshot>;
  readonly added: readonly TokenAddition[];
  readonly removed: readonly TokenRemoval[];
  readonly changed: readonly TokenModification[];
  readonly renamed: readonly TokenRename[];
  readonly scope?: SummaryScope;
}

export interface TokenSummaryStrategy {
  createSummary(input: SummaryInput): TokenDiffSummary;
}

export class DefaultTokenSummaryStrategy implements TokenSummaryStrategy {
  createSummary(input: SummaryInput): TokenDiffSummary {
    const { previous, next, added, removed, changed, renamed, scope } = input;
    const totalPrevious = scope?.previousIds?.size ?? previous.size;
    const totalNext = scope?.nextIds?.size ?? next.size;
    const impacts = countImpacts(added, removed, changed, renamed);
    const modifications = countModificationCategories(changed);

    const unchanged = scope
      ? countScopedUnchanged(previous, next, changed, removed, renamed, scope)
      : previous.size - removed.length - changed.length - renamed.length;

    return {
      totalPrevious,
      totalNext,
      added: added.length,
      removed: removed.length,
      renamed: renamed.length,
      changed: changed.length,
      unchanged,
      breaking: impacts.breaking,
      nonBreaking: impacts.nonBreaking,
      valueChanged: modifications.valueChanged,
      metadataChanged: modifications.metadataChanged,
      recommendedBump: recommendVersionBumpFromChanges(added, removed, changed, renamed),
      types: collectTypeSummaries(previous, next, added, removed, changed, renamed, scope),
      groups: collectGroupSummaries(previous, next, added, removed, changed, renamed, scope),
    };
  }
}

function countScopedUnchanged(
  previous: ReadonlyMap<string, TokenSnapshot>,
  next: ReadonlyMap<string, TokenSnapshot>,
  changed: readonly TokenModification[],
  removed: readonly TokenRemoval[],
  renamed: readonly TokenRename[],
  scope: SummaryScope,
): number {
  const previousIds = scope.previousIds ?? new Set(previous.keys());
  const nextIds = scope.nextIds ?? new Set(next.keys());
  const changedIds = new Set(changed.map((entry) => entry.id));
  const removedIds = new Set(removed.map((entry) => entry.id));
  const renamedPreviousIds = new Set(renamed.map((entry) => entry.previousId));
  let unchanged = 0;

  for (const id of previousIds) {
    if (!nextIds.has(id)) {
      continue;
    }

    if (changedIds.has(id)) {
      continue;
    }

    if (removedIds.has(id)) {
      continue;
    }

    if (renamedPreviousIds.has(id)) {
      continue;
    }

    unchanged += 1;
  }

  return unchanged;
}

function countImpacts(
  added: readonly TokenAddition[],
  removed: readonly TokenRemoval[],
  changed: readonly TokenModification[],
  renamed: readonly TokenRename[],
): { breaking: number; nonBreaking: number } {
  let breaking = 0;
  let nonBreaking = 0;

  const accumulate = (impact: TokenChangeImpact): void => {
    if (impact === 'breaking') {
      breaking += 1;
    } else {
      nonBreaking += 1;
    }
  };

  for (const entry of added) {
    accumulate(entry.impact);
  }

  for (const entry of removed) {
    accumulate(entry.impact);
  }

  for (const entry of changed) {
    accumulate(entry.impact);
  }

  for (const entry of renamed) {
    accumulate(entry.impact);
  }

  return { breaking, nonBreaking };
}

const VALUE_CHANGE_FIELDS: ReadonlySet<TokenFieldChange> = new Set(['value', 'raw', 'ref', 'type']);

function countModificationCategories(changed: readonly TokenModification[]): {
  valueChanged: number;
  metadataChanged: number;
} {
  let valueChanged = 0;
  let metadataChanged = 0;

  for (const entry of changed) {
    if (entry.changes.some((field) => VALUE_CHANGE_FIELDS.has(field))) {
      valueChanged += 1;
    } else {
      metadataChanged += 1;
    }
  }

  return { valueChanged, metadataChanged };
}

function recommendVersionBumpFromChanges(
  added: readonly TokenAddition[],
  removed: readonly TokenRemoval[],
  changed: readonly TokenModification[],
  renamed: readonly TokenRename[],
): VersionBump {
  const hasChanges =
    added.length > 0 || removed.length > 0 || changed.length > 0 || renamed.length > 0;

  if (!hasChanges) {
    return 'none';
  }

  const hasBreaking =
    added.some((entry) => entry.impact === 'breaking') ||
    removed.some((entry) => entry.impact === 'breaking') ||
    renamed.some((entry) => entry.impact === 'breaking') ||
    changed.some((entry) => entry.impact === 'breaking');

  if (hasBreaking) {
    return 'major';
  }

  if (added.length > 0) {
    return 'minor';
  }

  return 'patch';
}

/**
 * Suggests a semantic version increment given the classified token changes.
 *
 * @param added - Tokens introduced in the update.
 * @param removed - Tokens removed from the baseline.
 * @param changed - Tokens modified in place.
 * @param renamed - Tokens matched as renames.
 * @returns The recommended version bump level.
 */
export function recommendVersionBump(
  added: readonly TokenAddition[],
  removed: readonly TokenRemoval[],
  changed: readonly TokenModification[],
  renamed: readonly TokenRename[],
): VersionBump {
  return recommendVersionBumpFromChanges(added, removed, changed, renamed);
}

interface ImpactCounter {
  breaking: number;
  nonBreaking: number;
}

interface MutableTypeSummary extends ImpactCounter {
  type: string;
  totalPrevious: number;
  totalNext: number;
  added: number;
  removed: number;
  renamed: number;
  changed: number;
  unchanged: number;
  valueChanged: number;
  metadataChanged: number;
}

function collectTypeSummaries(
  previous: ReadonlyMap<string, TokenSnapshot>,
  next: ReadonlyMap<string, TokenSnapshot>,
  added: readonly TokenAddition[],
  removed: readonly TokenRemoval[],
  changed: readonly TokenModification[],
  renamed: readonly TokenRename[],
  scope?: SummaryScope,
): TokenDiffTypeSummary[] {
  const buckets = new Map<string, MutableTypeSummary>();
  const previousIds = scope?.previousIds ?? new Set(previous.keys());
  const nextIds = scope?.nextIds ?? new Set(next.keys());

  for (const id of previousIds) {
    const snapshot = previous.get(id);

    if (!snapshot) {
      continue;
    }

    const bucket = getTypeBucket(buckets, snapshot.type);
    bucket.totalPrevious += 1;
  }

  for (const id of nextIds) {
    const snapshot = next.get(id);

    if (!snapshot) {
      continue;
    }

    const bucket = getTypeBucket(buckets, snapshot.type);
    bucket.totalNext += 1;
  }

  for (const entry of added) {
    const bucket = getTypeBucket(buckets, entry.next.type);
    bucket.added += 1;
    incrementImpactBucket(bucket, entry.impact);
  }

  for (const entry of removed) {
    const bucket = getTypeBucket(buckets, entry.previous.type);
    bucket.removed += 1;
    incrementImpactBucket(bucket, entry.impact);
  }

  for (const entry of renamed) {
    const bucket = getTypeBucket(buckets, entry.next.type ?? entry.previous.type);
    bucket.renamed += 1;
    incrementImpactBucket(bucket, entry.impact);
  }

  for (const entry of changed) {
    const bucket = getTypeBucket(buckets, entry.next.type ?? entry.previous.type);
    bucket.changed += 1;
    incrementImpactBucket(bucket, entry.impact);

    if (entry.changes.some((field) => VALUE_CHANGE_FIELDS.has(field))) {
      bucket.valueChanged += 1;
    } else {
      bucket.metadataChanged += 1;
    }
  }

  const changedIds = new Set(changed.map((entry) => entry.id));
  const removedIds = new Set(removed.map((entry) => entry.id));
  const renamedPreviousIds = new Set(renamed.map((entry) => entry.previousId));

  for (const id of previousIds) {
    if (!nextIds.has(id)) {
      continue;
    }

    if (changedIds.has(id)) {
      continue;
    }

    if (removedIds.has(id)) {
      continue;
    }

    if (renamedPreviousIds.has(id)) {
      continue;
    }

    const snapshot = previous.get(id);

    if (!snapshot) {
      continue;
    }

    const bucket = getTypeBucket(buckets, snapshot.type);
    bucket.unchanged += 1;
  }

  return [...buckets.values()]
    .map(
      (bucket): TokenDiffTypeSummary => ({
        type: bucket.type,
        totalPrevious: bucket.totalPrevious,
        totalNext: bucket.totalNext,
        added: bucket.added,
        removed: bucket.removed,
        renamed: bucket.renamed,
        changed: bucket.changed,
        unchanged: bucket.unchanged,
        breaking: bucket.breaking,
        nonBreaking: bucket.nonBreaking,
        valueChanged: bucket.valueChanged,
        metadataChanged: bucket.metadataChanged,
      }),
    )
    .toSorted((left, right) => left.type.localeCompare(right.type));
}

const UNTYPED_TOKEN_TYPE_LABEL = 'untyped';

function getTypeBucket(
  buckets: Map<string, MutableTypeSummary>,
  type: string | undefined,
): MutableTypeSummary {
  const label = normalizeTokenTypeLabel(type);
  let bucket = buckets.get(label);

  if (!bucket) {
    bucket = {
      type: label,
      totalPrevious: 0,
      totalNext: 0,
      added: 0,
      removed: 0,
      renamed: 0,
      changed: 0,
      breaking: 0,
      nonBreaking: 0,
      unchanged: 0,
      valueChanged: 0,
      metadataChanged: 0,
    };
    buckets.set(label, bucket);
  }

  return bucket;
}

function normalizeTokenTypeLabel(value: string | undefined): string {
  if (!value) {
    return UNTYPED_TOKEN_TYPE_LABEL;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return UNTYPED_TOKEN_TYPE_LABEL;
  }

  return trimmed.toLowerCase();
}

interface MutableGroupSummary extends ImpactCounter {
  group: string;
  totalPrevious: number;
  totalNext: number;
  added: number;
  removed: number;
  renamed: number;
  changed: number;
  unchanged: number;
  valueChanged: number;
  metadataChanged: number;
}

const ROOT_GROUP_LABEL = 'root';

function collectGroupSummaries(
  previous: ReadonlyMap<string, TokenSnapshot>,
  next: ReadonlyMap<string, TokenSnapshot>,
  added: readonly TokenAddition[],
  removed: readonly TokenRemoval[],
  changed: readonly TokenModification[],
  renamed: readonly TokenRename[],
  scope?: SummaryScope,
): TokenDiffGroupSummary[] {
  const buckets = new Map<string, MutableGroupSummary>();
  const previousIds = scope?.previousIds ?? new Set(previous.keys());
  const nextIds = scope?.nextIds ?? new Set(next.keys());

  for (const id of previousIds) {
    const snapshot = previous.get(id);

    if (!snapshot) {
      continue;
    }

    for (const label of collectGroupLabelsForPath(snapshot.path)) {
      const bucket = getGroupBucket(buckets, label);
      bucket.totalPrevious += 1;
    }
  }

  for (const id of nextIds) {
    const snapshot = next.get(id);

    if (!snapshot) {
      continue;
    }

    for (const label of collectGroupLabelsForPath(snapshot.path)) {
      const bucket = getGroupBucket(buckets, label);
      bucket.totalNext += 1;
    }
  }

  for (const entry of added) {
    for (const label of collectGroupLabelsForPath(entry.next.path)) {
      const bucket = getGroupBucket(buckets, label);
      bucket.added += 1;
      incrementImpactBucket(bucket, entry.impact);
    }
  }

  for (const entry of removed) {
    for (const label of collectGroupLabelsForPath(entry.previous.path)) {
      const bucket = getGroupBucket(buckets, label);
      bucket.removed += 1;
      incrementImpactBucket(bucket, entry.impact);
    }
  }

  for (const entry of renamed) {
    const labels = new Set<string>();

    for (const label of collectGroupLabelsForPath(entry.previous.path)) {
      labels.add(label);
    }

    for (const label of collectGroupLabelsForPath(entry.next.path)) {
      labels.add(label);
    }

    if (labels.size === 0) {
      labels.add(ROOT_GROUP_LABEL);
    }

    for (const label of labels) {
      const bucket = getGroupBucket(buckets, label);
      bucket.renamed += 1;
      incrementImpactBucket(bucket, entry.impact);
    }
  }

  for (const entry of changed) {
    for (const label of collectGroupLabelsForPath(entry.next.path)) {
      const bucket = getGroupBucket(buckets, label);
      bucket.changed += 1;
      incrementImpactBucket(bucket, entry.impact);

      if (entry.changes.some((field) => VALUE_CHANGE_FIELDS.has(field))) {
        bucket.valueChanged += 1;
      } else {
        bucket.metadataChanged += 1;
      }
    }
  }

  const changedIds = new Set(changed.map((entry) => entry.id));
  const removedIds = new Set(removed.map((entry) => entry.id));
  const renamedPreviousIds = new Set(renamed.map((entry) => entry.previousId));

  for (const id of previousIds) {
    if (!nextIds.has(id)) {
      continue;
    }

    if (changedIds.has(id)) {
      continue;
    }

    if (removedIds.has(id)) {
      continue;
    }

    if (renamedPreviousIds.has(id)) {
      continue;
    }

    const snapshot = previous.get(id);

    if (!snapshot) {
      continue;
    }

    for (const label of collectGroupLabelsForPath(snapshot.path)) {
      const bucket = getGroupBucket(buckets, label);
      bucket.unchanged += 1;
    }
  }

  return [...buckets.values()]
    .map(
      (bucket): TokenDiffGroupSummary => ({
        group: bucket.group,
        totalPrevious: bucket.totalPrevious,
        totalNext: bucket.totalNext,
        added: bucket.added,
        removed: bucket.removed,
        renamed: bucket.renamed,
        changed: bucket.changed,
        unchanged: bucket.unchanged,
        breaking: bucket.breaking,
        nonBreaking: bucket.nonBreaking,
        valueChanged: bucket.valueChanged,
        metadataChanged: bucket.metadataChanged,
      }),
    )
    .toSorted((left, right) => left.group.localeCompare(right.group));
}

function collectGroupLabelsForPath(path: TokenSnapshot['path']): readonly string[] {
  const normalizedPath = normalizeTokenPathForGroups(path);

  if (normalizedPath.length === 0) {
    return [ROOT_GROUP_LABEL];
  }

  const labels: string[] = [];
  const limit = Math.max(1, normalizedPath.length - 1);

  for (let length = 1; length <= limit; length += 1) {
    const label = normalizedPath.slice(0, length).join('/');

    if (label.length === 0) {
      continue;
    }

    labels.push(label);
  }

  return labels;
}

function normalizeTokenPathForGroups(path: TokenSnapshot['path']): string[] {
  const segments: string[] = [];

  for (const part of path) {
    const normalized = normalizeGroupSegment(part);

    if (normalized) {
      segments.push(normalized);
    }
  }

  return segments;
}

function normalizeGroupSegment(segment: string | undefined): string | undefined {
  if (!segment) {
    return undefined;
  }

  const trimmed = segment.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.toLowerCase();
}

function getGroupBucket(
  buckets: Map<string, MutableGroupSummary>,
  label: string,
): MutableGroupSummary {
  const normalized = label === '' ? ROOT_GROUP_LABEL : label;
  let bucket = buckets.get(normalized);

  if (!bucket) {
    bucket = {
      group: normalized,
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
    };
    buckets.set(normalized, bucket);
  }

  return bucket;
}

function incrementImpactBucket(bucket: ImpactCounter, impact: TokenChangeImpact): void {
  if (impact === 'breaking') {
    bucket.breaking += 1;
  } else {
    bucket.nonBreaking += 1;
  }
}

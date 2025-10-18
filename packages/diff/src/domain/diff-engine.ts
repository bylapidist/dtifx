import { isDeepStrictEqual } from 'node:util';

import type {
  SummaryScope,
  TokenAddition,
  TokenChangeImpact,
  TokenChangeKind,
  TokenDiffFilter,
  TokenDiffResult,
  TokenDiffSummary,
  TokenFieldChange,
  TokenModification,
  TokenRemoval,
  TokenRename,
  TokenSetLike,
  VersionBump,
} from './diff-types.js';
import type { TokenSnapshot, TokenPath, TokenPointer } from './tokens.js';
import { DefaultTokenImpactStrategy, type TokenImpactStrategy } from './strategies/impact.js';
import {
  DefaultTokenRenameStrategy,
  type RenameDetectionResult,
  type TokenRenameStrategy,
} from './strategies/rename.js';
import {
  DefaultTokenSummaryStrategy,
  type SummaryInput,
  type TokenSummaryStrategy,
  recommendVersionBump as recommendVersionBumpFromSummary,
} from './strategies/summary.js';

export interface DiffEngineOptions {
  readonly impactStrategy?: TokenImpactStrategy;
  readonly renameStrategy?: TokenRenameStrategy;
  readonly summaryStrategy?: TokenSummaryStrategy;
}

interface ResolvedStrategies {
  readonly impact: TokenImpactStrategy;
  readonly rename: TokenRenameStrategy;
  readonly summary: TokenSummaryStrategy;
}

export interface TokenChangeCollections {
  readonly added: TokenAddition[];
  readonly removed: TokenRemoval[];
  readonly changed: TokenModification[];
}

const defaultImpactStrategy = new DefaultTokenImpactStrategy();
const defaultRenameStrategy = new DefaultTokenRenameStrategy();
const defaultSummaryStrategy = new DefaultTokenSummaryStrategy();

function resolveStrategies(options: DiffEngineOptions = {}): ResolvedStrategies {
  return {
    impact: options.impactStrategy ?? defaultImpactStrategy,
    rename: options.renameStrategy ?? defaultRenameStrategy,
    summary: options.summaryStrategy ?? defaultSummaryStrategy,
  };
}

/**
 * Computes the diff between two token sets using the configured impact, rename,
 * and summary strategies.
 *
 * @param previous - The baseline token collection.
 * @param next - The updated token collection.
 * @param options - Optional strategy overrides for the diff engine.
 * @returns The aggregated diff including additions, removals, changes, renames, and summary data.
 */
export function diffTokenSets(
  previous: TokenSetLike,
  next: TokenSetLike,
  options: DiffEngineOptions = {},
): TokenDiffResult {
  const { impact, rename, summary } = resolveStrategies(options);
  const previousMap = toTokenMap(previous);
  const nextMap = toTokenMap(next);

  const { added, removed, changed } = collectTokenChanges(previousMap, nextMap, impact);
  const { renamed, remainingRemoved, remainingAdded } = detectTokenRenames(
    removed,
    added,
    impact,
    rename,
  );

  const summaryInput: SummaryInput = {
    previous: previousMap,
    next: nextMap,
    added: remainingAdded,
    removed: remainingRemoved,
    changed,
    renamed,
  };

  const summaryResult = summary.createSummary(summaryInput);

  return {
    added: remainingAdded,
    removed: remainingRemoved,
    changed,
    renamed,
    summary: summaryResult,
  };
}

/**
 * Filters a diff result using the provided filter options and recomputes the
 * summary for the reduced set.
 *
 * @param diff - The original diff result to filter.
 * @param previous - The baseline token collection.
 * @param next - The updated token collection.
 * @param filter - The filter describing which changes to keep.
 * @param options - Optional summary strategy overrides.
 * @returns A diff result constrained to the requested filter.
 */
export function filterTokenDiff(
  diff: TokenDiffResult,
  previous: TokenSetLike,
  next: TokenSetLike,
  filter: TokenDiffFilter,
  options: DiffEngineOptions = {},
): TokenDiffResult {
  const { summary } = resolveStrategies(options);
  const normalized = normalizeDiffFilter(filter);

  if (!normalized) {
    return diff;
  }

  const previousMap = toTokenMap(previous);
  const nextMap = toTokenMap(next);

  const excludedPreviousIds = new Set<string>();
  const excludedNextIds = new Set<string>();

  const added: TokenAddition[] = [];

  for (const entry of diff.added) {
    if (
      matchesChange(undefined, undefined, entry.id, entry.next, normalized, entry.impact, 'added')
    ) {
      added.push(entry);
    } else {
      excludedNextIds.add(entry.id);
    }
  }

  const removed: TokenRemoval[] = [];

  for (const entry of diff.removed) {
    if (
      matchesChange(
        entry.id,
        entry.previous,
        undefined,
        undefined,
        normalized,
        entry.impact,
        'removed',
      )
    ) {
      removed.push(entry);
    } else {
      excludedPreviousIds.add(entry.id);
    }
  }

  const renamed: TokenRename[] = [];

  for (const entry of diff.renamed) {
    if (
      matchesChange(
        entry.previousId,
        entry.previous,
        entry.nextId,
        entry.next,
        normalized,
        entry.impact,
        'renamed',
      )
    ) {
      renamed.push(entry);
    } else {
      excludedPreviousIds.add(entry.previousId);
      excludedNextIds.add(entry.nextId);
    }
  }

  const changed: TokenModification[] = [];

  for (const entry of diff.changed) {
    if (
      matchesChange(
        entry.id,
        entry.previous,
        entry.id,
        entry.next,
        normalized,
        entry.impact,
        'changed',
      )
    ) {
      changed.push(entry);
    } else {
      excludedPreviousIds.add(entry.id);
      excludedNextIds.add(entry.id);
    }
  }

  let restrictedPreviousIds: ReadonlySet<string> | undefined;
  let restrictedNextIds: ReadonlySet<string> | undefined;

  if (normalized.kinds.length > 0) {
    const previousScope = new Set<string>();
    const nextScope = new Set<string>();

    for (const entry of removed) {
      previousScope.add(entry.id);
    }

    for (const entry of renamed) {
      previousScope.add(entry.previousId);
      nextScope.add(entry.nextId);
    }

    for (const entry of changed) {
      previousScope.add(entry.id);
      nextScope.add(entry.id);
    }

    for (const entry of added) {
      nextScope.add(entry.id);
    }

    restrictedPreviousIds = previousScope;
    restrictedNextIds = nextScope;
  }

  const matchingPreviousIds = collectMatchingIds(previousMap, normalized, {
    excluded: excludedPreviousIds,
    ...(restrictedPreviousIds === undefined ? {} : { only: restrictedPreviousIds }),
  });
  const matchingNextIds = collectMatchingIds(nextMap, normalized, {
    excluded: excludedNextIds,
    ...(restrictedNextIds === undefined ? {} : { only: restrictedNextIds }),
  });

  const scope: SummaryScope = {
    previousIds: restrictedPreviousIds ?? matchingPreviousIds,
    nextIds: restrictedNextIds ?? matchingNextIds,
  } satisfies SummaryScope;

  const summaryInput: SummaryInput = {
    previous: previousMap,
    next: nextMap,
    added,
    removed,
    changed,
    renamed,
    scope,
  };

  return {
    added,
    removed,
    changed,
    renamed,
    summary: summary.createSummary(summaryInput),
  };
}

/**
 * Aggregates token additions, removals, and modifications between two token
 * maps using the provided impact strategy.
 *
 * @param previous - The baseline token map keyed by id.
 * @param next - The updated token map keyed by id.
 * @param impactStrategy - Strategy used to classify change impact levels.
 * @returns Collections of added, removed, and changed tokens.
 */
export function collectTokenChanges(
  previous: ReadonlyMap<string, TokenSnapshot>,
  next: ReadonlyMap<string, TokenSnapshot>,
  impactStrategy: TokenImpactStrategy = defaultImpactStrategy,
): TokenChangeCollections {
  const added: TokenAddition[] = [];
  const removed: TokenRemoval[] = [];
  const changed: TokenModification[] = [];

  for (const [id, previousToken] of previous) {
    const nextToken = next.get(id);

    if (!nextToken) {
      removed.push({
        kind: 'removed',
        id,
        previous: previousToken,
        impact: impactStrategy.classifyRemoval(previousToken),
      });
      continue;
    }

    const changes = collectFieldChanges(previousToken, nextToken);

    if (changes.length > 0) {
      changed.push({
        kind: 'changed',
        id,
        previous: previousToken,
        next: nextToken,
        changes,
        impact: impactStrategy.classifyModification(previousToken, nextToken, changes),
      });
    }
  }

  for (const [id, nextToken] of next) {
    if (previous.has(id)) {
      continue;
    }

    added.push({
      kind: 'added',
      id,
      next: nextToken,
      impact: impactStrategy.classifyAddition(nextToken),
    });
  }

  return { added, removed, changed };
}

/**
 * Detects token renames by comparing removed and added tokens.
 *
 * @param removed - Tokens removed from the baseline set.
 * @param added - Tokens added to the updated set.
 * @param impactStrategy - Strategy used to evaluate change impact.
 * @param renameStrategy - Strategy responsible for pairing tokens as renames.
 * @returns The rename detection result including matches and remaining tokens.
 */
export function detectTokenRenames(
  removed: readonly TokenRemoval[],
  added: readonly TokenAddition[],
  impactStrategy: TokenImpactStrategy = defaultImpactStrategy,
  renameStrategy: TokenRenameStrategy = defaultRenameStrategy,
): RenameDetectionResult {
  return renameStrategy.detectRenames(removed, added, impactStrategy);
}

/**
 * Builds a token diff summary using the configured summary strategy.
 *
 * @param previous - The baseline token map.
 * @param next - The updated token map.
 * @param added - Tokens added in the diff.
 * @param removed - Tokens removed in the diff.
 * @param changed - Tokens changed in the diff.
 * @param renamed - Tokens paired as renames.
 * @param summaryStrategy - Optional summary strategy override.
 * @param scope - An optional scope applied to the summary strategy.
 * @returns The computed summary describing change impact and totals.
 */
export function summarizeTokenDiff(
  previous: ReadonlyMap<string, TokenSnapshot>,
  next: ReadonlyMap<string, TokenSnapshot>,
  added: readonly TokenAddition[],
  removed: readonly TokenRemoval[],
  changed: readonly TokenModification[],
  renamed: readonly TokenRename[],
  summaryStrategy: TokenSummaryStrategy = defaultSummaryStrategy,
  scope?: SummaryScope,
): TokenDiffSummary {
  const summaryInput: SummaryInput = {
    previous,
    next,
    added,
    removed,
    changed,
    renamed,
    ...(scope === undefined ? {} : { scope }),
  };

  return summaryStrategy.createSummary(summaryInput);
}

/**
 * Recommends a semantic version bump from an aggregated diff result.
 *
 * @param diff - The full diff result to analyse.
 * @returns The recommended version bump.
 */
export function recommendVersionBump(diff: TokenDiffResult): VersionBump;
/**
 * Recommends a semantic version bump from individual change collections.
 *
 * @param added - Tokens added in the diff.
 * @param removed - Tokens removed in the diff.
 * @param changed - Tokens changed in the diff.
 * @param renamed - Tokens matched as renames.
 * @returns The recommended version bump.
 */
export function recommendVersionBump(
  added: readonly TokenAddition[],
  removed: readonly TokenRemoval[],
  changed: readonly TokenModification[],
  renamed: readonly TokenRename[],
): VersionBump;
export function recommendVersionBump(
  diffOrAdded: TokenDiffResult | readonly TokenAddition[],
  removed?: readonly TokenRemoval[],
  changed?: readonly TokenModification[],
  renamed?: readonly TokenRename[],
): VersionBump {
  if (!Array.isArray(diffOrAdded)) {
    const diff = diffOrAdded as TokenDiffResult;
    return recommendVersionBumpFromSummary(diff.added, diff.removed, diff.changed, diff.renamed);
  }

  return recommendVersionBumpFromSummary(diffOrAdded, removed ?? [], changed ?? [], renamed ?? []);
}

interface NormalizedDiffFilter {
  readonly types: readonly string[];
  readonly paths: readonly string[];
  readonly impacts: readonly TokenChangeImpact[];
  readonly kinds: readonly TokenChangeKind[];
  readonly groups: readonly string[];
}

function normalizeDiffFilter(
  filter: TokenDiffFilter | undefined,
): NormalizedDiffFilter | undefined {
  if (!filter) {
    return undefined;
  }

  const typeSet = new Set<string>();

  for (const type of filter.types ?? []) {
    const normalized = type.trim().toLowerCase();

    if (normalized.length > 0) {
      typeSet.add(normalized);
    }
  }

  const pathSet = new Set<string>();
  const impactSet = new Set<TokenChangeImpact>();
  const kindSet = new Set<TokenChangeKind>();
  const groupSet = new Set<string>();

  for (const path of filter.paths ?? []) {
    const normalized = normalizePointerPrefix(path);

    if (normalized) {
      pathSet.add(normalized);
    }
  }

  for (const impact of collectImpacts(filter)) {
    impactSet.add(impact);
  }

  for (const kind of collectKinds(filter)) {
    kindSet.add(kind);
  }

  for (const group of filter.groups ?? []) {
    const normalized = normalizeGroupName(group);

    if (normalized) {
      groupSet.add(normalized);
    }
  }

  if (
    typeSet.size === 0 &&
    pathSet.size === 0 &&
    impactSet.size === 0 &&
    kindSet.size === 0 &&
    groupSet.size === 0
  ) {
    return undefined;
  }

  return {
    types: [...typeSet],
    paths: [...pathSet],
    impacts: [...impactSet],
    kinds: [...kindSet],
    groups: [...groupSet],
  };
}

function collectImpacts(filter: TokenDiffFilter): readonly TokenChangeImpact[] {
  const impacts: TokenChangeImpact[] = [];
  const alias = filter.impact;

  if (alias !== undefined) {
    if (isImpactArray(alias)) {
      impacts.push(...alias);
    } else {
      impacts.push(alias);
    }
  }

  if (filter.impacts) {
    impacts.push(...filter.impacts);
  }

  return impacts;
}

function isImpactArray(value: TokenDiffFilter['impact']): value is readonly TokenChangeImpact[] {
  return Array.isArray(value);
}

function collectKinds(filter: TokenDiffFilter): readonly TokenChangeKind[] {
  const kinds: TokenChangeKind[] = [];
  const alias = filter.kind;

  if (alias !== undefined) {
    if (isKindArray(alias)) {
      kinds.push(...alias);
    } else {
      kinds.push(alias);
    }
  }

  if (filter.kinds) {
    kinds.push(...filter.kinds);
  }

  return kinds;
}

function isKindArray(value: TokenDiffFilter['kind']): value is readonly TokenChangeKind[] {
  return Array.isArray(value);
}

function matchesChange(
  previousId: string | undefined,
  previousToken: TokenSnapshot | undefined,
  nextId: string | undefined,
  nextToken: TokenSnapshot | undefined,
  filter: NormalizedDiffFilter,
  impact: TokenChangeImpact,
  kind: TokenChangeKind,
): boolean {
  if (!matchesKind(kind, filter.kinds)) {
    return false;
  }

  if (!matchesImpact(impact, filter.impacts)) {
    return false;
  }

  if (
    previousId !== undefined &&
    previousToken !== undefined &&
    matchesSnapshot(previousId, previousToken, filter)
  ) {
    return true;
  }

  if (nextId !== undefined && nextToken !== undefined) {
    return matchesSnapshot(nextId, nextToken, filter);
  }

  return false;
}

function matchesSnapshot(
  id: string,
  snapshot: TokenSnapshot,
  filter: NormalizedDiffFilter,
): boolean {
  return (
    matchesType(snapshot.type, filter.types) &&
    matchesGroup(snapshot.path, filter.groups) &&
    matchesPath(id, filter.paths)
  );
}

function matchesKind(kind: TokenChangeKind, kinds: readonly TokenChangeKind[]): boolean {
  if (kinds.length === 0) {
    return true;
  }

  return kinds.includes(kind);
}

function matchesImpact(impact: TokenChangeImpact, impacts: readonly TokenChangeImpact[]): boolean {
  if (impacts.length === 0) {
    return true;
  }

  return impacts.includes(impact);
}

function matchesPath(id: string, paths: readonly string[]): boolean {
  if (paths.length === 0) {
    return true;
  }

  return paths.some((prefix) => id.startsWith(prefix));
}

function matchesType(type: string | undefined, types: readonly string[]): boolean {
  if (types.length === 0) {
    return true;
  }

  if (!type) {
    return false;
  }

  return types.includes(type.toLowerCase());
}

const ROOT_GROUP_LABEL = '(root)';

function matchesGroup(path: TokenPath, groups: readonly string[]): boolean {
  if (groups.length === 0) {
    return true;
  }

  const normalizedPath = normalizeTokenPathForGroups(path);

  if (normalizedPath.length === 0) {
    return groups.includes(ROOT_GROUP_LABEL);
  }

  for (const group of groups) {
    if (group === ROOT_GROUP_LABEL) {
      continue;
    }

    const groupSegments = group.split('/');

    if (groupSegments.length === 0) {
      continue;
    }

    if (groupSegments.length > normalizedPath.length) {
      continue;
    }

    const matches = groupSegments.every(
      (segment, segmentIndex) => normalizedPath[segmentIndex] === segment,
    );

    if (matches) {
      return true;
    }
  }

  return false;
}

function normalizeTokenPathForGroups(path: TokenPath): string[] {
  const segments: string[] = [];

  for (const part of path) {
    const normalized = normalizeGroupSegment(part);

    if (normalized) {
      segments.push(normalized);
    }
  }

  return segments;
}

function normalizeGroupSegment(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.toLowerCase();
}

function normalizeGroupName(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const segments = splitGroupSegments(value)
    .map((segment) => normalizeGroupSegment(segment))
    .filter((segment): segment is string => segment !== undefined);

  if (segments.length === 0) {
    return undefined;
  }

  return segments.join('/');
}

function splitGroupSegments(value: string): readonly string[] {
  return value.split(/[\\/>]+/u);
}

function collectMatchingIds(
  tokens: ReadonlyMap<string, TokenSnapshot>,
  filter: NormalizedDiffFilter,
  options: {
    readonly excluded?: ReadonlySet<string>;
    readonly only?: ReadonlySet<string>;
  },
): ReadonlySet<string> {
  const ids = new Set<string>();

  for (const [id, snapshot] of tokens) {
    if (options.excluded?.has(id)) {
      continue;
    }

    if (options.only && !options.only.has(id)) {
      continue;
    }

    if (!matchesType(snapshot.type, filter.types)) {
      continue;
    }

    if (!matchesGroup(snapshot.path, filter.groups)) {
      continue;
    }

    if (!matchesPath(id, filter.paths)) {
      continue;
    }

    ids.add(id);
  }

  return ids;
}

function normalizePointerPrefix(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.startsWith('#/')) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return `#${trimmed}`;
  }

  return `#/${trimmed}`;
}

function collectFieldChanges(previous: TokenSnapshot, next: TokenSnapshot): TokenFieldChange[] {
  const changes: TokenFieldChange[] = [];

  if (!valuesEqual(previous.value, next.value)) {
    changes.push('value');
  }

  if (!valuesEqual(previous.raw, next.raw)) {
    changes.push('raw');
  }

  if (previous.ref !== next.ref) {
    changes.push('ref');
  }

  if (!stringsEqual(previous.type, next.type)) {
    changes.push('type');
  }

  if (!stringsEqual(previous.description, next.description)) {
    changes.push('description');
  }

  if (!recordsEqual(previous.extensions, next.extensions)) {
    changes.push('extensions');
  }

  if (!deprecationsEqual(previous.deprecated, next.deprecated)) {
    changes.push('deprecated');
  }

  if (!pointersEqual(previous.references, next.references)) {
    changes.push('references');
  }

  if (!pointersEqual(previous.resolutionPath, next.resolutionPath)) {
    changes.push('resolutionPath');
  }

  if (!pointersEqual(previous.appliedAliases, next.appliedAliases)) {
    changes.push('appliedAliases');
  }

  return changes;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}

function stringsEqual(left: string | undefined, right: string | undefined): boolean {
  if (left === undefined && right === undefined) {
    return true;
  }

  if (left === undefined || right === undefined) {
    return false;
  }

  return left === right;
}

function recordsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => valuesEqual(left[key], right[key]));
}

function deprecationsEqual(
  left: TokenSnapshot['deprecated'],
  right: TokenSnapshot['deprecated'],
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.reason === right.reason &&
    left.since === right.since &&
    pointersEqual(
      left.supersededBy ? [left.supersededBy] : [],
      right.supersededBy ? [right.supersededBy] : [],
    )
  );
}

function pointersEqual(previous: readonly TokenPointer[], next: readonly TokenPointer[]): boolean {
  if (previous.length !== next.length) {
    return false;
  }

  return previous.every((previousPointer, index) => {
    const nextPointer = next[index];
    return (
      nextPointer !== undefined &&
      previousPointer.pointer === nextPointer.pointer &&
      previousPointer.uri === nextPointer.uri &&
      (previousPointer.external ?? false) === (nextPointer.external ?? false)
    );
  });
}

function toTokenMap(input: TokenSetLike): ReadonlyMap<string, TokenSnapshot> {
  if (isMap(input)) {
    return input;
  }

  return input.tokens;
}

function isMap(value: unknown): value is ReadonlyMap<string, TokenSnapshot> {
  return value instanceof Map;
}

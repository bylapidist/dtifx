import { isDeepStrictEqual } from 'node:util';

import type { TokenAddition, TokenRemoval, TokenRename } from '../diff-types.js';
import type { TokenSnapshot, TokenPointer } from '../tokens.js';
import type { TokenImpactStrategy } from './impact.js';

export interface RenameDetectionResult {
  readonly renamed: TokenRename[];
  readonly remainingRemoved: readonly TokenRemoval[];
  readonly remainingAdded: readonly TokenAddition[];
}

export interface TokenRenameStrategy {
  detectRenames(
    removed: readonly TokenRemoval[],
    added: readonly TokenAddition[],
    impactStrategy: TokenImpactStrategy,
  ): RenameDetectionResult;
}

export type RenameMatchPredicate = (previous: TokenSnapshot, next: TokenSnapshot) => boolean;

export interface StructuralRenameStrategyOptions {
  readonly includeValue?: boolean;
  readonly includeRaw?: boolean;
  readonly includeRef?: boolean;
  readonly includeType?: boolean;
  readonly includeExtensions?: boolean;
  readonly includeDeprecated?: boolean;
  readonly includeReferences?: boolean;
  readonly normalizeType?: (type: string | undefined) => string | undefined;
  readonly normalizeDeprecated?: (
    deprecation: TokenSnapshot['deprecated'],
  ) => Record<string, unknown> | undefined;
  readonly formatPointer?: (pointer: TokenPointer) => string;
}

/**
 * Builds a rename strategy that relies on a custom predicate to pair tokens.
 *
 * @param matchPredicate - Predicate used to determine whether tokens represent a rename.
 * @returns A token rename strategy powered by the predicate.
 */
export function createTokenRenameStrategy(
  matchPredicate: RenameMatchPredicate,
): TokenRenameStrategy {
  return {
    detectRenames(removed, added, impactStrategy) {
      return detectRenamesWithMatcher(removed, added, impactStrategy, matchPredicate);
    },
  };
}

/**
 * Default rename strategy that compares token structure to identify renames.
 */
export class DefaultTokenRenameStrategy implements TokenRenameStrategy {
  private readonly delegate = createStructuralRenameStrategy();

  detectRenames(
    removed: readonly TokenRemoval[],
    added: readonly TokenAddition[],
    impactStrategy: TokenImpactStrategy,
  ): RenameDetectionResult {
    return this.delegate.detectRenames(removed, added, impactStrategy);
  }
}

/**
 * Creates a rename strategy that compares configurable structural aspects of
 * tokens to detect renames.
 *
 * @param options - Options controlling which fields and normalisers to use when comparing tokens.
 * @returns A rename strategy driven by structural comparisons.
 */
export function createStructuralRenameStrategy(
  options: StructuralRenameStrategyOptions = {},
): TokenRenameStrategy {
  const matchPredicate: RenameMatchPredicate = (previous, next) => {
    return isDeepStrictEqual(
      createComparableSnapshot(previous, options),
      createComparableSnapshot(next, options),
    );
  };

  return createTokenRenameStrategy(matchPredicate);
}

function detectRenamesWithMatcher(
  removed: readonly TokenRemoval[],
  added: readonly TokenAddition[],
  impactStrategy: TokenImpactStrategy,
  matchPredicate: RenameMatchPredicate,
): RenameDetectionResult {
  if (removed.length === 0 || added.length === 0) {
    return {
      renamed: [],
      remainingRemoved: [...removed],
      remainingAdded: [...added],
    };
  }

  const matchedAdditions = new Set<number>();
  const renamed: TokenRename[] = [];
  const remainingRemoved: TokenRemoval[] = [];

  for (const removal of removed) {
    const matchIndex = findRenameMatchIndex(
      removal.previous,
      added,
      matchedAdditions,
      matchPredicate,
    );

    if (matchIndex < 0) {
      remainingRemoved.push(removal);
      continue;
    }

    const addition = added[matchIndex];
    if (addition === undefined) {
      remainingRemoved.push(removal);
      continue;
    }
    matchedAdditions.add(matchIndex);
    const impact = impactStrategy.classifyRename(removal.previous, addition.next);

    renamed.push({
      kind: 'renamed',
      impact,
      previousId: removal.id,
      nextId: addition.id,
      previous: removal.previous,
      next: addition.next,
    });
  }

  const remainingAdded = added.filter((_, index) => !matchedAdditions.has(index));

  return { renamed, remainingRemoved, remainingAdded };
}

function findRenameMatchIndex(
  previous: TokenSnapshot,
  additions: readonly TokenAddition[],
  matchedAdditions: ReadonlySet<number>,
  matchPredicate: RenameMatchPredicate,
): number {
  return additions.findIndex((candidate, index) => {
    return !matchedAdditions.has(index) && matchPredicate(previous, candidate.next);
  });
}

function createComparableSnapshot(
  snapshot: TokenSnapshot,
  options: StructuralRenameStrategyOptions,
): Record<string, unknown> {
  const comparable: Record<string, unknown> = {};

  if (options.includeValue ?? true) {
    comparable['value'] = snapshot.value;
  }

  if (options.includeRaw ?? true) {
    comparable['raw'] = snapshot.raw;
  }

  if (options.includeRef ?? true) {
    comparable['ref'] = snapshot.ref;
  }

  if (options.includeType ?? true) {
    const normalizer = options.normalizeType ?? normalizeTokenTypeForComparison;
    comparable['type'] = normalizer(snapshot.type);
  }

  if (options.includeExtensions ?? true) {
    comparable['extensions'] = snapshot.extensions;
  }

  if (options.includeDeprecated ?? true) {
    const normalizer =
      options.normalizeDeprecated ??
      ((deprecation: TokenSnapshot['deprecated']) =>
        normalizeDeprecationForComparison(deprecation, options));
    const normalized = normalizer(snapshot.deprecated);

    if (normalized !== undefined) {
      comparable['deprecated'] = normalized;
    }
  }

  if (options.includeReferences === true) {
    const normalized = normalizePointerListForComparison(snapshot.references, options);

    if (normalized !== undefined) {
      comparable['references'] = normalized;
    }
  }

  return comparable;
}

function normalizeTokenTypeForComparison(type: string | undefined): string | undefined {
  if (type === undefined) {
    return undefined;
  }

  const trimmed = type.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.toLowerCase();
}

function normalizePointerListForComparison(
  pointers: readonly TokenPointer[],
  options: StructuralRenameStrategyOptions,
): readonly string[] | undefined {
  if (pointers.length === 0) {
    return [];
  }

  const formatter = options.formatPointer ?? formatPointerSignature;

  return pointers
    .map((pointer) => formatter(pointer))
    .toSorted((left, right) => left.localeCompare(right));
}

function formatPointerSignature(pointer: TokenPointer): string {
  return JSON.stringify([pointer.uri, pointer.pointer, pointer.external === true]);
}

function normalizeDeprecationForComparison(
  deprecation: TokenSnapshot['deprecated'],
  options: StructuralRenameStrategyOptions,
): Record<string, unknown> | undefined {
  if (!deprecation) {
    return undefined;
  }

  const normalized: Record<string, unknown> = {};

  if (deprecation.reason !== undefined) {
    normalized['reason'] = deprecation.reason;
  }

  if (deprecation.since !== undefined) {
    normalized['since'] = deprecation.since;
  }

  if (deprecation.supersededBy) {
    const formatter = options.formatPointer ?? formatPointerSignature;
    normalized['supersededBy'] = formatter(deprecation.supersededBy);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

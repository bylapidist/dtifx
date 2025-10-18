import type { TokenSnapshot } from '../tokens.js';
import type { TokenChangeImpact, TokenFieldChange } from '../diff-types.js';

export interface TokenImpactStrategy {
  classifyAddition(token: TokenSnapshot): TokenChangeImpact;
  classifyRemoval(token: TokenSnapshot): TokenChangeImpact;
  classifyRename(previous: TokenSnapshot, next: TokenSnapshot): TokenChangeImpact;
  classifyModification(
    previous: TokenSnapshot,
    next: TokenSnapshot,
    changes: readonly TokenFieldChange[],
  ): TokenChangeImpact;
}

export interface FieldImpactStrategyOptions {
  readonly additionImpact?: TokenChangeImpact;
  readonly removalImpact?: TokenChangeImpact;
  readonly renameImpact?: TokenChangeImpact;
  readonly breakingModificationImpact?: TokenChangeImpact;
  readonly defaultModificationImpact?: TokenChangeImpact;
  readonly breakingFields?: readonly TokenFieldChange[];
}

const DEFAULT_BREAKING_FIELDS: ReadonlySet<TokenFieldChange> = new Set([
  'value',
  'raw',
  'ref',
  'type',
]);

/**
 * Creates a token impact strategy that classifies changes based on configured
 * field sensitivity.
 *
 * @param options - Overrides for the default impact classification behaviour.
 * @returns A strategy that evaluates token additions, removals, renames, and modifications.
 */
export function createFieldImpactStrategy(
  options: FieldImpactStrategyOptions = {},
): TokenImpactStrategy {
  const breakingFields = new Set<TokenFieldChange>(
    options.breakingFields ?? DEFAULT_BREAKING_FIELDS,
  );
  const additionImpact = options.additionImpact ?? 'non-breaking';
  const removalImpact = options.removalImpact ?? 'breaking';
  const renameImpact = options.renameImpact ?? 'breaking';
  const breakingModificationImpact = options.breakingModificationImpact ?? 'breaking';
  const defaultModificationImpact = options.defaultModificationImpact ?? 'non-breaking';

  return {
    classifyAddition() {
      return additionImpact;
    },
    classifyRemoval() {
      return removalImpact;
    },
    classifyRename() {
      return renameImpact;
    },
    classifyModification(_previous, _next, changes) {
      for (const field of changes) {
        if (breakingFields.has(field)) {
          return breakingModificationImpact;
        }
      }

      return defaultModificationImpact;
    },
  } satisfies TokenImpactStrategy;
}

/**
 * Default implementation of the token impact strategy that uses the field
 * impact strategy with standard settings.
 */
export class DefaultTokenImpactStrategy implements TokenImpactStrategy {
  private readonly delegate = createFieldImpactStrategy();

  classifyAddition(token: TokenSnapshot): TokenChangeImpact {
    return this.delegate.classifyAddition(token);
  }

  classifyRemoval(token: TokenSnapshot): TokenChangeImpact {
    return this.delegate.classifyRemoval(token);
  }

  classifyRename(previous: TokenSnapshot, next: TokenSnapshot): TokenChangeImpact {
    return this.delegate.classifyRename(previous, next);
  }

  classifyModification(
    previous: TokenSnapshot,
    next: TokenSnapshot,
    changes: readonly TokenFieldChange[],
  ): TokenChangeImpact {
    return this.delegate.classifyModification(previous, next, changes);
  }
}

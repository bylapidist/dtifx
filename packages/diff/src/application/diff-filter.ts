import type { TokenDiffFilter, TokenDiffResult } from '../domain/diff-types.js';
import { filterTokenDiff, type DiffEngineOptions } from '../domain/diff-engine.js';
import type { TokenSet } from '../domain/tokens.js';
import { resolveDiffFilter, type DiffFilterOptions } from './filters.js';

export interface DiffFilterEvaluation {
  readonly result: TokenDiffResult;
  readonly filter?: TokenDiffFilter;
  readonly applied: boolean;
}

export interface DiffFilterEvaluatorPort {
  evaluate(
    diff: TokenDiffResult,
    previous: TokenSet,
    next: TokenSet,
    options: DiffFilterOptions | undefined,
    engineOptions: DiffEngineOptions | undefined,
  ): DiffFilterEvaluation;
}

/**
 * Creates an evaluator that resolves filter options and applies them to a diff result.
 *
 * @returns A diff filter evaluator port used by the application layer.
 */
export function createDiffFilterEvaluator(): DiffFilterEvaluatorPort {
  return {
    evaluate(diff, previous, next, options, engineOptions) {
      const { applied, filter } = resolveDiffFilter(options);
      const result =
        applied && filter ? filterTokenDiff(diff, previous, next, filter, engineOptions) : diff;
      return {
        result,
        applied,
        ...(filter === undefined ? {} : { filter }),
      };
    },
  };
}

import type { TokenDiffResult } from '../domain/diff-types.js';
import { diffTokenSets, type DiffEngineOptions } from '../domain/diff-engine.js';
import type { TokenSet } from '../domain/tokens.js';

export interface DiffExecutorPort {
  execute(previous: TokenSet, next: TokenSet, options?: DiffEngineOptions): TokenDiffResult;
}

/**
 * Creates a diff executor that delegates to the domain diff engine.
 *
 * @returns A diff executor port for comparing token sets.
 */
export function createDiffExecutor(): DiffExecutorPort {
  return {
    execute(previous, next, options) {
      return diffTokenSets(previous, next, options);
    },
  };
}

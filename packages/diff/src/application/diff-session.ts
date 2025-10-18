import type { TokenDiffResult } from '../domain/diff-types.js';
import type { DiffEngineOptions } from '../domain/diff-engine.js';
import type { DiffFailurePolicy, DiffFailureResult } from '../domain/failure-policy.js';
import { evaluateDiffFailure } from '../domain/failure-policy.js';
import type { TokenSet } from '../domain/tokens.js';
import { createDiffExecutor, type DiffExecutorPort } from './diff-executor.js';
import {
  createDiffFilterEvaluator,
  type DiffFilterEvaluation,
  type DiffFilterEvaluatorPort,
} from './diff-filter.js';
import type { DiffFilterOptions } from './filters.js';
import { loadTokenSnapshots } from './token-loader.js';
import type { TokenSourcePort } from './ports/token-source.js';
import type { DiagnosticsPort } from './ports/diagnostics.js';

export interface DiffSessionDependencies {
  readonly tokenSource: TokenSourcePort;
  readonly diffExecutor?: DiffExecutorPort;
  readonly filterEvaluator?: DiffFilterEvaluatorPort;
  readonly diagnostics?: DiagnosticsPort;
}

export interface DiffSessionRequest {
  readonly filter?: DiffFilterOptions;
  readonly failure?: DiffFailurePolicy;
  readonly diff?: DiffEngineOptions;
}

export interface DiffSessionResult {
  readonly previous: TokenSet;
  readonly next: TokenSet;
  readonly diff: TokenDiffResult;
  readonly filteredDiff: TokenDiffResult;
  readonly filter?: DiffFilterEvaluation['filter'];
  readonly filterApplied: boolean;
  readonly failure: DiffFailureResult;
}

/**
 * Executes a diff session by loading tokens, generating a diff, applying filters,
 * and evaluating failure policies.
 *
 * @param dependencies - Ports required to load tokens, execute diffs, and emit diagnostics.
 * @param request - Diff options, filter configuration, and failure policies.
 * @returns The completed diff session result including filtered diff and failure outcome.
 */
export async function runDiffSession(
  dependencies: DiffSessionDependencies,
  request: DiffSessionRequest = {},
): Promise<DiffSessionResult> {
  const tokenLoaderResult = await loadTokenSnapshots(dependencies.tokenSource, {
    ...(dependencies.diagnostics === undefined ? {} : { diagnostics: dependencies.diagnostics }),
  });
  const diffExecutor = dependencies.diffExecutor ?? createDiffExecutor();
  const filterEvaluator = dependencies.filterEvaluator ?? createDiffFilterEvaluator();

  const diff = diffExecutor.execute(
    tokenLoaderResult.previous,
    tokenLoaderResult.next,
    request.diff,
  );
  const {
    result: filteredDiff,
    applied,
    filter,
  } = filterEvaluator.evaluate(
    diff,
    tokenLoaderResult.previous,
    tokenLoaderResult.next,
    request.filter,
    request.diff,
  );

  const failure = evaluateDiffFailure(filteredDiff, request.failure ?? {});

  return {
    previous: tokenLoaderResult.previous,
    next: tokenLoaderResult.next,
    diff,
    filteredDiff,
    ...(filter === undefined ? {} : { filter }),
    filterApplied: applied,
    failure,
  };
}

export { TokenSourceLoadError } from './token-loader.js';

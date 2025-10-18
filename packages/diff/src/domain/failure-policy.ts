import { createPolicyViolationSummary } from '@dtifx/core';

import type { TokenDiffResult } from './diff-types.js';

export type DiffFailureReason = 'breaking-changes' | 'token-changes';

export interface DiffFailurePolicy {
  readonly failOnBreaking?: boolean;
  readonly failOnChanges?: boolean;
}

export interface DiffFailureResult {
  readonly shouldFail: boolean;
  readonly reason?: DiffFailureReason;
  readonly matchedCount?: number;
}

/**
 * Evaluates whether a diff should fail based on the configured failure policy.
 *
 * @param diff - The diff result to evaluate.
 * @param policy - The policy describing which changes should trigger failure.
 * @returns The evaluation outcome including failure reason and match count.
 */
export function evaluateDiffFailure(
  diff: TokenDiffResult,
  policy: DiffFailurePolicy,
): DiffFailureResult {
  const totalChanges =
    diff.summary.added + diff.summary.removed + diff.summary.renamed + diff.summary.changed;

  const summary = createPolicyViolationSummary({
    error: diff.summary.breaking,
    warning: totalChanges,
  });

  if (policy.failOnBreaking && summary.severity.error > 0) {
    return {
      shouldFail: true,
      reason: 'breaking-changes',
      matchedCount: summary.severity.error,
    } satisfies DiffFailureResult;
  }

  if (policy.failOnChanges && totalChanges > 0) {
    return {
      shouldFail: true,
      reason: 'token-changes',
      matchedCount: totalChanges,
    } satisfies DiffFailureResult;
  }

  return { shouldFail: false } satisfies DiffFailureResult;
}

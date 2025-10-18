import type { OperationSummary } from '../report-descriptor.js';

export interface OperationSummaryDescriptor {
  readonly total: number;
  readonly parts: readonly string[];
  readonly changeLabel: string;
}

/**
 * Creates a summary descriptor for diff operations listing totals and labels.
 *
 * @param counts - The aggregate counts for additions, removals, changes, and renames.
 * @returns The derived descriptor used by layout components.
 */
export function createOperationSummaryDescriptor(
  counts: OperationSummary,
): OperationSummaryDescriptor {
  const total = counts.added + counts.changed + counts.removed + counts.renamed;
  const summaryParts: string[] = [];

  if (counts.changed > 0) {
    summaryParts.push(`${counts.changed.toString()} changed`);
  }

  if (counts.removed > 0) {
    summaryParts.push(`${counts.removed.toString()} removed`);
  }

  if (counts.added > 0) {
    summaryParts.push(`${counts.added.toString()} added`);
  }

  if (counts.renamed > 0) {
    summaryParts.push(`${counts.renamed.toString()} renamed`);
  }

  return {
    total,
    parts: summaryParts,
    changeLabel: total === 1 ? 'change' : 'changes',
  };
}

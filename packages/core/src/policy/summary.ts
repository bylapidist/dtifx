export const POLICY_SEVERITIES = ['error', 'warning', 'info'] as const;

export type PolicySeverity = (typeof POLICY_SEVERITIES)[number];

export interface PolicyViolationLike {
  readonly severity: PolicySeverity;
}

export interface PolicyViolationSummary {
  readonly violationCount: number;
  readonly severity: Readonly<Record<PolicySeverity, number>>;
}

function createEmptySeverityBuckets(): Record<PolicySeverity, number> {
  return { error: 0, warning: 0, info: 0 } satisfies Record<PolicySeverity, number>;
}

/**
 * Computes aggregate counts for policy violations grouped by severity.
 * @param {Iterable<PolicyViolationLike>} violations - Collection of violations to aggregate.
 * @returns {PolicyViolationSummary} Summary totals across all severities.
 */
export function summarisePolicyViolations(
  violations: Iterable<PolicyViolationLike>,
): PolicyViolationSummary {
  const buckets = createEmptySeverityBuckets();
  let violationCount = 0;

  for (const violation of violations) {
    buckets[violation.severity] += 1;
    violationCount += 1;
  }

  const severity = Object.freeze({
    error: buckets.error,
    warning: buckets.warning,
    info: buckets.info,
  }) as Readonly<Record<PolicySeverity, number>>;

  return { violationCount, severity } satisfies PolicyViolationSummary;
}

/**
 * Creates a policy violation summary from raw severity counts.
 * @param {Partial<Record<PolicySeverity, number>>} counts - Pre-computed severity buckets.
 * @returns {PolicyViolationSummary} Normalised summary with totals.
 */
export function createPolicyViolationSummary(
  counts: Partial<Record<PolicySeverity, number>> = {},
): PolicyViolationSummary {
  const buckets = createEmptySeverityBuckets();

  for (const severity of POLICY_SEVERITIES) {
    const value = counts[severity];
    if (typeof value === 'number' && Number.isFinite(value)) {
      buckets[severity] = Math.max(0, Math.trunc(value));
    }
  }

  const severity = Object.freeze({
    error: buckets.error,
    warning: buckets.warning,
    info: buckets.info,
  }) as Readonly<Record<PolicySeverity, number>>;

  return {
    violationCount: buckets.error + buckets.warning + buckets.info,
    severity,
  } satisfies PolicyViolationSummary;
}

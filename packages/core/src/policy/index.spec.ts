import { describe, expect, it } from 'vitest';

import {
  createPolicyViolationSummary,
  summarisePolicyViolations,
  type PolicyViolationLike,
} from './index.js';

describe('summarisePolicyViolations', () => {
  it('returns zero counts when empty', () => {
    const summary = summarisePolicyViolations([]);

    expect(summary.violationCount).toBe(0);
    expect(summary.severity).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it('aggregates severity tallies', () => {
    const violations: PolicyViolationLike[] = [
      { severity: 'error' },
      { severity: 'warning' },
      { severity: 'warning' },
      { severity: 'info' },
    ];

    const summary = summarisePolicyViolations(violations);

    expect(summary.violationCount).toBe(4);
    expect(summary.severity).toEqual({ error: 1, warning: 2, info: 1 });
  });
});

describe('createPolicyViolationSummary', () => {
  it('normalises missing counts to zero', () => {
    const summary = createPolicyViolationSummary();

    expect(summary.violationCount).toBe(0);
    expect(summary.severity).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it('clamps negative and fractional values', () => {
    const summary = createPolicyViolationSummary({
      error: -3.7,
      warning: 2.4,
      info: Number.POSITIVE_INFINITY,
    });

    expect(summary.violationCount).toBe(2);
    expect(summary.severity).toEqual({ error: 0, warning: 2, info: 0 });
  });
});

import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import {
  PolicyEngine,
  createRequireOwnerPolicy,
  summarisePolicyResults,
  type PolicyExecutionResult,
} from '../../index.js';
import { createPolicySnapshot } from '../../testing/policy-test-harness.js';

const pointerPrefix = appendJsonPointer(JSON_POINTER_ROOT, 'tokens');

describe('PolicyEngine', () => {
  it('evaluates registered definitions', async () => {
    const rules = [
      createRequireOwnerPolicy({
        extensionKey: 'net.lapidist.governance',
        field: 'owner',
        severity: 'error',
      }),
    ];
    const engine = new PolicyEngine({ rules });
    const results = await engine.run([createPolicySnapshot()]);
    expect(results).toHaveLength(1);
    expect(results[0]?.violations).toHaveLength(1);
    expect(results[0]?.violations[0]?.policy).toBe('governance.requireOwner');
  });
});

describe('summarisePolicyResults', () => {
  it('aggregates severities and counts', () => {
    const results: PolicyExecutionResult[] = [
      {
        name: 'policy.one',
        violations: [
          {
            policy: 'policy.one',
            pointer: appendJsonPointer(pointerPrefix, 'alpha'),
            snapshot: createPolicySnapshot(),
            severity: 'error',
            message: 'one',
          },
        ],
      },
      {
        name: 'policy.two',
        violations: [
          {
            policy: 'policy.two',
            pointer: appendJsonPointer(pointerPrefix, 'beta'),
            snapshot: createPolicySnapshot(),
            severity: 'warning',
            message: 'two',
          },
          {
            policy: 'policy.two',
            pointer: appendJsonPointer(pointerPrefix, 'gamma'),
            snapshot: createPolicySnapshot(),
            severity: 'info',
            message: 'three',
          },
        ],
      },
    ];

    const summary = summarisePolicyResults(results);
    expect(summary.policyCount).toBe(2);
    expect(summary.violationCount).toBe(3);
    expect(summary.severity).toEqual({ error: 1, warning: 1, info: 1 });
  });
});

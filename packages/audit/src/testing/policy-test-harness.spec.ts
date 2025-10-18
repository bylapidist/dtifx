import { describe, expect, it } from 'vitest';

import { createRequireOwnerPolicy } from '../domain/policies/default-policies.js';
import type { PolicyViolation } from '../domain/policies/policy-engine.js';

import { createPolicySnapshot, createPolicyTestHarness } from './policy-test-harness.js';

describe('createPolicyTestHarness', () => {
  it('provides helpers to run policies', async () => {
    const harness = createPolicyTestHarness({
      rules: [
        createRequireOwnerPolicy({
          extensionKey: 'net.lapidist.governance',
          field: 'owner',
          severity: 'error',
        }),
      ],
    });

    const snapshot = harness.createSnapshot({
      metadata: { extensions: {}, deprecated: undefined, tags: undefined },
    });

    const results = await harness.run({ snapshots: [snapshot] });
    expect(results).toHaveLength(1);
    const violations = results[0]?.violations ?? ([] as PolicyViolation[]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe('error');
  });

  it('creates default snapshots when none are provided', async () => {
    const harness = createPolicyTestHarness();
    const results = await harness.run();
    expect(results).toHaveLength(0);
  });
});

describe('createPolicySnapshot', () => {
  it('applies overrides', () => {
    const snapshot = createPolicySnapshot({
      token: { id: 'custom/token', type: 'dimension' },
    });
    expect(snapshot.token.id).toBe('custom/token');
    expect(snapshot.token.type).toBe('dimension');
  });
});

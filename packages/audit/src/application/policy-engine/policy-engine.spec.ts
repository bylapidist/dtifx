import { describe, expect, it } from 'vitest';

import { createRequireOwnerPolicy } from '../../domain/policies/default-policies.js';
import { createPolicySnapshot } from '../../testing/policy-test-harness.js';
import { createPolicyConfiguration } from '../configuration/policies.js';

import { policyEngine } from './policy-engine.js';

describe('policyEngine', () => {
  it('runs the engine with provided snapshots', async () => {
    const rules = [
      createRequireOwnerPolicy({
        extensionKey: 'net.lapidist.governance',
        field: 'owner',
        severity: 'error',
      }),
    ];
    const configuration = createPolicyConfiguration({ audit: { policies: [] } }, { rules });

    const snapshot = createPolicySnapshot({
      metadata: { extensions: {}, deprecated: undefined, tags: undefined },
    });

    const result = await policyEngine.run({ configuration, snapshot });

    expect(result.policies).toHaveLength(1);
    expect(result.findings).toHaveLength(1);
    expect(result.summary.policyCount).toBe(1);
    expect(result.summary.violationCount).toBe(1);
  });

  it('throws when no snapshots are provided', async () => {
    const configuration = createPolicyConfiguration({ audit: { policies: [] } });
    await expect(policyEngine.run({ configuration })).rejects.toThrow(
      'policyEngine.run requires either a snapshot or snapshots array.',
    );
  });

  it('returns empty findings when snapshots array is empty', async () => {
    const rules = [
      createRequireOwnerPolicy({
        extensionKey: 'net.lapidist.governance',
        field: 'owner',
        severity: 'warning',
      }),
    ];
    const configuration = createPolicyConfiguration({ audit: { policies: [] } }, { rules });

    const result = await policyEngine.run({ configuration, snapshots: [] });

    expect(result.findings).toHaveLength(0);
    expect(result.summary.violationCount).toBe(0);
  });

  it('uses snapshots array when provided', async () => {
    const rules = [
      createRequireOwnerPolicy({
        extensionKey: 'net.lapidist.governance',
        field: 'owner',
        severity: 'warning',
      }),
    ];
    const configuration = createPolicyConfiguration({ audit: { policies: [] } }, { rules });

    const snapshots = [
      createPolicySnapshot({
        metadata: { extensions: {}, deprecated: undefined, tags: undefined },
      }),
      createPolicySnapshot({
        metadata: {
          extensions: {
            'net.lapidist.governance': { owner: 'hello@lapidist.net' },
          },
        },
        token: { value: { colorSpace: 'srgb', components: [1, 1, 1] } },
      }),
    ];

    const result = await policyEngine.run({ configuration, snapshots });
    expect(result.policies).toHaveLength(1);
    expect(result.findings).toHaveLength(1);
    expect(result.summary.severity.warning).toBe(1);
  });
});

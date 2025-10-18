import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import {
  PolicyEngine,
  createPolicyRules,
  type PolicyConfigEntry,
  type PolicyExecutionResult,
  type PolicyViolation,
  type TokenSnapshot,
} from '../../index.js';

const pointerPrefix = appendJsonPointer(JSON_POINTER_ROOT, 'tokens');
const baseSnapshot: TokenSnapshot = {
  pointer: appendJsonPointer(pointerPrefix, 'color-primary'),
  sourcePointer: appendJsonPointer(pointerPrefix, 'color-primary', '$value'),
  token: {
    id: 'tokens/color-primary',
    pointer: appendJsonPointer(pointerPrefix, 'color-primary', '$value'),
    name: 'color-primary',
    path: ['tokens', 'color-primary'],
    type: 'color',
    value: { colorSpace: 'srgb', components: [0, 0, 0] },
    raw: { colorSpace: 'srgb', components: [0, 0, 0] },
  },
  provenance: {
    sourceId: 'foundation',
    layer: 'foundation',
    layerIndex: 0,
    uri: 'file://foundation.json',
    pointerPrefix,
  },
  context: {},
} satisfies TokenSnapshot;

describe('createPolicyRules', () => {
  it('returns empty array for empty input', () => {
    const rules = createPolicyRules();
    expect(rules).toHaveLength(0);
  });

  it('rejects duplicate names', () => {
    const entries: PolicyConfigEntry[] = [
      { name: 'governance.requireOwner' },
      { name: 'governance.requireOwner' },
    ];
    expect(() => createPolicyRules(entries)).toThrow(/Duplicate policy configuration/);
  });

  it('rejects unknown policy names', () => {
    const entries: PolicyConfigEntry[] = [{ name: 'governance.unknownPolicy' }];
    expect(() => createPolicyRules(entries)).toThrow(
      /Unknown policy "governance\.unknownPolicy" in configuration/,
    );
  });
});

describe('requireOwner policy', () => {
  it('uses defaults when no options provided', async () => {
    const results = await evaluatePolicies([{ name: 'governance.requireOwner' }], [baseSnapshot]);
    const violation = findViolation(results, 'governance.requireOwner');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
    expect(violation?.message).toBe(
      'Token is missing required owner metadata (net.lapidist.governance.owner).',
    );
    expect(violation?.details).toEqual({ reason: 'missing-metadata' });
  });

  it('respects custom options', async () => {
    const snapshot: TokenSnapshot = {
      ...baseSnapshot,
      metadata: {
        extensions: { 'company.metadata': {} },
        source: { uri: 'file://foundation.json', line: 1, column: 1 },
      },
    } satisfies TokenSnapshot;
    const results = await evaluatePolicies(
      [
        {
          name: 'governance.requireOwner',
          options: {
            extension: 'company.metadata',
            field: 'ownerTeam',
            severity: 'warning',
            message: 'Owner metadata missing',
          },
        },
      ],
      [snapshot],
    );
    const violation = findViolation(results, 'governance.requireOwner');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('warning');
    expect(violation?.message).toBe('Owner metadata missing');
    const details = violation?.details;
    expect(details).toBeDefined();
    const ownerDetails = details as {
      readonly reason: string;
      readonly extension: string;
      readonly field: string;
    };
    expect(ownerDetails.reason).toBe('missing-field');
    expect(ownerDetails.extension).toBe('company.metadata');
    expect(ownerDetails.field).toBe('ownerTeam');
  });
});

describe('requireTag policy', () => {
  it('accepts tag and tags options', async () => {
    const results = await evaluatePolicies(
      [
        {
          name: 'governance.requireTag',
          options: {
            tag: 'critical',
            tags: ['audit', 'critical'],
            severity: 'warning',
          },
        },
      ],
      [baseSnapshot],
    );
    const violation = findViolation(results, 'governance.requireTag');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('warning');
    const missingTags = (violation?.details as { missingTags?: unknown })?.missingTags;
    expect(Array.isArray(missingTags)).toBe(true);
    expect([...(missingTags as string[])].toSorted()).toEqual(['audit', 'critical']);
  });

  it('requires at least one tag option', () => {
    const entry: PolicyConfigEntry = {
      name: 'governance.requireTag',
      options: { severity: 'info' },
    };
    expect(() => createPolicyRules([entry])).toThrow(
      'Failed to parse options for policy "governance.requireTag": Policy "governance.requireTag" requires a "tag" or "tags" option to be provided.',
    );
  });
});

describe('deprecation replacement policy', () => {
  it('honours severity and message', async () => {
    const deprecatedSnapshot: TokenSnapshot = {
      ...baseSnapshot,
      metadata: {
        deprecated: {},
        extensions: {},
        source: { uri: 'file://foundation.json', line: 1, column: 1 },
      },
    } satisfies TokenSnapshot;
    const results = await evaluatePolicies(
      [
        {
          name: 'governance.deprecationHasReplacement',
          options: { severity: 'info', message: 'Replacement is required' },
        },
      ],
      [deprecatedSnapshot],
    );
    const violation = findViolation(results, 'governance.deprecationHasReplacement');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('info');
    expect(violation?.message).toBe('Replacement is required');
  });
});

describe('requireOverrideApproval policy', () => {
  const pointer = appendJsonPointer(pointerPrefix, 'button');
  const foundation: TokenSnapshot = {
    ...baseSnapshot,
    pointer,
    sourcePointer: appendJsonPointer(pointer, '$value'),
    token: {
      ...baseSnapshot.token,
      id: 'tokens/button',
      pointer: appendJsonPointer(pointer, '$value'),
      path: ['tokens', 'button'],
    },
    provenance: {
      ...baseSnapshot.provenance,
      layerIndex: 0,
      layer: 'foundation',
    },
  } satisfies TokenSnapshot;
  const override: TokenSnapshot = {
    ...foundation,
    provenance: {
      ...foundation.provenance,
      sourceId: 'brand',
      layer: 'brand',
      layerIndex: 1,
    },
  } satisfies TokenSnapshot;

  it('enforces layers and approvals', async () => {
    const results = await evaluatePolicies(
      [
        {
          name: 'governance.requireOverrideApproval',
          options: { layers: ['brand'], severity: 'error' },
        },
      ],
      [foundation, override],
    );
    const violation = findViolation(results, 'governance.requireOverrideApproval');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
    const details = violation?.details;
    expect(details).toBeDefined();
    const approvalDetails = details as {
      readonly reason: string;
      readonly extension: string;
      readonly field: string;
      readonly requiredApprovals: number;
      readonly overrides: readonly unknown[];
    };
    expect(approvalDetails.reason).toBe('missing-metadata');
    expect(approvalDetails.requiredApprovals).toBe(1);
    expect(approvalDetails.overrides).toHaveLength(1);
  });

  it('respects custom approval thresholds and context filters', async () => {
    const overrideWithMetadata: TokenSnapshot = {
      ...override,
      metadata: {
        extensions: {
          'net.lapidist.governance': {
            approvedBy: ['alice', 'bob'],
          },
        },
        source: { uri: 'file://brand.json', line: 1, column: 1 },
      },
      context: { platform: 'web' },
    } satisfies TokenSnapshot;
    const results = await evaluatePolicies(
      [
        {
          name: 'governance.requireOverrideApproval',
          options: {
            layers: ['brand'],
            minimumApprovals: 3,
            context: { platform: 'web' },
            severity: 'warning',
          },
        },
      ],
      [foundation, overrideWithMetadata],
    );
    const violation = findViolation(results, 'governance.requireOverrideApproval');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('warning');
    const details = violation?.details;
    expect(details).toBeDefined();
    const insufficientDetails = details as {
      readonly reason: string;
      readonly receivedApprovals: number;
      readonly requiredContext?: Readonly<Record<string, unknown>>;
    };
    expect(insufficientDetails.reason).toBe('insufficient-approvals');
    expect(insufficientDetails.receivedApprovals).toBe(2);
    expect(insufficientDetails.requiredContext).toEqual({ platform: 'web' });
  });
});

describe('wcag contrast policy', () => {
  it('parses thresholds and labels', async () => {
    const foreground: TokenSnapshot = {
      ...baseSnapshot,
      pointer: appendJsonPointer(pointerPrefix, 'foreground'),
      sourcePointer: appendJsonPointer(pointerPrefix, 'foreground', '$value'),
    } satisfies TokenSnapshot;
    const background: TokenSnapshot = {
      ...baseSnapshot,
      pointer: appendJsonPointer(pointerPrefix, 'background'),
      sourcePointer: appendJsonPointer(pointerPrefix, 'background', '$value'),
      token: {
        ...baseSnapshot.token,
        id: 'tokens/background',
        pointer: appendJsonPointer(pointerPrefix, 'background', '$value'),
      },
    } satisfies TokenSnapshot;
    const results = await evaluatePolicies(
      [
        {
          name: 'governance.wcagContrast',
          options: {
            severity: 'warning',
            minimum: 3,
            pairs: [
              {
                foreground: foreground.pointer,
                background: background.pointer,
                minimum: 4.5,
                label: 'Button label',
              },
            ],
          },
        },
      ],
      [foreground],
    );
    const violation = findViolation(results, 'governance.wcagContrast');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('warning');
    expect(violation?.details).toMatchObject({
      reason: 'background-missing',
      pairLabel: 'Button label',
    });
  });
});

async function evaluatePolicies(
  entries: readonly PolicyConfigEntry[],
  tokens: readonly TokenSnapshot[],
): Promise<PolicyExecutionResult[]> {
  const rules = createPolicyRules(entries);
  const engine = new PolicyEngine({ rules });
  return await engine.run(tokens);
}

function findViolation(
  results: readonly PolicyExecutionResult[],
  policyName: string,
): PolicyViolation | undefined {
  const policy = results.find((entry) => entry.name === policyName);
  if (!policy) {
    return undefined;
  }
  return policy.violations[0];
}

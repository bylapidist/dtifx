import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import {
  PolicyEngine,
  createDeprecationReplacementPolicy,
  createRequireOverrideApprovalPolicy,
  createRequireOwnerPolicy,
  createRequireTagPolicy,
  createWcagContrastPolicy,
  type PolicyTokenSnapshot,
  type PolicyRule,
  type PolicyViolation,
} from '../../index.js';

const pointerPrefix = appendJsonPointer(JSON_POINTER_ROOT, 'tokens');
const baseSnapshot: PolicyTokenSnapshot = {
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
} satisfies PolicyTokenSnapshot;

describe('createRequireOwnerPolicy', () => {
  it('uses defaults when no options provided', async () => {
    const results = await evaluatePolicies(
      [
        createRequireOwnerPolicy({
          extensionKey: 'net.lapidist.governance',
          field: 'owner',
          severity: 'error',
        }),
      ],
      [baseSnapshot],
    );
    const violation = findViolation(results, 'governance.requireOwner');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
    expect(violation?.message).toBe(
      'Token is missing required owner metadata (net.lapidist.governance.owner).',
    );
    expect(violation?.details).toEqual({ reason: 'missing-metadata' });
  });

  it('respects custom options', async () => {
    const snapshot: PolicyTokenSnapshot = {
      ...baseSnapshot,
      metadata: {
        extensions: { 'company.metadata': {} },
        source: { uri: 'file://foundation.json', line: 1, column: 1 },
      },
    } satisfies PolicyTokenSnapshot;
    const results = await evaluatePolicies(
      [
        createRequireOwnerPolicy({
          extensionKey: 'company.metadata',
          field: 'ownerTeam',
          severity: 'warning',
          message: 'Owner metadata missing',
        }),
      ],
      [snapshot],
    );
    const violation = findViolation(results, 'governance.requireOwner');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('warning');
    expect(violation?.message).toBe('Owner metadata missing');
    const details = violation?.details as
      | { readonly reason: string; readonly extension: string; readonly field: string }
      | undefined;
    expect(details?.reason).toBe('missing-field');
    expect(details?.extension).toBe('company.metadata');
    expect(details?.field).toBe('ownerTeam');
  });
});

describe('createRequireTagPolicy', () => {
  it('accepts tag and tags options', async () => {
    const results = await evaluatePolicies(
      [
        createRequireTagPolicy({
          tags: ['audit', 'critical', 'critical'],
          severity: 'warning',
        }),
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
});

describe('createDeprecationReplacementPolicy', () => {
  it('honours severity and message', async () => {
    const deprecatedSnapshot: PolicyTokenSnapshot = {
      ...baseSnapshot,
      metadata: {
        deprecated: {},
        extensions: {},
        source: { uri: 'file://foundation.json', line: 1, column: 1 },
      },
    } satisfies PolicyTokenSnapshot;
    const results = await evaluatePolicies(
      [
        createDeprecationReplacementPolicy({
          severity: 'info',
          message: 'Replacement is required',
        }),
      ],
      [deprecatedSnapshot],
    );
    const violation = findViolation(results, 'governance.deprecationHasReplacement');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('info');
    expect(violation?.message).toBe('Replacement is required');
  });
});

describe('createRequireOverrideApprovalPolicy', () => {
  const pointer = appendJsonPointer(pointerPrefix, 'button');
  const foundation: PolicyTokenSnapshot = {
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
  } satisfies PolicyTokenSnapshot;
  const override: PolicyTokenSnapshot = {
    ...foundation,
    provenance: {
      ...foundation.provenance,
      sourceId: 'brand',
      layer: 'brand',
      layerIndex: 1,
    },
  } satisfies PolicyTokenSnapshot;

  it('enforces layers and approvals', async () => {
    const results = await evaluatePolicies(
      [
        createRequireOverrideApprovalPolicy({
          layers: ['brand'],
          severity: 'error',
        }),
      ],
      [foundation, override],
    );
    const violation = findViolation(results, 'governance.requireOverrideApproval');
    expect(violation).toBeDefined();
    expect(violation?.details).toMatchObject({ reason: 'missing-metadata' });
  });

  it('passes when approvals meet threshold', async () => {
    const approvedOverride: PolicyTokenSnapshot = {
      ...override,
      metadata: {
        extensions: {
          'net.lapidist.governance': {
            approvedBy: ['design', 'product'],
          },
        },
      },
    } satisfies PolicyTokenSnapshot;
    const results = await evaluatePolicies(
      [
        createRequireOverrideApprovalPolicy({
          layers: ['brand'],
          severity: 'error',
          minimumApprovals: 2,
        }),
      ],
      [foundation, approvedOverride],
    );
    const violation = findViolation(results, 'governance.requireOverrideApproval');
    expect(violation).toBeUndefined();
  });
});

describe('createWcagContrastPolicy', () => {
  it('flags when contrast is below threshold', async () => {
    const foreground: PolicyTokenSnapshot = {
      ...baseSnapshot,
      pointer: appendJsonPointer(pointerPrefix, 'foreground'),
      sourcePointer: appendJsonPointer(pointerPrefix, 'foreground', '$value'),
      token: {
        ...baseSnapshot.token,
        id: 'tokens/foreground',
        pointer: appendJsonPointer(pointerPrefix, 'foreground', '$value'),
        value: { colorSpace: 'srgb', components: [0, 0, 0] },
        raw: { colorSpace: 'srgb', components: [0, 0, 0] },
      },
    } satisfies PolicyTokenSnapshot;
    const background: PolicyTokenSnapshot = {
      ...baseSnapshot,
      pointer: appendJsonPointer(pointerPrefix, 'background'),
      sourcePointer: appendJsonPointer(pointerPrefix, 'background', '$value'),
      token: {
        ...baseSnapshot.token,
        id: 'tokens/background',
        pointer: appendJsonPointer(pointerPrefix, 'background', '$value'),
        value: { colorSpace: 'srgb', components: [0.5, 0.5, 0.5] },
        raw: { colorSpace: 'srgb', components: [0.5, 0.5, 0.5] },
      },
    } satisfies PolicyTokenSnapshot;

    const results = await evaluatePolicies(
      [
        createWcagContrastPolicy({
          severity: 'error',
          pairs: [
            {
              foreground: foreground.pointer,
              background: background.pointer,
              minimum: 7,
              label: 'Foreground on background',
            },
          ],
        }),
      ],
      [foreground, background],
    );
    const violation = findViolation(results, 'governance.wcagContrast');
    expect(violation).toBeDefined();
    expect(violation?.details).toMatchObject({ reason: 'contrast-below-threshold' });
  });
});

async function evaluatePolicies(
  rules: readonly PolicyRule[],
  snapshots: readonly PolicyTokenSnapshot[],
): Promise<readonly PolicyViolation[]> {
  const engine = new PolicyEngine({ rules });
  const results = await engine.run(snapshots);
  return results.flatMap((result) => result.violations);
}

function findViolation(
  violations: readonly PolicyViolation[],
  name: string,
): PolicyViolation | undefined {
  return violations.find((entry) => entry.policy === name);
}

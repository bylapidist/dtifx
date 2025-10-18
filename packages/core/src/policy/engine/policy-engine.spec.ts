import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import {
  PolicyEngine,
  createPolicyRulesFromDefinitions,
  summarisePolicyResults,
  type PolicyDefinition,
  type PolicyExecutionResult,
  type PolicyTokenSnapshot,
} from './index.js';

const pointerPrefix = appendJsonPointer(JSON_POINTER_ROOT, 'tokens');

function createSnapshot(overrides: Partial<PolicyTokenSnapshot> = {}): PolicyTokenSnapshot {
  return {
    pointer: appendJsonPointer(pointerPrefix, 'token'),
    sourcePointer: appendJsonPointer(pointerPrefix, 'token', '$value'),
    token: {
      id: 'tokens/token',
      pointer: appendJsonPointer(pointerPrefix, 'token', '$value'),
      name: 'token',
      path: ['tokens', 'token'],
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
    ...overrides,
  } satisfies PolicyTokenSnapshot;
}

describe('PolicyEngine', () => {
  it('feeds token facts into the rules engine with selector-aware context', async () => {
    const baseSnapshot = createSnapshot({
      pointer: appendJsonPointer(pointerPrefix, 'background'),
      token: { id: 'background', type: 'color', value: '#111111' },
      provenance: { layerIndex: 0 },
    });
    const overrideSnapshot = createSnapshot({
      pointer: appendJsonPointer(pointerPrefix, 'background'),
      token: { id: 'background', type: 'color', value: '#222222' },
      provenance: { layerIndex: 2, layer: 'theme' },
    });
    const dimensionSnapshot = createSnapshot({
      pointer: appendJsonPointer(pointerPrefix, 'spacing'),
      token: { id: 'spacing', type: 'dimension', value: 8 },
    });

    const invocations: PolicyTokenSnapshot[] = [];

    const definitions: PolicyDefinition[] = [
      {
        name: 'example.policy',
        selector: { types: ['color'] },
        run: (input, context) => {
          invocations.push(input.snapshot);

          const latest = context.getByPointer(input.pointer);
          expect(latest?.pointer).toBe(overrideSnapshot.pointer);
          const history = context.getAllByPointer(input.pointer);
          expect(history).toHaveLength(2);
          expect(history[0]).toBe(baseSnapshot);
          expect(history[1]).toBe(overrideSnapshot);
          expect(context.getById('background')).toBe(overrideSnapshot);

          if (input.snapshot === overrideSnapshot) {
            return { severity: 'warning', message: 'override detected' };
          }

          return;
        },
      },
    ];

    const rules = createPolicyRulesFromDefinitions(definitions);
    const engine = new PolicyEngine({ rules });
    const results = await engine.run([baseSnapshot, overrideSnapshot, dimensionSnapshot]);

    expect(invocations).toHaveLength(2);
    expect(invocations).toContain(baseSnapshot);
    expect(invocations).toContain(overrideSnapshot);

    expect(results).toHaveLength(1);
    expect(results[0]?.violations).toHaveLength(1);
    expect(results[0]?.violations[0]?.severity).toBe('warning');
    expect(results[0]?.violations[0]?.message).toBe('override detected');
    expect(results[0]?.violations[0]?.snapshot).toBe(overrideSnapshot);
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
            snapshot: createSnapshot(),
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
            snapshot: createSnapshot(),
            severity: 'warning',
            message: 'two',
          },
          {
            policy: 'policy.two',
            pointer: appendJsonPointer(pointerPrefix, 'gamma'),
            snapshot: createSnapshot(),
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

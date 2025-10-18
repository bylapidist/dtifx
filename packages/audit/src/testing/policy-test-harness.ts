import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';

import {
  PolicyEngine,
  createPolicyRulesFromDefinitions,
  type PolicyDefinition,
  type PolicyExecutionResult,
  type PolicyRule,
} from '../domain/policies/policy-engine.js';
import type { PolicyTokenSnapshot } from '../domain/tokens/token-snapshot.js';

const pointerPrefix = appendJsonPointer(JSON_POINTER_ROOT, 'tokens');
const EMPTY_CONTEXT = Object.freeze(Object.create(null)) as PolicyTokenSnapshot['context'];

export interface PolicyTestHarnessOptions {
  readonly definitions?: readonly PolicyDefinition[];
  readonly rules?: readonly PolicyRule[];
}

export interface PolicyTestHarnessRunOptions {
  readonly snapshots?: readonly PolicyTokenSnapshot[];
}

export interface PolicyTestHarness {
  readonly rules: readonly PolicyRule[];
  readonly engine: PolicyEngine;
  createSnapshot(overrides?: Partial<PolicyTokenSnapshot>): PolicyTokenSnapshot;
  run(options?: PolicyTestHarnessRunOptions): Promise<readonly PolicyExecutionResult[]>;
}

/**
 * Creates a policy token snapshot fixture for use in tests.
 * @param {Partial<PolicyTokenSnapshot>} [overrides] - Custom properties to merge into the snapshot.
 * @returns {PolicyTokenSnapshot} Snapshot populated with reasonable defaults.
 */
export function createPolicySnapshot(
  overrides: Partial<PolicyTokenSnapshot> = {},
): PolicyTokenSnapshot {
  const basePointer = appendJsonPointer(pointerPrefix, 'token');
  const baseSourcePointer = appendJsonPointer(pointerPrefix, 'token', '$value');
  const baseToken = {
    id: 'tokens/token',
    type: 'color',
    value: { colorSpace: 'srgb', components: [0, 0, 0] },
    raw: { colorSpace: 'srgb', components: [0, 0, 0] },
  } satisfies PolicyTokenSnapshot['token'];
  const token: PolicyTokenSnapshot['token'] = { ...baseToken };
  if (overrides.token) {
    Object.assign(token, overrides.token);
  }
  const baseProvenance = {
    sourceId: 'foundation',
    layer: 'foundation',
    layerIndex: 0,
    uri: 'file://foundation.json',
    pointerPrefix,
  } satisfies PolicyTokenSnapshot['provenance'];
  const provenance: PolicyTokenSnapshot['provenance'] = { ...baseProvenance };
  if (overrides.provenance) {
    Object.assign(provenance, overrides.provenance);
  }
  const context = overrides.context === undefined ? EMPTY_CONTEXT : overrides.context;
  const snapshot: PolicyTokenSnapshot & {
    metadata?: PolicyTokenSnapshot['metadata'];
    resolution?: PolicyTokenSnapshot['resolution'];
  } = {
    pointer: overrides.pointer ?? basePointer,
    ...(overrides.sourcePointer === undefined
      ? { sourcePointer: baseSourcePointer }
      : { sourcePointer: overrides.sourcePointer }),
    token,
    provenance,
    context,
  } satisfies PolicyTokenSnapshot;
  if ('metadata' in overrides) {
    snapshot.metadata = overrides.metadata;
  }
  if ('resolution' in overrides) {
    snapshot.resolution = overrides.resolution;
  }
  return snapshot;
}

/**
 * Creates a reusable harness for evaluating policy definitions in tests.
 * @param {PolicyTestHarnessOptions} [options] - Registry and definition overrides for the harness.
 * @returns {PolicyTestHarness} Harness exposing helpers for running the policy engine.
 */
export function createPolicyTestHarness(options: PolicyTestHarnessOptions = {}): PolicyTestHarness {
  const rules = resolvePolicyRules(options);
  const engine = new PolicyEngine({ rules });

  return {
    rules,
    engine,
    createSnapshot(overrides?: Partial<PolicyTokenSnapshot>) {
      return createPolicySnapshot(overrides);
    },
    async run(options?: PolicyTestHarnessRunOptions) {
      const snapshots = options?.snapshots ?? [createPolicySnapshot()];
      return engine.run(snapshots);
    },
  } satisfies PolicyTestHarness;
}

function resolvePolicyRules(options: PolicyTestHarnessOptions): readonly PolicyRule[] {
  if (options.rules && options.rules.length > 0) {
    return options.rules;
  }

  const definitions = options.definitions ?? [];
  if (definitions.length > 0) {
    return createPolicyRulesFromDefinitions(definitions);
  }

  return [] as readonly PolicyRule[];
}

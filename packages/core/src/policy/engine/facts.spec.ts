import { describe, expect, it } from 'vitest';

import {
  createPolicyTokenFact,
  createPolicyTokenFactSet,
  mapPolicySeverityToPriority,
  POLICY_SEVERITY_PRIORITIES,
} from './facts.js';
import type { PolicyTokenSnapshot } from '../tokens/index.js';

describe('policy engine facts adapter', () => {
  it('maps severity values to deterministic rule priorities', () => {
    expect(mapPolicySeverityToPriority('error')).toBe(POLICY_SEVERITY_PRIORITIES.error);
    expect(mapPolicySeverityToPriority('warning')).toBe(POLICY_SEVERITY_PRIORITIES.warning);
    expect(mapPolicySeverityToPriority('info')).toBe(POLICY_SEVERITY_PRIORITIES.info);

    expect(POLICY_SEVERITY_PRIORITIES.error).toBeGreaterThan(POLICY_SEVERITY_PRIORITIES.warning);
    expect(POLICY_SEVERITY_PRIORITIES.warning).toBeGreaterThan(POLICY_SEVERITY_PRIORITIES.info);
  });

  it('creates facts that mirror the legacy policy input', () => {
    const snapshot = createSnapshot({
      pointer: '/tokens/color/base',
      token: { id: 'primary', type: 'color', value: '#ffffff', raw: '#000000' },
      resolution: { value: '#eeeeee' },
      metadata: { extensions: { owner: { id: 'user-123' } }, tags: ['core'] },
    });

    const fact = createPolicyTokenFact(snapshot);

    expect(fact.pointer).toBe(snapshot.pointer);
    expect(fact.snapshot).toBe(snapshot);
    expect(fact.type).toBe('color');
    expect(fact.raw).toBe('#000000');
    expect(fact.value).toBe('#eeeeee');
    expect(fact.metadata).toBe(snapshot.metadata);
  });

  it('builds immutable fact indices sorted by provenance', () => {
    const baseSnapshot = createSnapshot({
      pointer: '/tokens/semantic/background',
      token: { id: 'background', type: 'color', value: '#111111' },
      provenance: { layerIndex: 0 },
    });
    const overrideSnapshot = createSnapshot({
      pointer: '/tokens/semantic/background',
      token: { id: 'background', type: 'color', value: '#222222' },
      provenance: { layerIndex: 2, layer: 'theme' },
    });
    const peerSnapshot = createSnapshot({
      pointer: '/tokens/semantic/foreground',
      token: { id: 'foreground', type: 'color', raw: '#fefefe' },
      provenance: { layerIndex: 1, layer: 'theme' },
    });

    const { tokens, pointerHistory, latestByPointer, tokensById } = createPolicyTokenFactSet([
      baseSnapshot,
      overrideSnapshot,
      peerSnapshot,
    ]);

    expect(tokens).toHaveLength(3);
    expect(Object.isFrozen(tokens)).toBe(true);
    expect(Object.isFrozen(pointerHistory)).toBe(true);
    expect(Object.isFrozen(latestByPointer)).toBe(true);
    expect(Object.isFrozen(tokensById)).toBe(true);

    expect(pointerHistory['/tokens/semantic/background']).toHaveLength(2);
    const [first, second] = pointerHistory['/tokens/semantic/background']!;
    expect(first.snapshot).toBe(baseSnapshot);
    expect(second.snapshot).toBe(overrideSnapshot);
    expect(latestByPointer['/tokens/semantic/background']?.snapshot).toBe(overrideSnapshot);

    expect(pointerHistory['/tokens/semantic/foreground']).toHaveLength(1);
    expect(latestByPointer['/tokens/semantic/foreground']?.snapshot).toBe(peerSnapshot);

    expect(tokensById.background.snapshot).toBe(overrideSnapshot);
    expect(tokensById.foreground.snapshot).toBe(peerSnapshot);
  });
});

function createSnapshot(overrides: Partial<PolicyTokenSnapshot>): PolicyTokenSnapshot {
  const pointer = overrides.pointer ?? '/pointer';
  const token = {
    id: 'token-id',
    type: 'dimension',
    value: 4,
    raw: 4,
    ...overrides.token,
  } satisfies PolicyTokenSnapshot['token'];
  const provenance = {
    sourceId: 'source',
    layer: 'base',
    layerIndex: 1,
    uri: 'file:///design-tokens.json',
    pointerPrefix: '#/tokens',
    ...overrides.provenance,
  } satisfies PolicyTokenSnapshot['provenance'];

  return {
    pointer,
    token,
    provenance,
    context: overrides.context ?? {},
    ...(overrides.sourcePointer ? { sourcePointer: overrides.sourcePointer } : {}),
    ...(overrides.metadata ? { metadata: overrides.metadata } : {}),
    ...(overrides.resolution ? { resolution: overrides.resolution } : {}),
  } satisfies PolicyTokenSnapshot;
}

import { describe, expect, it } from 'vitest';

import type { BuildResolvedPlan, BuildTokenSnapshot } from '../domain/models/tokens.js';
import { createTokenDependencySnapshot } from './token-dependency-cache.js';

describe('token dependency cache hashing', () => {
  it('produces a stable hash regardless of object key ordering', () => {
    const firstSnapshot = createSnapshot({
      resolutionValue: {
        alpha: 1,
        nested: { foo: 'bar', baz: 'qux' },
        array: [{ index: 0 }, { index: 1 }],
      },
      metadata: { lastUsed: '2024-01-01T00:00:00.000Z', tags: ['primary', 'button'] },
      context: { layer: 'delivery', theme: 'light' },
    });

    const secondSnapshot = createSnapshot({
      resolutionValue: {
        array: [{ index: 0 }, { index: 1 }],
        nested: { baz: 'qux', foo: 'bar' },
        alpha: 1,
      },
      metadata: { tags: ['primary', 'button'], lastUsed: '2024-01-01T00:00:00.000Z' },
      context: { theme: 'light', layer: 'delivery' },
    });

    const firstPlan = createPlan(firstSnapshot);
    const secondPlan = createPlan(secondSnapshot);

    const firstEntry = createTokenDependencySnapshot(firstPlan).entries[0];
    const secondEntry = createTokenDependencySnapshot(secondPlan).entries[0];

    expect(firstEntry.hash).toBe(secondEntry.hash);
  });
});

function createPlan(snapshot: BuildTokenSnapshot): BuildResolvedPlan {
  return {
    entries: [
      {
        tokens: [snapshot],
      },
    ],
    diagnostics: [],
    resolvedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as unknown as BuildResolvedPlan;
}

function createSnapshot({
  resolutionValue,
  metadata,
  context,
}: {
  readonly resolutionValue: unknown;
  readonly metadata: Record<string, unknown> | undefined;
  readonly context: Record<string, unknown>;
}): BuildTokenSnapshot {
  return {
    pointer: '#/delivery/example',
    sourcePointer: '#/delivery/example',
    token: {
      id: 'delivery.example',
      value: { $type: 'dimension', $value: 16 },
      raw: { $type: 'dimension', $value: 16 },
    },
    metadata,
    resolution: {
      value: resolutionValue,
      references: [
        { uri: 'file:///tokens.json', pointer: '#/foundation/reference' },
        { uri: 'file:///tokens.json', pointer: '#/product/reference' },
      ],
      resolutionPath: [
        { uri: 'file:///tokens.json', pointer: '#/foundation/reference' },
        { uri: 'file:///tokens.json', pointer: '#/delivery/example' },
      ],
      appliedAliases: [{ uri: 'file:///tokens.json', pointer: '#/aliases/example' }],
    },
    provenance: {
      sourceId: 'virtual-doc',
      layer: 'delivery',
      layerIndex: 2,
      uri: 'file:///tokens.json',
      pointerPrefix: '#/delivery',
    },
    context,
  } as unknown as BuildTokenSnapshot;
}

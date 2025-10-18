import { describe, expect, it } from 'vitest';

import type { JsonPointer } from '@lapidist/dtif-parser';

import type { TokenMetricsSnapshot } from './metrics.js';
import { collectTokenMetrics } from './metrics.js';

const createSnapshot = (
  pointer: JsonPointer,
  overrides: Partial<TokenMetricsSnapshot> = {},
): TokenMetricsSnapshot => {
  const resolution = overrides.resolution ?? {
    appliedAliases: [],
    references: [],
  };

  return {
    id: pointer,
    path: pointer === '#/' ? [] : pointer.slice(2).split('/'),
    type: overrides.type,
    value: overrides.value,
    raw: overrides.raw,
    ref: overrides.ref,
    description: overrides.description,
    extensions: overrides.extensions ?? {},
    deprecated: overrides.deprecated,
    source: overrides.source ?? { uri: 'file://tokens.json', line: 1, column: 1 },
    references: overrides.references ?? [],
    resolutionPath: overrides.resolutionPath ?? [],
    appliedAliases: overrides.appliedAliases ?? [],
    pointer,
    sourcePointer: overrides.sourcePointer ?? pointer,
    provenance: overrides.provenance ?? { uri: 'file://tokens.json' },
    token: overrides.token ?? { type: overrides.type },
    resolution,
  } satisfies TokenMetricsSnapshot;
};

describe('collectTokenMetrics', () => {
  it('reports zero metrics for empty token snapshots', () => {
    expect(collectTokenMetrics([])).toEqual({
      totalCount: 0,
      typedCount: 0,
      untypedCount: 0,
      typeCounts: {},
      aliasDepth: { average: 0, max: 0, histogram: {} },
      references: { referencedCount: 0, unreferencedCount: 0, unreferencedSamples: [] },
    });
  });

  it('aggregates type counts, alias depth, and reference reachability', () => {
    const aliasPointer = '#/aliases/primary';
    const colorPointer = '#/color/primary';

    const base = createSnapshot(colorPointer, {
      token: { type: 'color' },
      resolution: {
        appliedAliases: [{ pointer: aliasPointer, uri: 'file://tokens.json' }],
        type: 'color',
      },
    });

    const reference = createSnapshot('#/theme/button/background', {
      token: { type: 'color' },
      resolution: {
        appliedAliases: [],
        references: [
          { pointer: `${colorPointer}/$value`, uri: 'file://tokens.json' },
          { pointer: aliasPointer, uri: 'file://tokens.json' },
        ],
        type: 'color',
      },
    });

    const metrics = collectTokenMetrics([base, reference]);

    expect(metrics.totalCount).toBe(2);
    expect(metrics.typedCount).toBe(2);
    expect(metrics.untypedCount).toBe(0);
    expect(metrics.typeCounts).toEqual({ color: 2 });
    expect(metrics.aliasDepth).toEqual({
      average: 0.5,
      max: 1,
      histogram: { 0: 1, 1: 1 },
    });
    expect(metrics.references).toEqual({
      referencedCount: 1,
      unreferencedCount: 1,
      unreferencedSamples: ['#/theme/button/background'],
    });
  });
});

import { describe, expect, it } from 'vitest';

import type {
  TokenDependencyDiff,
  TokenDependencySnapshot,
} from '../../incremental/token-dependency-cache.js';
import type { BuildResolvedPlan } from '../models/tokens.js';
import type { DependencyStorePort } from '../ports/dependencies.js';
import { GraphDependencyDiffStrategy } from './dependency-strategy-defaults.js';

const resolvedPlan: BuildResolvedPlan = {
  entries: [],
  diagnostics: [],
  resolvedAt: new Date('2024-01-01T00:00:00.000Z'),
};

const snapshot: TokenDependencySnapshot = {
  version: 1,
  resolvedAt: '2024-01-01T00:00:00.000Z',
  entries: [
    {
      pointer: '#/tokens/alpha',
      hash: 'hash-alpha',
      dependencies: ['#/tokens/beta'],
    },
    {
      pointer: '#/tokens/beta',
      hash: 'hash-beta',
      dependencies: ['#/tokens/gamma'],
    },
    {
      pointer: '#/tokens/delta',
      hash: 'hash-delta',
      dependencies: ['#/tokens/beta'],
    },
    {
      pointer: '#/tokens/gamma',
      hash: 'hash-gamma',
      dependencies: [],
    },
  ],
};

describe('GraphDependencyDiffStrategy', () => {
  it('expands dependants transitively when depth is unlimited', async () => {
    const baseDiff: TokenDependencyDiff = {
      snapshot,
      changed: new Set<string>(['#/tokens/gamma']),
      removed: new Set<string>(),
    };
    const store: DependencyStorePort = {
      evaluate: async () => baseDiff,
      commit: async () => {},
    };

    const strategy = new GraphDependencyDiffStrategy({ transitive: true });
    const result = await strategy.diff(resolvedPlan, snapshot, { store });

    expect([...result.changed].toSorted()).toEqual([
      '#/tokens/alpha',
      '#/tokens/beta',
      '#/tokens/delta',
      '#/tokens/gamma',
    ]);
  });

  it('limits dependant expansion according to the configured depth', async () => {
    const baseDiff: TokenDependencyDiff = {
      snapshot,
      changed: new Set<string>(['#/tokens/gamma']),
      removed: new Set<string>(),
    };
    const store: DependencyStorePort = {
      evaluate: async () => baseDiff,
      commit: async () => {},
    };

    const strategy = new GraphDependencyDiffStrategy({ maxDepth: 1 });
    const result = await strategy.diff(resolvedPlan, snapshot, { store });

    expect([...result.changed].toSorted()).toEqual(['#/tokens/beta', '#/tokens/gamma']);
  });
});

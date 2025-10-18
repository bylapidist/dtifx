import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type {
  TokenDependencyDiff,
  TokenDependencySnapshot,
} from '../../incremental/token-dependency-cache.js';
import type { BuildResolvedPlan } from '../models/tokens.js';
import { DependencyTrackingService } from './dependency-tracking-service.js';
import type { DependencySnapshotBuilderPort, DependencyStorePort } from '../ports/dependencies.js';
import { InMemoryDomainEventBus } from '../events/in-memory-domain-event-bus.js';

const pointer = appendJsonPointer(JSON_POINTER_ROOT, 'virtual', 'token');

const resolvedPlan: BuildResolvedPlan = {
  entries: [
    {
      sourceId: 'virtual-source',
      pointerPrefix: JSON_POINTER_ROOT,
      layer: 'test',
      layerIndex: 0,
      uri: 'virtual://token.json',
      context: {},
      tokens: [
        {
          pointer,
          sourcePointer: appendJsonPointer(pointer, '$value'),
          token: {
            id: 'virtual-token',
            pointer,
            name: 'virtual.token',
            path: ['virtual', 'token'],
            type: 'dimension',
            value: { unit: 'pixel', value: 4, dimensionType: 'length' },
            raw: { unit: 'pixel', value: 4, dimensionType: 'length' },
          },
          provenance: {
            sourceId: 'virtual-source',
            layer: 'test',
            layerIndex: 0,
            uri: 'virtual://token.json',
            pointerPrefix: JSON_POINTER_ROOT,
          },
          context: {},
          resolution: {
            id: 'virtual-token',
            type: 'dimension',
            value: { unit: 'pixel', value: 4, dimensionType: 'length' },
            raw: { unit: 'pixel', value: 4, dimensionType: 'length' },
            references: [],
            resolutionPath: [],
            appliedAliases: [],
          },
        },
      ],
      diagnostics: [],
      metadataIndex: new Map(),
      resolutionIndex: new Map(),
      cacheStatus: 'miss',
    },
  ],
  diagnostics: [],
  resolvedAt: new Date('2024-01-01T00:00:00.000Z'),
};

describe('DependencyTrackingService', () => {
  it('falls back to change-all diff when no store is configured', async () => {
    const service = new DependencyTrackingService();
    const result = await service.evaluate(resolvedPlan);

    expect(result.diff.changed.size).toBe(1);
    expect(result.diff.removed.size).toBe(0);
    expect(result.diff.changed.has(pointer)).toBe(true);

    await service.commit(result.snapshot);
  });

  it('delegates to dependency store for evaluate and commit', async () => {
    let evaluated: TokenDependencySnapshot | undefined;
    let committed: TokenDependencySnapshot | undefined;
    const diff: TokenDependencyDiff = {
      snapshot: {
        version: 1,
        resolvedAt: new Date().toISOString(),
        entries: [],
      },
      changed: new Set<string>(['#virtual/token']),
      removed: new Set<string>(),
    };
    const service = new DependencyTrackingService({
      store: {
        evaluate: (snapshot) => {
          evaluated = snapshot;
          return Promise.resolve(diff);
        },
        commit: (snapshot) => {
          committed = snapshot;
          return Promise.resolve();
        },
      },
    });

    const result = await service.evaluate(resolvedPlan);
    expect(evaluated).toBe(result.snapshot);
    expect(result.diff).toBe(diff);

    await service.commit(result.snapshot);
    expect(committed).toBe(result.snapshot);
  });

  it('publishes lifecycle events for dependency evaluation', async () => {
    const events: string[] = [];
    const completions: Readonly<Record<string, unknown>>[] = [];
    const eventBus = new InMemoryDomainEventBus();
    eventBus.subscribe((event) => {
      events.push(event.type);
      if (event.type === 'stage:complete') {
        completions.push(event.payload.attributes ?? {});
      }
    });
    const service = new DependencyTrackingService({ eventBus });

    const result = await service.evaluate(resolvedPlan);
    expect(result.diff.changed.size).toBe(1);
    expect(events).toEqual(['stage:start', 'stage:complete']);
    expect(completions[0]?.changedCount).toBe(1);
  });

  it('delegates diff evaluation to the provided strategy', async () => {
    const builderSnapshot: TokenDependencySnapshot = {
      version: 1,
      resolvedAt: new Date().toISOString(),
      entries: [],
    };
    const builder = {
      create: (): Promise<TokenDependencySnapshot> => Promise.resolve(builderSnapshot),
    } satisfies DependencySnapshotBuilderPort;
    const diff: TokenDependencyDiff = {
      snapshot: builderSnapshot,
      changed: new Set<string>(),
      removed: new Set<string>(),
    } satisfies TokenDependencyDiff;
    const store: DependencyStorePort = {
      evaluate: () => Promise.resolve(diff),
      commit: () => Promise.resolve(),
    };
    let receivedStore: DependencyStorePort | undefined;
    const diffStrategy = {
      diff(
        _resolved: BuildResolvedPlan,
        snapshot: TokenDependencySnapshot,
        context: { store?: DependencyStorePort },
      ): Promise<TokenDependencyDiff> {
        receivedStore = context.store;
        expect(snapshot).toBe(builderSnapshot);
        return Promise.resolve(diff);
      },
    };

    const service = new DependencyTrackingService({
      builder,
      diffStrategy,
      store,
    });

    const result = await service.evaluate(resolvedPlan);
    expect(receivedStore).toBe(store);
    expect(result.diff).toBe(diff);
  });
});

import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import { DefaultTransformExecutor } from '../../infrastructure/transforms/default-transform-executor.js';
import type { TokenSnapshot } from '../../session/resolution-session.js';
import { InMemoryTransformCache, type TransformCache } from '../../transform/transform-cache.js';
import { TransformRegistry, type TransformInput } from '../../transform/transform-registry.js';
import { InMemoryDomainEventBus } from '../events/in-memory-domain-event-bus.js';
import { TransformationService } from './transformation-service.js';

const pointer = appendJsonPointer(JSON_POINTER_ROOT, 'virtual', 'service');

const snapshot: TokenSnapshot = {
  pointer,
  sourcePointer: appendJsonPointer(pointer, '$value'),
  token: {
    id: 'dimension-service',
    pointer: appendJsonPointer(pointer, '$value'),
    name: 'dimension.service',
    path: ['virtual', 'service'],
    type: 'dimension',
    value: { unit: 'pixel', value: 4, dimensionType: 'length' },
    raw: { unit: 'pixel', value: 4, dimensionType: 'length' },
  },
  resolution: {
    id: 'dimension-service',
    type: 'dimension',
    value: { unit: 'pixel', value: 4, dimensionType: 'length' },
    raw: { unit: 'pixel', value: 4, dimensionType: 'length' },
    references: [],
    resolutionPath: [],
    appliedAliases: [],
  },
  provenance: {
    sourceId: 'virtual',
    layer: 'test',
    layerIndex: 0,
    uri: 'virtual://service.json',
    pointerPrefix: JSON_POINTER_ROOT,
  },
  context: {},
};

describe('TransformationService', () => {
  it('caches unchanged transforms when pointers do not change', async () => {
    let runCount = 0;
    const registry = new TransformRegistry([
      {
        name: 'dimension.double',
        selector: { types: ['dimension'] },
        run: (input: TransformInput) => {
          runCount += 1;
          const value = input.value as { unit: string; value: number };
          return { ...value, value: value.value * 2 } satisfies {
            unit: string;
            value: number;
          };
        },
      },
    ]);
    const cache: TransformCache = new InMemoryTransformCache();
    const executor = new DefaultTransformExecutor({ registry, cache });
    const service = new TransformationService({ executor });

    const first = await service.run({
      snapshots: [snapshot],
      changedPointers: new Set<string>([pointer]),
    });
    expect(first.results).toHaveLength(1);
    expect(runCount).toBe(1);

    const second = await service.run({
      snapshots: [snapshot],
      changedPointers: new Set<string>(),
    });
    expect(second.results).toHaveLength(1);
    expect(runCount).toBe(1);
    expect((second.results[0]?.output as { value: number }).value).toBe(8);

    const third = await service.run({
      snapshots: [snapshot],
      changedPointers: new Set<string>([pointer]),
    });
    expect(third.results).toHaveLength(1);
    expect(runCount).toBe(2);
  });

  it('publishes lifecycle events when running transformations', async () => {
    const registry = new TransformRegistry([
      {
        name: 'dimension.identity',
        selector: { types: ['dimension'] },
        run: (input: TransformInput) => input.value,
      },
    ]);
    const events: string[] = [];
    const eventBus = new InMemoryDomainEventBus();
    eventBus.subscribe((event) => {
      events.push(event.type);
    });
    const executor = new DefaultTransformExecutor({ registry });
    const service = new TransformationService({ executor, eventBus });

    const result = await service.run({ snapshots: [snapshot] });
    expect(result.results).toHaveLength(1);
    expect(events).toEqual(['stage:start', 'stage:complete']);
  });
});

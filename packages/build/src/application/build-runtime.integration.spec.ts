import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../config/index.js';
import { placeholder, pointerTemplate } from '../config/index.js';
import { createBuildRuntime, executeBuild } from './build-runtime.js';
import { InMemoryTransformCache } from '../transform/transform-cache.js';
import type {
  TokenDependencyCache,
  TokenDependencyDiff,
  TokenDependencySnapshot,
} from '../incremental/token-dependency-cache.js';
import { createTelemetryTracer } from '@dtifx/core/telemetry';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

class MemoryDependencyCache implements TokenDependencyCache {
  previous: TokenDependencySnapshot | undefined;
  evaluations: TokenDependencySnapshot[] = [];
  commits: TokenDependencySnapshot[] = [];

  async evaluate(snapshot: TokenDependencySnapshot): Promise<TokenDependencyDiff> {
    this.evaluations.push(snapshot);
    const previousEntries = this.previous
      ? new Map(this.previous.entries.map((entry) => [entry.pointer, entry]))
      : new Map();
    const changed = new Set<string>();
    const removed = new Set<string>();

    for (const entry of snapshot.entries) {
      const existing = previousEntries.get(entry.pointer);
      if (!existing || existing.hash !== entry.hash) {
        changed.add(entry.pointer);
      }
    }

    if (this.previous) {
      const nextPointers = new Set(snapshot.entries.map((entry) => entry.pointer));
      for (const entry of this.previous.entries) {
        if (!nextPointers.has(entry.pointer)) {
          removed.add(entry.pointer);
          changed.add(entry.pointer);
        }
      }
    }

    return { snapshot, changed, removed } satisfies TokenDependencyDiff;
  }

  async commit(snapshot: TokenDependencySnapshot): Promise<void> {
    this.previous = snapshot;
    this.commits.push(snapshot);
  }
}

describe('build runtime integration', () => {
  const fixturesRoot = fileURLToPath(new URL('../../tests/fixtures/dtif', import.meta.url));
  const baseSchema = 'https://dtif.lapidist.net/schema/core.json';
  it('runs multi-source builds and tracks dependency changes across sessions', async () => {
    let remoteComponents: [number, number, number] = [1, 0, 0];

    const config: BuildConfig = {
      layers: [
        { name: 'foundation', context: { theme: 'base' } },
        { name: 'product' },
        { name: 'delivery' },
      ],
      sources: [
        {
          kind: 'file',
          id: 'foundation-files',
          layer: 'foundation',
          pointerTemplate: pointerTemplate('foundation', placeholder('stem')),
          patterns: ['foundation/*.json'],
          rootDir: fixturesRoot,
        },
        {
          kind: 'file',
          id: 'product-files',
          layer: 'product',
          pointerTemplate: pointerTemplate('product', placeholder('stem')),
          patterns: ['product/button.json'],
          rootDir: fixturesRoot,
        },
        {
          kind: 'virtual',
          id: 'remote-doc',
          layer: 'delivery',
          pointerTemplate: pointerTemplate('delivery', 'remote'),
          document: () => {
            const [r, g, b] = remoteComponents;
            return {
              $schema: baseSchema,
              remote: {
                $type: 'color',
                $value: {
                  colorSpace: 'srgb',
                  components: [r, g, b],
                  hex: '#ff0000',
                },
              },
            };
          },
        },
        {
          kind: 'virtual',
          id: 'virtual-doc',
          layer: 'delivery',
          pointerTemplate: pointerTemplate('delivery', 'virtual'),
          document: () => ({
            $schema: baseSchema,
            virtual: {
              $type: 'dimension',
              $value: { dimensionType: 'length', unit: 'px', value: 16 },
            },
          }),
        },
      ],
    } satisfies BuildConfig;

    const dependencyCache = new MemoryDependencyCache();
    const transformCache = new InMemoryTransformCache();
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });

    const tracer = createTelemetryTracer({ tracer: provider.getTracer('dtifx.build.integration') });
    const runBuild = () =>
      executeBuild(createBuildRuntime(config, { dependencyCache, transformCache }), config, tracer);

    const first = await runBuild();
    expect(first.plan.entries.map((entry) => entry.id)).toEqual([
      'foundation-files',
      'product-files',
      'remote-doc',
      'virtual-doc',
    ]);
    expect(first.tokens).toHaveLength(first.metrics.totalCount);
    expect(first.metrics.totalCount).toBeGreaterThan(0);
    expect(first.dependencyChanges?.changedPointers).toHaveLength(first.metrics.totalCount);
    expect(first.dependencyChanges?.removedPointers).toEqual([]);
    expect(first.transformCache.misses).toBeGreaterThan(0);
    expect(first.transformCache.hits).toBe(0);
    expect(dependencyCache.evaluations).toHaveLength(1);
    expect(dependencyCache.commits).toHaveLength(1);

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const runSpan = spans.find((span) => span.name === 'dtifx.pipeline.run');
    expect(runSpan?.attributes.entryCount).toBe(first.plan.entries.length);
    expect(runSpan?.attributes.transformCount).toBe(first.transforms.length);
    exporter.reset();

    const second = await runBuild();
    expect(second.dependencyChanges?.changedPointers).toEqual([]);
    expect(second.dependencyChanges?.removedPointers).toEqual([]);
    expect(second.transformCache.hits).toBeGreaterThan(0);
    expect(second.transformCache.misses).toBe(0);
    expect(dependencyCache.evaluations).toHaveLength(2);
    expect(dependencyCache.commits).toHaveLength(2);
    await provider.forceFlush();
    exporter.reset();

    remoteComponents = [0, 1, 0];
    const third = await runBuild();
    expect(third.dependencyChanges?.changedPointers).not.toEqual([]);
    expect(third.dependencyChanges?.changedPointers).toContain('#/delivery/remote/remote');
    expect(third.transformCache.hits).toBeGreaterThan(0);
    expect(third.transformCache.misses).toBeGreaterThan(0);
    expect(dependencyCache.evaluations).toHaveLength(3);
    expect(dependencyCache.commits).toHaveLength(3);
    await provider.forceFlush();
    await provider.shutdown();
  }, 15_000);
});

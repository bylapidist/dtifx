import { describe, expect, it } from 'vitest';

import type { DesignTokenInterchangeFormat } from '@lapidist/dtif-schema';
import { JSON_POINTER_ROOT } from '@lapidist/dtif-parser';

import { SessionTokenParser } from './session-parser.js';
import type { TokenSourcePlan } from './config.js';

describe('SessionTokenParser', () => {
  it('parses planned token sources using a shared session pipeline', async () => {
    const parser = new SessionTokenParser();
    const document: DesignTokenInterchangeFormat = {
      $schema: 'https://dtif.lapidist.net/schema/core.json',
      $version: '1.0.0',
      color: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 0, 0],
            hex: '#FF0000',
          },
        },
      },
    } satisfies DesignTokenInterchangeFormat;

    const plan: TokenSourcePlan = {
      entries: [
        {
          id: 'virtual-primary',
          layer: 'base',
          layerIndex: 0,
          pointerPrefix: JSON_POINTER_ROOT,
          uri: 'memory://virtual-primary.tokens.json',
          context: {},
          document,
        },
      ],
      createdAt: new Date(),
    } satisfies TokenSourcePlan;

    const result = await parser.parse(plan, {});

    expect(result.sources).toHaveLength(1);
    const [entry] = result.sources;

    expect(entry.tokens).toHaveLength(1);
    const [snapshot] = entry.tokens;

    expect(snapshot.id).toBe('#/color/primary');
    expect(snapshot.pointer).toBe('#/color/primary');
    expect(snapshot.provenance.sourceId).toBe('virtual-primary');
    expect(entry.cacheStatus).toBe('miss');
    expect(entry.tokenSet.tokens.size).toBe(1);

    expect(result.snapshots).toHaveLength(1);
    expect(result.metadata.size).toBeGreaterThanOrEqual(1);
    expect(result.resolutions.size).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('records parser metrics for the most recent execution', async () => {
    const parser = new SessionTokenParser();
    const document: DesignTokenInterchangeFormat = {
      $schema: 'https://dtif.lapidist.net/schema/core.json',
      $version: '1.0.0',
      color: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 0, 0],
            hex: '#FF0000',
          },
        },
      },
    } satisfies DesignTokenInterchangeFormat;

    const plan: TokenSourcePlan = {
      entries: [
        {
          id: 'virtual-primary',
          layer: 'base',
          layerIndex: 0,
          pointerPrefix: JSON_POINTER_ROOT,
          uri: 'memory://virtual-primary.tokens.json',
          context: {},
          document,
        },
      ],
      createdAt: new Date(),
    } satisfies TokenSourcePlan;

    await parser.parse(plan, {});
    const metrics = parser.consumeMetrics();

    expect(metrics).toBeDefined();
    expect(metrics?.entryCount).toBe(1);
    const hits = metrics?.cache.hits ?? 0;
    const misses = metrics?.cache.misses ?? 0;
    const skipped = metrics?.cache.skipped ?? 0;
    expect(hits + misses + skipped).toBe(1);
    expect(metrics?.totalMs).toBeGreaterThanOrEqual(0);
    expect(metrics?.parseMs).toBeGreaterThanOrEqual(0);
    expect(parser.consumeMetrics()).toBeUndefined();
  });
});

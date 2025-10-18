import { describe, expect, it } from 'vitest';

import { JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import type { DesignTokenInterchangeFormat } from '@lapidist/dtif-schema';

import { SessionTokenParser } from './parser.js';
import type { TokenSourcePlan } from './config.js';

describe('SessionTokenParser', () => {
  it('parses using the session-backed pipeline', async () => {
    const adapter = new SessionTokenParser();
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

    const result = await adapter.parse(plan, {});

    expect(result.sources).toHaveLength(1);
    const [entry] = result.sources;
    expect(entry.tokens).toHaveLength(1);
    expect(entry.cacheStatus).toBe('miss');
    expect(typeof (adapter as { consumeMetrics?: () => unknown }).consumeMetrics).toBe('function');
  });
});

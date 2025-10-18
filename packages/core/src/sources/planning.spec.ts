import { describe, expect, it } from 'vitest';

import type { TokenSourceIssue } from '../token-sources/issues.js';
import { planTokenSources, UnknownLayerError } from './planning.js';

const baseConfig = {
  layers: [
    { name: 'base', context: { layer: 'base' } },
    { name: 'brand', context: { layer: 'brand' } },
  ],
  sources: [
    {
      id: 'brand-tokens',
      kind: 'file',
      layer: 'brand',
      pointerTemplate: { segments: ['tokens'] },
      patterns: ['**/*.json'],
      context: { source: 'brand' },
    },
    {
      id: 'base-tokens',
      kind: 'file',
      layer: 'base',
      pointerTemplate: { segments: ['tokens'] },
      patterns: ['base.json'],
    },
  ],
} as const;

describe('planTokenSources', () => {
  it('plans sources using repository outcomes and merges contexts', async () => {
    const documents = [
      {
        uri: 'file:///brand.json',
        pointerPrefix: '#/brand',
        document: { $schema: 'https://dtif.dev/schema/v1.json' },
        context: { document: 'brand' },
      },
      {
        uri: 'file:///base.json',
        pointerPrefix: '#/base',
        document: { $schema: 'https://dtif.dev/schema/v1.json' },
        context: { document: 'base' },
      },
    ] as const;

    const repository = {
      async discover({ source }: { source: { id: string } }) {
        if (source.id === 'brand-tokens') {
          return { documents: [documents[0]], issues: [] };
        }
        return { documents: [documents[1]], issues: [] };
      },
    };

    const clock = { now: () => new Date('2024-01-01T00:00:00Z') };
    const timer = {
      now: (() => {
        let tick = 0;
        return () => ++tick * 5;
      })(),
    };

    const result = await planTokenSources(baseConfig, {
      repository,
      clock,
      timer,
    });

    expect(result.durationMs).toBe(5); // timer called twice, difference 5
    expect(result.issues).toEqual([]);
    expect(result.plan.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
    expect(result.plan.entries).toEqual([
      {
        id: 'base-tokens',
        layer: 'base',
        layerIndex: 0,
        pointerPrefix: '#/base',
        uri: 'file:///base.json',
        context: { layer: 'base', document: 'base' },
        document: documents[1].document,
      },
      {
        id: 'brand-tokens',
        layer: 'brand',
        layerIndex: 1,
        pointerPrefix: '#/brand',
        uri: 'file:///brand.json',
        context: { layer: 'brand', source: 'brand', document: 'brand' },
        document: documents[0].document,
      },
    ]);
  });

  it('aggregates repository and validation issues', async () => {
    const repositoryIssue: TokenSourceIssue = {
      kind: 'repository',
      sourceId: 'brand-tokens',
      uri: 'file:///brand.json',
      pointerPrefix: '#/brand',
      code: 'pointer-template',
      message: 'bad pointer',
    };

    const repository = {
      async discover({ source }: { source: { id: string } }) {
        if (source.id === 'brand-tokens') {
          return {
            documents: [
              {
                uri: 'file:///brand.json',
                pointerPrefix: '#/brand',
                document: { $schema: 'https://dtif.dev/schema/v1.json' },
                context: {},
              },
            ],
            issues: [repositoryIssue],
          };
        }
        return { documents: [], issues: [] };
      },
    };

    const validator = {
      async validate() {
        return [
          {
            kind: 'validation' as const,
            sourceId: 'brand-tokens',
            uri: 'file:///brand.json',
            pointerPrefix: '#/brand',
            pointer: '#/brand/tokens/primary',
            instancePath: '#/tokens/primary',
            keyword: 'type',
            message: 'must be string',
          },
        ];
      },
    };

    const result = await planTokenSources(baseConfig, { repository, validator });

    expect(result.issues).toEqual([
      repositoryIssue,
      expect.objectContaining({ kind: 'validation', keyword: 'type' }),
    ]);
  });

  it('throws when a source references an unknown layer', async () => {
    const repository = {
      async discover() {
        return { documents: [], issues: [] };
      },
    };

    await expect(
      planTokenSources(
        {
          layers: [],
          sources: [
            {
              id: 'brand',
              layer: 'missing',
              kind: 'file',
              pointerTemplate: { segments: ['tokens'] },
              patterns: ['**/*.json'],
            },
          ],
        },
        { repository },
      ),
    ).rejects.toBeInstanceOf(UnknownLayerError);
  });
});

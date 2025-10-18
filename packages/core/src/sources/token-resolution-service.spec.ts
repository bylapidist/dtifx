import { describe, expect, it, vi } from 'vitest';

import type { DomainEventBusPort } from '../runtime/index.js';
import { TokenResolutionService } from './token-resolution-service.js';
import type { ParserMetrics, ParserPort, ParserResult } from './parser.js';
import type { TokenSourcePlan } from './config.js';
import type { DesignTokenInterchangeFormat } from '@lapidist/dtif-schema';
import type { TokenResolutionSnapshot, TokenResolvedSource } from './resolution-types.js';
import type { DiagnosticEvent } from '../instrumentation/diagnostics.js';

describe('TokenResolutionService', () => {
  it('publishes a stage:error event when parsing fails', async () => {
    const error = new Error('parse failure');
    const parser: ParserPort = {
      parse: vi.fn().mockRejectedValue(error),
    };
    const publish = vi.fn().mockResolvedValue();
    const eventBus: DomainEventBusPort = {
      publish,
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    };
    const service = new TokenResolutionService({ parser, eventBus });

    const plan: TokenSourcePlan = { entries: [], createdAt: new Date() };

    await expect(service.resolve(plan)).rejects.toThrow(error);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'stage:start',
        payload: expect.objectContaining({ stage: 'resolution' }),
      }),
    );
    expect(publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'stage:error',
        payload: expect.objectContaining({
          stage: 'resolution',
          error,
          timestamp: expect.any(Date),
        }),
      }),
    );
  });

  it('resolves planned sources and records parser metrics', async () => {
    const snapshot: TokenResolutionSnapshot = {
      id: '#/color/primary',
      path: ['color', 'primary'],
      pointer: '#/color/primary',
      sourcePointer: '#/color/primary',
      type: 'color',
      value: { hex: '#FF0000' },
      raw: { hex: '#FF0000' },
      extensions: {},
      references: [],
      resolutionPath: [],
      appliedAliases: [],
      source: { uri: 'memory://virtual-primary.tokens.json', line: 1, column: 1 },
      token: {
        id: '#/color/primary',
        name: 'primary',
        path: ['color', 'primary'],
        pointer: '#/color/primary',
        type: 'color',
        value: { hex: '#FF0000' },
        raw: { hex: '#FF0000' },
      },
      provenance: {
        sourceId: 'virtual-primary',
        layer: 'base',
        layerIndex: 0,
        uri: 'memory://virtual-primary.tokens.json',
        pointerPrefix: '#',
      },
      context: {},
      metadata: {
        description: 'Primary token',
        extensions: {},
        source: { uri: 'memory://virtual-primary.tokens.json', line: 1, column: 1 },
      },
      resolution: {
        id: '#/color/primary',
        type: 'color',
        value: { hex: '#FF0000' },
        raw: { hex: '#FF0000' },
        references: [],
        resolutionPath: [],
        appliedAliases: [],
      },
    } satisfies TokenResolutionSnapshot;

    const metadataIndex = new Map([[snapshot.id, snapshot.metadata!]]);
    const resolutionIndex = new Map([[snapshot.id, snapshot.resolution!]]);
    const diagnostics: DiagnosticEvent[] = [
      { level: 'info', message: 'parsed snapshot', scope: 'token-source.session' },
    ];

    const source: TokenResolvedSource = {
      sourceId: 'virtual-primary',
      pointerPrefix: '#',
      layer: 'base',
      layerIndex: 0,
      uri: 'memory://virtual-primary.tokens.json',
      context: {},
      tokens: [snapshot],
      tokenSet: { tokens: new Map([[snapshot.id, snapshot]]), source: snapshot.provenance.uri },
      diagnostics,
      metadataIndex,
      resolutionIndex,
      cacheStatus: 'miss',
    } satisfies TokenResolvedSource;

    const parserResult: ParserResult = {
      sources: [source],
      snapshots: [snapshot],
      diagnostics,
      metadata: metadataIndex,
      resolutions: resolutionIndex,
    } satisfies ParserResult;

    const parserMetrics: ParserMetrics = {
      entryCount: 1,
      totalMs: 5,
      parseMs: 4,
      cache: { hits: 1, misses: 0, skipped: 0 },
    } satisfies ParserMetrics;

    const consumeMetrics = vi
      .fn<[], ParserMetrics | undefined>()
      .mockReturnValueOnce(parserMetrics);
    const parse = vi.fn().mockResolvedValue(parserResult);
    const parser = {
      parse,
      consumeMetrics,
    } as unknown as ParserPort & { consumeMetrics: () => ParserMetrics | undefined };

    const publish = vi.fn().mockResolvedValue();
    const eventBus: DomainEventBusPort = {
      publish,
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    };

    const service = new TokenResolutionService({ parser, eventBus });

    const document: DesignTokenInterchangeFormat = {
      $schema: 'https://dtif.lapidist.net/schema/core.json',
      $version: '1.0.0',
    } as DesignTokenInterchangeFormat;

    const plan: TokenSourcePlan = {
      entries: [
        {
          id: 'virtual-primary',
          layer: 'base',
          layerIndex: 0,
          pointerPrefix: '#',
          uri: 'memory://virtual-primary.tokens.json',
          context: {},
          document,
        },
      ],
      createdAt: new Date(),
    } satisfies TokenSourcePlan;

    const result = await service.resolve(plan);

    expect(parse).toHaveBeenCalledWith(
      plan,
      expect.objectContaining({ includeGraphs: true, flatten: true }),
    );
    expect(result.entries).toEqual(parserResult.sources);
    expect(result.snapshots).toEqual(parserResult.snapshots);
    expect(result.metadata).toEqual(parserResult.metadata);
    expect(result.resolutions).toEqual(parserResult.resolutions);
    expect(result.diagnostics).toEqual(parserResult.diagnostics);
    expect(result.entries[0]?.tokens[0]).toEqual(snapshot);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'stage:start',
        payload: expect.objectContaining({ stage: 'resolution' }),
      }),
    );
    expect(publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'stage:complete',
        payload: expect.objectContaining({
          stage: 'resolution',
          attributes: expect.objectContaining({
            durationMs: expect.any(Number),
            entryCount: parserResult.sources.length,
            parserMetrics,
          }),
        }),
      }),
    );

    expect(service.consumeMetrics()).toEqual(parserMetrics);
    expect(service.consumeMetrics()).toBeUndefined();
    expect(consumeMetrics).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { AuditTelemetryRuntime, AuditTokenResolutionContext } from './audit-runtime.js';
import {
  AuditSourcePlanningError,
  createAuditTokenResolutionEnvironment,
} from './audit-token-resolution-environment.js';
import type { CreateAuditTokenResolutionEnvironmentDependencies } from './audit-token-resolution-environment.js';
import {
  pointerTemplate,
  type ParserMetrics,
  type ParserPort,
  type TokenResolutionService,
  type TokenResolutionSnapshot,
  type TokenResolvedPlan,
  type TokenSourcePlan,
} from '@dtifx/core/sources';

const createTelemetry = () => {
  const span = createSpan();
  const runtime: AuditTelemetryRuntime = {
    tracer: {
      startSpan: vi.fn(() => span),
    },
    exportSpans: vi.fn(async () => {}),
  } satisfies AuditTelemetryRuntime;
  return { runtime, span };
};

const createSpan = () => ({
  name: 'root',
  spanId: 'span',
  traceId: 'trace',
  startChild: vi.fn(() => createSpan()),
  addEvent: vi.fn(),
  setAttribute: vi.fn(),
  end: vi.fn(),
});

describe('createAuditTokenResolutionEnvironment', () => {
  it('resolves token snapshots using the provided resolution dependencies', async () => {
    const { runtime, span } = createTelemetry();
    const plannedSource = {
      id: 'virtual-foundation',
      pointerPrefix: '#/tokens',
      layer: 'foundation',
      layerIndex: 0,
      uri: 'virtual:virtual-foundation',
      context: { environment: 'test' },
      document: {
        $schema: 'https://design-tokens.org/dtif/v1',
        tokens: {},
      },
    } as unknown as TokenSourcePlan['entries'][number];

    const planResult = {
      plan: { entries: [plannedSource], createdAt: new Date() } as TokenSourcePlan,
      issues: [],
      durationMs: 12,
    };

    const resolutionSnapshot = {
      pointer: '#/tokens/color',
      sourcePointer: '#/tokens/color',
      token: { id: 'color', path: '#/tokens/color', value: '#000000' },
      provenance: {
        sourceId: 'virtual-foundation',
        layer: 'foundation',
        layerIndex: 0,
        uri: 'virtual:virtual-foundation',
        pointerPrefix: '#/tokens',
      },
      context: { location: 'spec' },
    } as unknown as TokenResolutionSnapshot;

    const resolvedPlan = {
      entries: [
        {
          sourceId: 'virtual-foundation',
          pointerPrefix: '#/tokens',
          layer: 'foundation',
          layerIndex: 0,
          uri: 'virtual:virtual-foundation',
          context: { location: 'spec' },
          tokens: [resolutionSnapshot],
          tokenSet: { tokens: new Map() },
          diagnostics: [],
          metadataIndex: new Map(),
          resolutionIndex: new Map(),
          cacheStatus: 'miss',
        },
      ],
      diagnostics: [],
      resolvedAt: new Date(),
    } as unknown as TokenResolvedPlan;

    const parserMetrics: ParserMetrics = {
      entryCount: 1,
      totalMs: 6,
      parseMs: 4,
      cache: { hits: 1, misses: 0, skipped: 0 },
    };

    const consumeMetrics = vi.fn(() => parserMetrics);
    const parser = { consumeMetrics } as unknown as ParserPort & {
      consumeMetrics: () => ParserMetrics;
    };

    const resolvePlan = vi.fn(async () => resolvedPlan);
    const resolutionService = { resolve: resolvePlan } as unknown as TokenResolutionService;

    const metrics = {
      totalCount: 1,
      typedCount: 1,
      untypedCount: 0,
      typeCounts: { color: 1 },
      aliasDepth: { average: 0, max: 0, histogram: {} },
      references: { referencedCount: 0, unreferencedCount: 1, unreferencedSamples: [] },
    } as const;

    const dependencies: CreateAuditTokenResolutionEnvironmentDependencies = {
      planSources: vi.fn(async () => planResult),
      createParser: vi.fn(() => parser),
      createResolutionService: vi.fn(() => resolutionService),
      collectMetrics: vi.fn(() => metrics),
    };

    const environment = await createAuditTokenResolutionEnvironment(
      {
        telemetry: runtime,
        logger: { log: vi.fn() },
        configuration: {
          path: '/workspace/dtifx.config.mjs',
          directory: '/workspace',
          config: {
            audit: { policies: [] },
            layers: [{ name: 'foundation' }],
            sources: [
              {
                id: 'virtual-foundation',
                kind: 'virtual',
                layer: 'foundation',
                pointerTemplate: { base: '#/tokens', segments: [] },
                document: () => ({
                  $schema: 'https://design-tokens.org/dtif/v1',
                  tokens: {},
                }),
              },
            ],
          },
        },
      },
      dependencies,
    );

    const result = await environment.tokens.resolve({ span } satisfies AuditTokenResolutionContext);

    expect(dependencies.planSources).toHaveBeenCalledWith(
      {
        layers: expect.any(Array),
        sources: expect.any(Array),
      },
      expect.any(Object),
    );
    expect(resolvePlan).toHaveBeenCalledWith(planResult.plan);
    expect(dependencies.collectMetrics).toHaveBeenCalledWith([
      expect.objectContaining({ pointer: '#/tokens/color' }),
    ]);

    expect(result.snapshots).toEqual([
      expect.objectContaining({ pointer: '#/tokens/color', provenance: expect.any(Object) }),
    ]);
    expect(result.metrics.totalCount).toBe(metrics.totalCount);
    expect(result.metrics.typedCount).toBe(metrics.typedCount);
    expect(result.timings.planMs).toBe(planResult.durationMs);
    expect(result.timings.parseMs).toBe(parserMetrics.parseMs);
    expect(result.timings.resolveMs).toBe(parserMetrics.totalMs - parserMetrics.parseMs);

    environment.dispose();
  });

  it('throws when required layers or sources are missing', async () => {
    const { runtime, span } = createTelemetry();

    const environment = await createAuditTokenResolutionEnvironment({
      telemetry: runtime,
      logger: { log: vi.fn() },
      configuration: {
        path: '/workspace/dtifx.config.mjs',
        directory: '/workspace',
        config: { audit: { policies: [] } },
      },
    });

    await expect(
      environment.tokens.resolve({ span } satisfies AuditTokenResolutionContext),
    ).rejects.toThrowError(
      'Audit configuration must define "layers" and "sources" arrays to resolve tokens.',
    );
  });

  it('raises an AuditSourcePlanningError when planning issues occur', async () => {
    const { runtime, span } = createTelemetry();
    const dependencies: CreateAuditTokenResolutionEnvironmentDependencies = {
      planSources: async () => ({
        plan: { entries: [], createdAt: new Date() },
        issues: [
          {
            kind: 'validation',
            sourceId: 'source',
            uri: 'file://tokens.json',
            pointerPrefix: '#/tokens',
            message: 'invalid document',
          },
        ],
        durationMs: 5,
      }),
    };

    const environment = await createAuditTokenResolutionEnvironment(
      {
        telemetry: runtime,
        logger: { log: vi.fn() },
        configuration: {
          path: '/workspace/dtifx.config.mjs',
          directory: '/workspace',
          config: {
            audit: { policies: [] },
            layers: [{ name: 'foundation' }],
            sources: [
              {
                id: 'virtual-foundation',
                kind: 'virtual',
                layer: 'foundation',
                pointerTemplate: pointerTemplate('tokens'),
                document: () => ({
                  $schema: 'https://design-tokens.org/dtif/v1',
                  tokens: {},
                }),
              },
            ],
          },
        },
      },
      dependencies,
    );

    await expect(
      environment.tokens.resolve({ span } satisfies AuditTokenResolutionContext),
    ).rejects.toBeInstanceOf(AuditSourcePlanningError);
  });
});

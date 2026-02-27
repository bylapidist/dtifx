import { fileURLToPath } from 'node:url';

import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig, SourcePlan } from '../../config/index.js';
import { placeholder, pointerTemplate } from '../../config/index.js';
import type { StructuredLogEvent, StructuredLogger } from '@dtifx/core/logging';
import { SourcePlanner, SourcePlannerError } from './source-planner.js';

/**
 * In-memory logger used to capture planner events during tests.
 */
class MemoryLogger implements StructuredLogger {
  readonly events: StructuredLogEvent[] = [];

  /**
   * Records a structured log entry emitted by the system under test.
   * @param {StructuredLogEvent} entry - The structured log event to persist.
   */
  log(entry: StructuredLogEvent): void {
    this.events.push(entry);
  }
}

const fixturesRoot = fileURLToPath(new URL('../../../tests/fixtures/dtif', import.meta.url));

const baseSchema = 'https://dtif.lapidist.net/schema/core.json';

const foundationPointer = appendJsonPointer(JSON_POINTER_ROOT, 'foundation', 'core');
const productPointer = appendJsonPointer(JSON_POINTER_ROOT, 'product', 'button');
const deliveryVirtualPointer = appendJsonPointer(JSON_POINTER_ROOT, 'delivery', 'virtual');
const deliveryInlinePointer = appendJsonPointer(JSON_POINTER_ROOT, 'delivery', 'inline');

describe('SourcePlanner', () => {
  it('plans across file and virtual sources deterministically', async () => {
    const logger = new MemoryLogger();
    const config: BuildConfig = {
      layers: [
        { name: 'foundation', context: { theme: 'base' } },
        { name: 'product' },
        { name: 'delivery', context: { channel: 'api' } },
      ],
      sources: [
        {
          kind: 'file',
          id: 'foundation-files',
          layer: 'foundation',
          pointerTemplate: pointerTemplate('foundation', placeholder('stem')),
          patterns: ['foundation/*.json'],
          ignore: ['foundation/ignore-me.json'],
          rootDir: fixturesRoot,
          context: { region: 'global' },
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
          id: 'virtual-doc',
          layer: 'delivery',
          pointerTemplate: pointerTemplate('delivery', 'virtual'),
          document: () => ({
            $schema: baseSchema,
            virtual: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [0, 0, 1],
                hex: '#0000ff',
              },
            },
          }),
        },
        {
          kind: 'virtual',
          id: 'inline-doc',
          layer: 'delivery',
          pointerTemplate: pointerTemplate('delivery', 'inline'),
          document: () => ({
            $schema: baseSchema,
            inline: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [1, 0, 0],
                hex: '#ff0000',
              },
            },
          }),
        },
      ],
    };

    const planner = new SourcePlanner(config, { logger });
    const plan = await planner.plan();

    assertPlanShape(plan);

    const entriesById = Object.fromEntries(plan.entries.map((entry) => [entry.id, entry] as const));
    const foundation = entriesById['foundation-files'];
    const product = entriesById['product-files'];
    const virtual = entriesById['virtual-doc'];
    const inline = entriesById['inline-doc'];

    expect(foundation?.uri.startsWith('file://')).toBe(true);
    expect(foundation?.pointerPrefix).toBe(foundationPointer);
    expect(foundation?.context).toEqual({
      theme: 'base',
      region: 'global',
      pointerPrefix: foundationPointer,
      uri: foundation?.uri,
      sourceId: 'foundation-files',
    });
    expect(foundation?.document.color?.$type).toBe('color');

    expect(product?.pointerPrefix).toBe(productPointer);
    expect(virtual?.pointerPrefix).toBe(deliveryVirtualPointer);
    expect(inline?.pointerPrefix).toBe(deliveryInlinePointer);

    expect(logger.events.some((event) => event.event === 'planner.plan.completed')).toBe(true);
  });

  it('aggregates validation failures across sources', async () => {
    const logger = new MemoryLogger();
    const config: BuildConfig = {
      layers: [{ name: 'product' }],
      sources: [
        {
          kind: 'file',
          id: 'invalid-product',
          layer: 'product',
          pointerTemplate: pointerTemplate('product', placeholder('stem')),
          patterns: ['product/invalid.json'],
          rootDir: fixturesRoot,
        },
      ],
    };

    const planner = new SourcePlanner(config, { logger });

    await expect(planner.plan()).rejects.toMatchObject({
      failures: [
        expect.objectContaining({
          sourceId: 'invalid-product',
          errors: expect.arrayContaining([expect.objectContaining({ keyword: 'type' })]),
        }),
      ],
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          scope: 'token-source:invalid-product',
          level: 'error',
          code: 'type',
        }),
      ]),
    });

    expect(
      logger.events.some(
        (event) => event.event === 'planner.validation.failed' && event.level === 'error',
      ),
    ).toBe(true);
  });

  it('groups repository issues into planner failures', async () => {
    const config: BuildConfig = {
      layers: [{ name: 'foundation' }],
      sources: [
        {
          kind: 'file',
          id: 'tokens',
          layer: 'foundation',
          pointerTemplate: pointerTemplate('foundation', placeholder('stem')),
          patterns: ['foundation/core.json'],
          rootDir: fixturesRoot,
        },
      ],
    };

    const planner = new SourcePlanner(config);
    const now = new Date();
    const repositoryIssue = {
      kind: 'repository',
      sourceId: 'tokens',
      uri: 'source:tokens',
      pointerPrefix: '#',
      code: 'repository',
      message: 'unable to read source',
      details: { reason: 'io' },
      severity: 'error',
    } as const;

    (planner as { service: { plan(config: BuildConfig): Promise<unknown> } }).service = {
      plan: async () => ({
        plan: { createdAt: now, entries: [] },
        issues: [repositoryIssue, repositoryIssue],
        durationMs: 1,
      }),
    };

    await expect(planner.plan()).rejects.toMatchObject({
      failures: [
        {
          sourceId: 'tokens',
          uri: 'source:tokens',
          pointerPrefix: '#',
          errors: [
            {
              keyword: 'repository',
              instancePath: '',
              schemaPath: '',
              message: 'unable to read source',
              params: { reason: 'io' },
            },
            {
              keyword: 'repository',
              instancePath: '',
              schemaPath: '',
              message: 'unable to read source',
              params: { reason: 'io' },
            },
          ],
        },
      ],
      diagnostics: [
        expect.objectContaining({ code: 'repository', scope: 'token-source:tokens' }),
        expect.objectContaining({ code: 'repository', scope: 'token-source:tokens' }),
      ],
    });
  });

  it('reports virtual source URIs for unknown layer failures', async () => {
    const config: BuildConfig = {
      layers: [{ name: 'foundation' }],
      sources: [
        {
          kind: 'virtual',
          id: 'virtual-missing-layer',
          layer: 'product',
          pointerTemplate: pointerTemplate('product', placeholder('stem')),
          tokens: [],
        },
      ],
    };

    const planner = new SourcePlanner(config);

    await expect(planner.plan()).rejects.toMatchObject({
      failures: [
        expect.objectContaining({
          sourceId: 'virtual-missing-layer',
          uri: 'virtual:virtual-missing-layer',
          errors: [expect.objectContaining({ keyword: 'layer' })],
        }),
      ],
    });
  });
  it('rejects sources targeting unknown layers', async () => {
    const config: BuildConfig = {
      layers: [{ name: 'foundation' }],
      sources: [
        {
          kind: 'file',
          id: 'missing-layer',
          layer: 'product',
          pointerTemplate: pointerTemplate('product', placeholder('stem')),
          patterns: ['product/button.json'],
          rootDir: fixturesRoot,
        },
      ],
    };

    const planner = new SourcePlanner(config);

    await expect(planner.plan()).rejects.toMatchObject({
      failures: [
        expect.objectContaining({
          sourceId: 'missing-layer',
          errors: [expect.objectContaining({ keyword: 'layer' })],
        }),
      ],
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          scope: 'token-source:missing-layer',
          level: 'error',
          code: 'layer',
        }),
      ]),
    });
  });
});

/**
 * Asserts that the planner output contains the expected entries and ordering.
 * @param {SourcePlan} plan - Plan produced by the source planner.
 */
function assertPlanShape(plan: SourcePlan): void {
  expect(plan.entries).toHaveLength(4);
  const layerIndexes = plan.entries.map((entry) => entry.layerIndex);
  expect(layerIndexes).toEqual([0, 1, 2, 2]);
}

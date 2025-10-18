import { fileURLToPath } from 'node:url';

import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../config/index.js';
import { placeholder, pointerTemplate } from '../config/index.js';
import type { StructuredLogEvent, StructuredLogger } from '@dtifx/core/logging';
import { SourcePlanner } from '../application/planner/source-planner.js';
import {
  ResolutionSession,
  type ResolvedSourceEntry,
  type TokenSnapshot,
} from './resolution-session.js';

/**
 * In-memory logger that captures structured log events while tests execute.
 */
class MemoryLogger implements StructuredLogger {
  readonly events: StructuredLogEvent[] = [];

  /**
   * Records a structured log event emitted during the test run.
   * @param {StructuredLogEvent} entry - The structured log event to append to the buffer.
   */
  log(entry: StructuredLogEvent): void {
    this.events.push(entry);
  }
}

/**
 * Ensures a value is defined, throwing a descriptive error when not.
 * @template TValue
 * @param {TValue | undefined} value - The value to validate.
 * @param {string} message - Error message to throw if the value is undefined.
 * @returns {TValue} The provided value when defined.
 * @throws {Error} When the value is undefined.
 */
function expectDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

const fixturesRoot = fileURLToPath(new URL('../../tests/fixtures/dtif', import.meta.url));

describe('ResolutionSession', () => {
  it('resolves planned sources and annotates provenance', async () => {
    const logger = new MemoryLogger();
    const config: BuildConfig = {
      layers: [{ name: 'foundation', context: { theme: 'base' } }, { name: 'product' }],
      sources: [
        {
          kind: 'file',
          id: 'foundation-files',
          layer: 'foundation',
          pointerTemplate: pointerTemplate('foundation', placeholder('stem')),
          patterns: ['foundation/core.json'],
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
      ],
    } satisfies BuildConfig;

    const planner = new SourcePlanner(config, { logger });
    const plan = await planner.plan();

    const session = new ResolutionSession();
    const first = await session.resolve(plan);
    const second = await session.resolve(plan);

    expect(first.entries).toHaveLength(2);
    expect(second.entries).toHaveLength(2);

    const foundation: ResolvedSourceEntry = expectDefined(
      first.entries.find((entry) => entry.sourceId === 'foundation-files'),
      'foundation source should be present',
    );

    const foundationTokenCandidate = foundation.tokens[0];
    expect(foundationTokenCandidate).toBeDefined();
    const foundationToken = foundationTokenCandidate as TokenSnapshot;

    const expectedFoundationPointer = appendJsonPointer(
      appendJsonPointer(JSON_POINTER_ROOT, 'foundation', 'core'),
      'color',
    );
    expect(foundationToken.pointer).toEqual(expectedFoundationPointer);
    expect(foundationToken.provenance.layer).toEqual('foundation');
    expect(foundationToken.context.theme).toEqual('base');
    expect(foundation.cacheStatus).toEqual('miss');

    const product: ResolvedSourceEntry = expectDefined(
      first.entries.find((entry) => entry.sourceId === 'product-files'),
      'product source should be present',
    );
    expect(product.diagnostics).toHaveLength(0);

    expect(second.entries.every((entry) => entry.cacheStatus === 'hit')).toBe(true);

    const metrics = session.consumeMetrics();
    expect(metrics).toBeDefined();
    expect(metrics?.entryCount).toBe(2);
    expect(metrics?.cache.hits).toBe(2);
  });
});

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { loadTokenSnapshots, TokenSourceLoadError } from '../../src/application/token-loader.js';
import type {
  TokenSourcePort,
  TokenSourceLabel,
  TokenSourceContext,
} from '../../src/application/ports/token-source.js';
import {
  DiagnosticCategories,
  formatTokenSourceScope,
  type DiagnosticEvent,
  type DiagnosticsPort,
} from '../../src/application/ports/diagnostics.js';

test('loadTokenSnapshots emits diagnostics for each failed snapshot', async () => {
  const events: DiagnosticEvent[] = [];
  const diagnostics: DiagnosticsPort = {
    emit(event) {
      events.push(event);
    },
  };

  const tokenSource: TokenSourcePort = {
    async load(label: TokenSourceLabel) {
      throw new Error(`failed-${label}`);
    },
    describe() {
      return 'missing-path';
    },
  };

  await assert.rejects(
    () => loadTokenSnapshots(tokenSource, { diagnostics }),
    (error: unknown) => {
      assert.ok(error instanceof TokenSourceLoadError);
      assert.equal(error.failures.length, 2);
      return true;
    },
  );

  assert.deepEqual(
    events.map((event) => ({ scope: event.scope, code: event.code, category: event.category })),
    [
      {
        scope: formatTokenSourceScope('previous'),
        code: 'TOKEN_LOAD_AGGREGATE_FAILURE',
        category: DiagnosticCategories.tokenSource,
      },
      {
        scope: formatTokenSourceScope('next'),
        code: 'TOKEN_LOAD_AGGREGATE_FAILURE',
        category: DiagnosticCategories.tokenSource,
      },
    ],
  );
});

test('loadTokenSnapshots returns snapshots when both loads succeed', async () => {
  const contexts: Array<unknown> = [];
  const snapshots = {
    previous: new Map(),
    next: new Map(),
  } as const;

  const tokenSource: TokenSourcePort = {
    async load(label, context) {
      contexts.push(context);
      return snapshots[label];
    },
    describe(label) {
      return `token-source-${label}`;
    },
  };

  const result = await loadTokenSnapshots(tokenSource);

  assert.equal(contexts.length, 2);
  assert.deepEqual(contexts, [undefined, undefined]);
  assert.strictEqual(result.previous, snapshots.previous);
  assert.strictEqual(result.next, snapshots.next);
});

test('loadTokenSnapshots forwards diagnostics context to the token source port', async () => {
  const contexts: Array<TokenSourceContext | undefined> = [];
  const diagnostics: DiagnosticsPort = {
    emit: async () => {
      /* noop */
    },
  };

  const tokenSource: TokenSourcePort = {
    async load(label, context) {
      contexts.push(context);
      return new Map();
    },
    describe(label) {
      return `token-source-${label}`;
    },
  };

  await loadTokenSnapshots(tokenSource, { diagnostics });

  assert.equal(contexts.length, 2);
  for (const context of contexts) {
    assert.ok(context);
    assert.strictEqual(context?.diagnostics, diagnostics);
  }
});

test('loadTokenSnapshots reports unavailable descriptions when describe throws', async () => {
  const events: DiagnosticEvent[] = [];
  const diagnostics: DiagnosticsPort = {
    emit(event) {
      events.push(event);
    },
  };

  const tokenSource: TokenSourcePort = {
    async load() {
      throw new Error('failed to load snapshot');
    },
    describe() {
      throw 'describe failure';
    },
  };

  await assert.rejects(
    () => loadTokenSnapshots(tokenSource, { diagnostics }),
    (error: unknown) => {
      assert.ok(error instanceof TokenSourceLoadError);
      assert.equal(error.failures.length, 2);
      assert.equal(error.failures[0]?.description, '(unavailable: describe failure)');
      return true;
    },
  );
  assert.ok(events.length > 0);
  assert.match(events[0]?.message ?? '', /describe failure/);
});

test('TokenSourceLoadError summarises failure causes with indentation', () => {
  const error = new TokenSourceLoadError([
    {
      label: 'previous',
      description: 'source-a',
      cause: new Error('first line\nsecond line'),
    },
    {
      label: 'next',
      description: 'source-b',
      cause: 'string cause\nextra',
    },
    {
      label: 'next',
      description: 'source-c',
      cause: 42,
    },
  ]);

  assert.equal(
    error.message,
    [
      'Failed to load token sources:',
      '- previous (source-a): first line',
      '  second line',
      '- next (source-b): string cause',
      '  extra',
      '- next (source-c): 42',
    ].join('\n'),
  );
});

test('TokenSourceLoadError falls back to a generic message when there are no failures', () => {
  const error = new TokenSourceLoadError([]);

  assert.equal(error.message, 'Failed to load token sources.');
});

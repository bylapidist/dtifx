import { test } from 'vitest';
import assert from 'node:assert/strict';

import { loadTokenSnapshots, TokenSourceLoadError } from '../../src/application/token-loader.js';
import type {
  TokenSourcePort,
  TokenSourceLabel,
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

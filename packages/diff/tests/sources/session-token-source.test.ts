import { afterEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Diagnostic } from '@lapidist/dtif-parser';

import { createSessionTokenSourcePort } from '../../src/adapters/token-source/session-token-source.js';
import type { TokenSourceContext } from '../../src/application/ports/token-source.js';
import {
  DiagnosticCategories,
  formatTokenSourceScope,
  type DiagnosticEvent,
  type DiagnosticsPort,
} from '../../src/application/ports/diagnostics.js';
import * as fileLoader from '../../src/sources/file-loader.js';

const { join } = path;

function createDiagnosticsCollector() {
  const events: DiagnosticEvent[] = [];
  const diagnostics: DiagnosticsPort = {
    emit(event) {
      events.push(event);
    },
  };

  const context: TokenSourceContext = { diagnostics };

  return { events, context } as const;
}

async function writeTokenDocument(filePath: string, document: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(document, undefined, 2)}\n`, 'utf8');
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('session token source emits start and success diagnostics', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dtifx-session-source-'));
  const filePath = join(directory, 'tokens.json');
  await writeTokenDocument(filePath, {
    $schema: 'https://dtif.lapidist.net/schema/v0.2',
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.1, 0.2, 0.3],
            hex: '#1A334D',
          },
        },
      },
    },
  });

  const port = createSessionTokenSourcePort({
    previous: { kind: 'file', target: filePath },
    next: { kind: 'file', target: filePath },
  });

  const diagnostics = createDiagnosticsCollector();

  await port.load('previous', diagnostics.context);

  assert.deepEqual(
    diagnostics.events.map((event) => ({
      code: event.code,
      scope: event.scope,
      level: event.level,
      category: event.category,
    })),
    [
      {
        code: 'TOKEN_LOAD_START',
        scope: formatTokenSourceScope('previous'),
        level: 'info',
        category: DiagnosticCategories.tokenSourceSession,
      },
      {
        code: 'TOKEN_LOAD_SUCCESS',
        scope: formatTokenSourceScope('previous'),
        level: 'info',
        category: DiagnosticCategories.tokenSourceSession,
      },
    ],
  );
});

test('session token source emits diagnostics when loading fails', async () => {
  const port = createSessionTokenSourcePort({
    previous: { kind: 'file', target: '/not-found/previous.json' },
    next: { kind: 'file', target: '/not-found/next.json' },
  });

  const diagnostics = createDiagnosticsCollector();

  await assert.rejects(() => port.load('next', diagnostics.context));

  assert.equal(diagnostics.events[0]?.code, 'TOKEN_LOAD_START');
  assert.equal(diagnostics.events[0]?.scope, formatTokenSourceScope('next'));
  assert.equal(diagnostics.events[0]?.category, DiagnosticCategories.tokenSourceSession);
  assert.equal(diagnostics.events.at(-1)?.code, 'TOKEN_LOAD_ERROR');
  assert.equal(diagnostics.events.at(-1)?.scope, formatTokenSourceScope('next'));
  assert.equal(diagnostics.events.at(-1)?.category, DiagnosticCategories.tokenSourceSession);
});

test('session token source forwards parser diagnostics with categories', async () => {
  const diagnostic: Diagnostic = {
    code: 'DTIF_WARNING',
    severity: 'warning',
    message: 'Example parser warning',
    pointer: '#/colors/brand',
    span: {
      start: { line: 4, column: 5 },
      end: { line: 4, column: 12 },
    },
  } as const;

  vi.spyOn(fileLoader, 'loadTokenFile').mockImplementation(async (_path, options) => {
    options?.onDiagnostic?.(diagnostic);

    return {
      tokens: new Map(),
      source: 'mock-source',
    };
  });

  const port = createSessionTokenSourcePort({
    previous: { kind: 'file', target: 'mock.json' },
    next: { kind: 'file', target: 'mock.json' },
  });

  const diagnostics = createDiagnosticsCollector();
  await port.load('previous', diagnostics.context);

  const parserEvent = diagnostics.events.find((event) => event.code === diagnostic.code);
  assert.ok(parserEvent, 'expected parser diagnostic to be forwarded');
  assert.equal(parserEvent.scope, formatTokenSourceScope('previous'));
  assert.equal(parserEvent.category, DiagnosticCategories.tokenSourceParser);
  assert.equal(parserEvent.level, 'warn');
  assert.match(parserEvent.message ?? '', /Example parser warning/);
  assert.match(parserEvent.message ?? '', /#\/colors\/brand/);
  assert.ok(!parserEvent.message?.includes('mock.json'));
});

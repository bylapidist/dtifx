import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runDiffSession, TokenSourceLoadError } from '../../src/application/diff-session.js';
import {
  createSessionTokenSourcePort,
  type SessionTokenSources,
} from '../../src/adapters/token-source/session-token-source.js';
import type { TokenRenameStrategy } from '../../src/domain/strategies/rename.js';

const { join } = path;

async function writeTokenDocument(filePath: string, document: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(document, undefined, 2)}\n`, 'utf8');
}

async function runSession(
  sources: SessionTokenSources,
  options: Parameters<typeof runDiffSession>[1] = {},
) {
  return runDiffSession({ tokenSource: createSessionTokenSourcePort(sources) }, options);
}

test('runDiffSession loads documents, computes diffs, and evaluates failure policies', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dtifx-diff-session-'));
  const previousPath = join(directory, 'previous.json');
  const nextPath = join(directory, 'next.json');

  const document = {
    $schema: 'https://dtif.lapidist.net/schema/v0.2',
    spacing: {
      scale: {
        base: {
          $type: 'dimension',
          $value: {
            dimensionType: 'length',
            value: 4,
            unit: 'px',
          },
        },
      },
    },
  } as const;

  await writeTokenDocument(previousPath, document);

  const nextDocument = {
    ...document,
    spacing: {
      scale: {
        base: {
          $type: 'dimension',
          $value: {
            dimensionType: 'length',
            value: 8,
            unit: 'px',
          },
        },
      },
    },
  } satisfies typeof document;

  await writeTokenDocument(nextPath, nextDocument);

  const session = await runSession(
    {
      previous: { kind: 'file', target: previousPath },
      next: { kind: 'file', target: nextPath },
    },
    { failure: { failOnChanges: true } },
  );

  assert.equal(session.filterApplied, false);
  assert.equal(session.diff.changed.length, 1);
  assert.equal(session.filteredDiff.changed.length, 1);
  assert.equal(session.failure.shouldFail, true);
  assert.equal(session.failure.reason, 'token-changes');
  assert.equal(session.failure.matchedCount, 1);
});

test('runDiffSession applies diff filters before returning the result', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dtifx-diff-session-'));
  const previousPath = join(directory, 'previous.json');
  const nextPath = join(directory, 'next.json');

  const previousDocument = {
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
  } as const;

  await writeTokenDocument(previousPath, previousDocument);

  const nextDocument = {
    ...previousDocument,
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
    spacing: {
      scale: {
        base: {
          $type: 'dimension',
          $value: {
            dimensionType: 'length',
            value: 4,
            unit: 'px',
          },
        },
      },
    },
  } as const;

  await writeTokenDocument(nextPath, nextDocument);

  const session = await runSession(
    {
      previous: { kind: 'file', target: previousPath },
      next: { kind: 'file', target: nextPath },
    },
    { filter: { types: ['dimension'] } },
  );

  assert.equal(session.filterApplied, true);
  assert.equal(session.diff.added.length, 1);
  assert.equal(session.filteredDiff.added.length, 1);
  assert.equal(session.filteredDiff.added[0]?.next.type, 'dimension');
});

test('runDiffSession aggregates token source load failures', async () => {
  await assert.rejects(
    () =>
      runSession({
        previous: { kind: 'file', target: '/non-existent/previous.json' },
        next: { kind: 'file', target: '/non-existent/next.json' },
      }),
    (error: unknown) => {
      assert.ok(error instanceof TokenSourceLoadError);
      assert.match(error.message, /Failed to load token sources/);
      assert.equal(error.failures.length, 2);
      return true;
    },
  );
});

test('runDiffSession forwards diff options to the engine', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dtifx-diff-session-'));
  const previousPath = join(directory, 'previous.json');
  const nextPath = join(directory, 'next.json');

  const previousDocument = {
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
  } as const;

  await writeTokenDocument(previousPath, previousDocument);

  const nextDocument = {
    $schema: 'https://dtif.lapidist.net/schema/v0.2',
    color: {
      brand: {
        headline: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.6, 0.2, 0.3],
            hex: '#99334D',
          },
        },
      },
    },
  } as const;

  await writeTokenDocument(nextPath, nextDocument);

  const renameStrategy: TokenRenameStrategy = {
    detectRenames(removed, added, impactStrategy) {
      if (removed.length === 0 || added.length === 0) {
        return {
          renamed: [],
          remainingRemoved: removed,
          remainingAdded: added,
        };
      }

      const [removal, ...remainingRemoved] = removed;
      const [addition, ...remainingAdded] = added;

      return {
        renamed: [
          {
            kind: 'renamed',
            previousId: removal.id,
            nextId: addition.id,
            previous: removal.previous,
            next: addition.next,
            impact: impactStrategy.classifyRename(removal.previous, addition.next),
          },
        ],
        remainingRemoved,
        remainingAdded,
      };
    },
  };

  const session = await runSession(
    {
      previous: { kind: 'file', target: previousPath },
      next: { kind: 'file', target: nextPath },
    },
    { diff: { renameStrategy } },
  );

  assert.equal(session.diff.renamed.length, 1);
  assert.equal(session.diff.added.length, 0);
  assert.equal(session.diff.removed.length, 0);
});

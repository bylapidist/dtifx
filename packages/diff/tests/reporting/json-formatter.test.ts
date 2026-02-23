import { test } from 'vitest';
import assert from 'node:assert/strict';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { diffTokenSets } from '../../src/diff.js';
import { formatDiffAsJson, createJsonPayload } from '../../src/reporting/renderers/json.js';
import type {
  TokenDiffJsonChange,
  TokenDiffJsonSummary,
  TokenDiffJsonWithChanges,
} from '../../src/reporting/renderers/json.js';
import { createTokenSetFromTree, loadTokenFile } from '../../src/token-set.js';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const { join } = path;
const fixturesDirectory = join(packageRoot, 'tests/fixtures');

test('formatDiffAsJson emits a structured change payload', () => {
  const previous = createTokenSetFromTree({
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
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.9, 0.9, 0.9],
            hex: '#E5E5E5',
          },
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.2, 0.3, 0.4],
            hex: '#334D66',
          },
          $description: 'Updated',
        },
        secondaryRenamed: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.9, 0.9, 0.9],
            hex: '#E5E5E5',
          },
        },
        tertiary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.8, 0.85, 0.9],
            hex: '#CCD9E6',
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const runContext = {
    previous: 'previous.json',
    next: 'next.json',
    startedAt: '2024-03-01T09:15:00Z',
    durationMs: 1250,
  } as const;
  const json = formatDiffAsJson(diff, { runContext });
  const payload = JSON.parse(json) as TokenDiffJsonWithChanges;

  assert.equal(payload.reportSchemaVersion, 3);
  assert.match(payload.generatedAt, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/u);
  assert.deepEqual(payload.run, runContext);
  assert.deepEqual(payload.summary, {
    added: 1,
    removed: 0,
    renamed: 1,
    changed: 1,
    unchanged: 0,
    totalNext: next.tokens.size,
    totalPrevious: previous.tokens.size,
    breaking: 2,
    nonBreaking: 1,
    valueChanged: 1,
    metadataChanged: 0,
    recommendedBump: 'major',
    types: [
      {
        type: 'color',
        totalPrevious: previous.tokens.size,
        totalNext: next.tokens.size,
        added: 1,
        removed: 0,
        renamed: 1,
        changed: 1,
        unchanged: 0,
        breaking: 2,
        nonBreaking: 1,
        valueChanged: 1,
        metadataChanged: 0,
      },
    ],
    groups: [
      {
        group: 'color',
        totalPrevious: previous.tokens.size,
        totalNext: next.tokens.size,
        added: 1,
        removed: 0,
        renamed: 1,
        changed: 1,
        unchanged: 0,
        breaking: 2,
        nonBreaking: 1,
        valueChanged: 1,
        metadataChanged: 0,
      },
      {
        group: 'color/brand',
        totalPrevious: previous.tokens.size,
        totalNext: next.tokens.size,
        added: 1,
        removed: 0,
        renamed: 1,
        changed: 1,
        unchanged: 0,
        breaking: 2,
        nonBreaking: 1,
        valueChanged: 1,
        metadataChanged: 0,
      },
    ],
  });

  assert.deepEqual(payload.insights.impact, {
    breaking: 2,
    nonBreaking: 1,
  });
  assert.deepEqual(payload.insights.operations, {
    added: 1,
    removed: 0,
    renamed: 1,
    changed: 1,
  });
  assert.deepEqual(payload.insights.totals, {
    previous: previous.tokens.size,
    next: next.tokens.size,
  });
  assert.deepEqual(payload.insights.changeMix, {
    valueChanged: 1,
    metadataChanged: 0,
  });
  assert.deepEqual(payload.insights.typeHotspots, [
    {
      label: 'color',
      changes: 3,
      breaking: 2,
      nonBreaking: 1,
    },
  ]);
  assert.deepEqual(payload.insights.groupHotspots, [
    {
      label: 'color',
      changes: 3,
      breaking: 2,
      nonBreaking: 1,
    },
    {
      label: 'color/brand',
      changes: 3,
      breaking: 2,
      nonBreaking: 1,
    },
  ]);

  assert.equal(payload.insights.topRisks.length, 3);
  const [firstRisk, secondRisk, thirdRisk] = payload.insights.topRisks;
  assert.deepEqual(firstRisk, {
    kind: 'changed',
    impact: 'breaking',
    labelPath: '#/color/brand/primary',
    typeLabel: 'color',
    title: 'Value updated',
    why: 'Changed fields: value, raw data, and description',
    impactSummary: 'Breaking update: dependent experiences may regress.',
    nextStep: 'Coordinate updates for #/color/brand/primary before release.',
    score: 2,
    tokens: {
      previous: '#/color/brand/primary',
      next: '#/color/brand/primary',
    },
    changedFields: ['value', 'raw', 'description'],
  });
  assert.deepEqual(secondRisk, {
    kind: 'renamed',
    impact: 'breaking',
    labelPath: '#/color/brand/secondary → #/color/brand/secondaryRenamed',
    typeLabel: 'color',
    title: 'Token renamed',
    why: 'Pointer moved to #/color/brand/secondaryRenamed',
    impactSummary: 'Breaking rename: references must switch to #/color/brand/secondaryRenamed.',
    nextStep: 'Replace usages of #/color/brand/secondary with #/color/brand/secondaryRenamed.',
    score: 2,
    tokens: {
      previous: '#/color/brand/secondary',
      next: '#/color/brand/secondaryRenamed',
    },
  });
  assert.deepEqual(thirdRisk, {
    kind: 'added',
    impact: 'non-breaking',
    labelPath: '#/color/brand/tertiary',
    typeLabel: 'color',
    title: 'Token added',
    why: 'Introduces new color token',
    impactSummary: 'Non-breaking addition: publicise availability to adopters.',
    nextStep: 'Plan adoption for #/color/brand/tertiary across consuming teams.',
    score: 103,
    tokens: {
      next: '#/color/brand/tertiary',
    },
  });

  const kinds = payload.changes.map((entry) => entry.kind);
  assert.deepEqual(kinds, ['added', 'renamed', 'changed']);

  const addition = expectChange(payload, 'added');
  assert.equal(addition.token, '#/color/brand/tertiary');
  assert.equal(addition.next.type, 'color');
  assert.equal(addition.impact, 'non-breaking');

  const rename = expectChange(payload, 'renamed');
  assert.equal(rename.previousToken, '#/color/brand/secondary');
  assert.equal(rename.nextToken, '#/color/brand/secondaryRenamed');
  assert.equal(rename.impact, 'breaking');

  const change = expectChange(payload, 'changed');
  assert.deepEqual(change.changes, ['value', 'raw', 'description']);
  assert.equal(change.impact, 'breaking');
});

test('formatDiffAsJson can render only the summary', () => {
  const previous = createTokenSetFromTree({
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

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.2, 0.3, 0.4],
            hex: '#334D66',
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const json = formatDiffAsJson(diff, { mode: 'summary' });
  const payload = JSON.parse(json) as TokenDiffJsonSummary;

  assert.deepEqual(payload, {
    added: 0,
    removed: 0,
    renamed: 0,
    changed: 1,
    unchanged: 0,
    totalNext: next.tokens.size,
    totalPrevious: previous.tokens.size,
    breaking: 1,
    nonBreaking: 0,
    valueChanged: 1,
    metadataChanged: 0,
    recommendedBump: 'major',
    types: [
      {
        type: 'color',
        totalPrevious: previous.tokens.size,
        totalNext: next.tokens.size,
        added: 0,
        removed: 0,
        renamed: 0,
        changed: 1,
        unchanged: 0,
        breaking: 1,
        nonBreaking: 0,
        valueChanged: 1,
        metadataChanged: 0,
      },
    ],
    groups: [
      {
        group: 'color',
        totalPrevious: previous.tokens.size,
        totalNext: next.tokens.size,
        added: 0,
        removed: 0,
        renamed: 0,
        changed: 1,
        unchanged: 0,
        breaking: 1,
        nonBreaking: 0,
        valueChanged: 1,
        metadataChanged: 0,
      },
      {
        group: 'color/brand',
        totalPrevious: previous.tokens.size,
        totalNext: next.tokens.size,
        added: 0,
        removed: 0,
        renamed: 0,
        changed: 1,
        unchanged: 0,
        breaking: 1,
        nonBreaking: 0,
        valueChanged: 1,
        metadataChanged: 0,
      },
    ],
  });
});

test('formatDiffAsJson treats detailed mode as full output', () => {
  const previous = createTokenSetFromTree({
    color: {
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 0, 0],
          hex: '#000000',
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [17 / 255, 17 / 255, 17 / 255],
          hex: '#111111',
        },
      },
      secondary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [1, 1, 1],
          hex: '#FFFFFF',
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const detailed = JSON.parse(
    formatDiffAsJson(diff, { mode: 'detailed' }),
  ) as TokenDiffJsonWithChanges;
  const full = JSON.parse(formatDiffAsJson(diff)) as TokenDiffJsonWithChanges;

  const {
    generatedAt: detailedGeneratedAt,
    run: detailedRun,
    ...detailedWithoutTimestamp
  } = detailed;
  const { generatedAt: fullGeneratedAt, run: fullRun, ...fullWithoutTimestamp } = full;

  assert.strictEqual(typeof detailedGeneratedAt, 'string');
  assert.strictEqual(typeof fullGeneratedAt, 'string');
  assert.strictEqual(detailedRun, undefined);
  assert.strictEqual(fullRun, undefined);
  assert.deepEqual(detailedWithoutTimestamp, fullWithoutTimestamp);
});

test('createJsonPayload returns deterministic change ordering', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
        removed: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [17 / 255, 17 / 255, 17 / 255],
            hex: '#111111',
          },
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        added: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [34 / 255, 34 / 255, 34 / 255],
            hex: '#222222',
          },
        },
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1 / 255, 1 / 255, 1 / 255],
            hex: '#010101',
          },
        },
        renamed: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [17 / 255, 17 / 255, 17 / 255],
            hex: '#111111',
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const payload = createJsonPayload(diff);

  assert.ok(isWithChanges(payload));
  const ordering = payload.changes.map((entry) => entry.kind);
  assert.deepEqual(ordering, ['added', 'renamed', 'changed']);
});

test('createJsonPayload honours the requested top risk limit', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
        },
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [17 / 255, 17 / 255, 17 / 255],
            hex: '#111111',
          },
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [34 / 255, 34 / 255, 34 / 255],
            hex: '#222222',
          },
        },
        secondaryRenamed: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [51 / 255, 51 / 255, 51 / 255],
            hex: '#333333',
          },
        },
        tertiary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [68 / 255, 68 / 255, 68 / 255],
            hex: '#444444',
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const limited = createJsonPayload(diff, 'full', { topRisks: 2 });
  assert.ok(isWithChanges(limited));
  assert.equal(limited.insights.topRisks.length, 2);

  const zero = createJsonPayload(diff, 'full', { topRisks: 0 });
  assert.ok(isWithChanges(zero));
  assert.equal(zero.insights.topRisks.length, 0);
});

test('createJsonPayload preserves filesystem URIs', async () => {
  const fixtureDirectory = join(fixturesDirectory, 'cli-smoke');
  const previousPath = join(fixtureDirectory, 'previous.tokens.json');
  const nextPath = join(fixtureDirectory, 'next.tokens.json');

  const [previous, next] = await Promise.all([
    loadTokenFile(previousPath),
    loadTokenFile(nextPath),
  ]);

  const diff = diffTokenSets(previous, next);
  const payload = createJsonPayload(diff);
  const serialized = JSON.stringify(payload);

  assert.equal(serialized.includes('file://'), true);
  assert.equal(serialized.includes(process.cwd()), true);
});

function expectChange<K extends TokenDiffJsonChange['kind']>(
  payload: TokenDiffJsonWithChanges,
  kind: K,
): Extract<TokenDiffJsonChange, { kind: K }> {
  const change = payload.changes.find(
    (entry): entry is Extract<TokenDiffJsonChange, { kind: K }> => entry.kind === kind,
  );

  assert.ok(change);
  return change;
}

function isWithChanges(
  payload: ReturnType<typeof createJsonPayload>,
): payload is TokenDiffJsonWithChanges {
  return 'changes' in payload;
}
const __dirname = fileURLToPath(new URL('.', import.meta.url));

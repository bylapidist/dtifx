import { test } from 'vitest';
import assert from 'node:assert/strict';

import { diffTokenSets } from '../../src/diff.js';
import { formatDiffAsSarif } from '../../src/reporting/renderers/sarif.js';
import { createTokenSetFromTree } from '../../src/token-set.js';

test('formatDiffAsSarif emits a SARIF log covering all change kinds', () => {
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
            components: [204 / 255, 204 / 255, 204 / 255],
            hex: '#CCCCCC',
          },
        },
      },
    },
    spacing: {
      scale: {
        medium: {
          $type: 'dimension',
          $value: { dimensionType: 'length', value: 8, unit: 'px' },
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        accent: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 0, 0],
            hex: '#FF0000',
          },
        },
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [34 / 255, 34 / 255, 34 / 255],
            hex: '#222222',
          },
        },
      },
    },
    spacing: {
      scale: {
        mid: {
          $type: 'dimension',
          $value: { dimensionType: 'length', value: 8, unit: 'px' },
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
  const sarif = formatDiffAsSarif(diff, { runContext });
  const payload = JSON.parse(sarif) as {
    readonly version: string;
    readonly runs: readonly [
      {
        readonly tool: {
          readonly driver: {
            readonly name: string;
            readonly rules: readonly unknown[];
          };
        };
        readonly results: readonly {
          readonly ruleId: string;
          readonly level: string;
          readonly properties?: { readonly kind?: string };
        }[];
        readonly properties?: {
          readonly summary?: { readonly breaking: number };
          readonly runContext?: Readonly<Record<string, unknown>>;
        };
      },
    ];
  };

  assert.equal(payload.version, '2.1.0');
  const [run] = payload.runs;
  assert.equal(run.tool.driver.name, '@dtifx/diff');
  assert.equal(run.tool.driver.rules.length > 0, true);
  assert.ok(run.properties);
  assert.deepEqual(run.properties.summary, {
    breaking: diff.summary.breaking,
    nonBreaking: diff.summary.nonBreaking,
    added: diff.summary.added,
    removed: diff.summary.removed,
    changed: diff.summary.changed,
    renamed: diff.summary.renamed,
    recommendedBump: diff.summary.recommendedBump,
  });
  assert.deepEqual(run.properties.runContext, runContext);

  const expectedCount =
    diff.added.length + diff.removed.length + diff.changed.length + diff.renamed.length;
  assert.equal(run.results.length, expectedCount);

  const kinds = run.results.map((result) => result.properties?.kind).toSorted();
  assert.deepEqual(kinds, ['added', 'changed', 'removed', 'renamed']);

  for (const result of run.results) {
    const expectedLevel = result.properties?.impact === 'breaking' ? 'error' : 'warning';
    assert.equal(result.level, expectedLevel);
  }

  const change = run.results.find((result) => result.properties?.kind === 'changed');
  assert.ok(change);
  assert.equal(change.ruleId, 'token-changed');

  const removal = run.results.find((result) => result.properties?.kind === 'removed');
  assert.ok(removal);
  assert.equal(removal.ruleId, 'token-removed');

  const rename = run.results.find((result) => result.properties?.kind === 'renamed');
  assert.ok(rename);
  assert.equal(rename.ruleId, 'token-renamed');

  const addition = run.results.find((result) => result.properties?.kind === 'added');
  assert.ok(addition);
  assert.equal(addition.ruleId, 'token-added');
});

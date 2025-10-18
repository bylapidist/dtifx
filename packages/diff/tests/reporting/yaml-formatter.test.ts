import { test } from 'vitest';
import assert from 'node:assert/strict';

import { parse } from 'yaml';

import { diffTokenSets } from '../../src/diff.js';
import {
  createJsonPayload,
  type TokenDiffJsonWithChanges,
} from '../../src/reporting/renderers/json.js';
import { formatDiffAsYaml } from '../../src/reporting/renderers/yaml.js';
import { createTokenSetFromTree } from '../../src/token-set.js';

test('formatDiffAsYaml emits a structured change payload', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $value: {
            colorSpace: 'srgb',
            components: [0.1, 0.2, 0.3],
            hex: '#1A334D',
          },
          $type: 'color',
        },
        secondary: {
          $value: {
            colorSpace: 'srgb',
            components: [0.9, 0.9, 0.9],
            hex: '#E5E5E5',
          },
          $type: 'color',
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $value: {
            colorSpace: 'srgb',
            components: [0.2, 0.3, 0.4],
            hex: '#334D66',
          },
          $type: 'color',
          $description: 'Updated',
        },
        secondaryRenamed: {
          $value: {
            colorSpace: 'srgb',
            components: [0.9, 0.9, 0.9],
            hex: '#E5E5E5',
          },
          $type: 'color',
        },
        tertiary: {
          $value: {
            colorSpace: 'srgb',
            components: [0.8, 0.85, 0.9],
            hex: '#CCD9E6',
          },
          $type: 'color',
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
  const output = formatDiffAsYaml(diff, { runContext });
  const payload = parse(output) as TokenDiffJsonWithChanges;
  const expected = createJsonPayload(diff, 'full', { runContext }) as TokenDiffJsonWithChanges;

  assert.equal(typeof payload.generatedAt, 'string');
  assert.deepEqual({ ...payload, generatedAt: undefined }, { ...expected, generatedAt: undefined });
});

test('formatDiffAsYaml honours the requested top risk limit', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
            hex: '#000000',
          },
          $type: 'color',
        },
        secondary: {
          $value: {
            colorSpace: 'srgb',
            components: [17 / 255, 17 / 255, 17 / 255],
            hex: '#111111',
          },
          $type: 'color',
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $value: {
            colorSpace: 'srgb',
            components: [34 / 255, 34 / 255, 34 / 255],
            hex: '#222222',
          },
          $type: 'color',
        },
        secondaryRenamed: {
          $value: {
            colorSpace: 'srgb',
            components: [51 / 255, 51 / 255, 51 / 255],
            hex: '#333333',
          },
          $type: 'color',
        },
        tertiary: {
          $value: {
            colorSpace: 'srgb',
            components: [68 / 255, 68 / 255, 68 / 255],
            hex: '#444444',
          },
          $type: 'color',
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const limited = formatDiffAsYaml(diff, { topRisks: 1 });
  const limitedPayload = parse(limited) as TokenDiffJsonWithChanges;
  assert.equal(limitedPayload.insights.topRisks.length, 1);

  const zero = formatDiffAsYaml(diff, { topRisks: 0 });
  const zeroPayload = parse(zero) as TokenDiffJsonWithChanges;
  assert.equal(zeroPayload.insights.topRisks.length, 0);
});

test('formatDiffAsYaml can render only the summary', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $value: {
            colorSpace: 'srgb',
            components: [0.1, 0.2, 0.3],
            hex: '#1A334D',
          },
          $type: 'color',
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $value: {
            colorSpace: 'srgb',
            components: [0.2, 0.3, 0.4],
            hex: '#334D66',
          },
          $type: 'color',
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsYaml(diff, { mode: 'summary' });
  const payload = parse(output);
  const expected = createJsonPayload(diff, 'summary');

  assert.deepEqual(payload, expected);
});

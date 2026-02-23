import { test } from 'vitest';
import assert from 'node:assert/strict';

import { diffTokenSets } from '../../src/diff.js';
import { evaluateDiffFailure } from '../../src/domain/failure-policy.js';
import { createTokenSetFromTree } from '../../src/token-set.js';

test('evaluateDiffFailure triggers on breaking changes when enabled', () => {
  const previous = createTokenSetFromTree({
    size: {
      medium: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 16,
          unit: 'px',
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    size: {
      medium: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 20,
          unit: 'px',
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const result = evaluateDiffFailure(diff, { failOnBreaking: true });

  assert.deepEqual(result, {
    shouldFail: true,
    reason: 'breaking-changes',
    matchedCount: 1,
  });
});

test('evaluateDiffFailure triggers on any changes when enabled', () => {
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

  const diff = diffTokenSets(previous, next);
  const result = evaluateDiffFailure(diff, { failOnChanges: true });

  assert.deepEqual(result, {
    shouldFail: true,
    reason: 'token-changes',
    matchedCount: 1,
  });
});

test('evaluateDiffFailure does not trigger when policies are disabled', () => {
  const previous = createTokenSetFromTree({});
  const next = createTokenSetFromTree({});

  const diff = diffTokenSets(previous, next);
  const result = evaluateDiffFailure(diff, {
    failOnBreaking: false,
    failOnChanges: false,
  });

  assert.deepEqual(result, { shouldFail: false });
});

test('evaluateDiffFailure prioritises breaking policies', () => {
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
            components: [17 / 255, 17 / 255, 17 / 255],
            hex: '#111111',
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const result = evaluateDiffFailure(diff, {
    failOnBreaking: true,
    failOnChanges: true,
  });

  assert.deepEqual(result, {
    shouldFail: true,
    reason: 'breaking-changes',
    matchedCount: 1,
  });
});

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { diffTokenSets, recommendVersionBump } from '../../src/diff.js';
import { createTokenSetFromTree } from '../../src/token-set.js';

test('recommendVersionBump returns major when breaking changes are present', () => {
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
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
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

  const diff = diffTokenSets(previous, next);
  assert.equal(recommendVersionBump(diff), 'major');
});

test('recommendVersionBump returns minor for non-breaking additions', () => {
  const previous = createTokenSetFromTree({});
  const next = createTokenSetFromTree({
    size: {
      medium: {
        $value: {
          dimensionType: 'length',
          value: 16,
          unit: 'px',
        },
        $type: 'dimension',
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  assert.equal(recommendVersionBump(diff), 'minor');
});

test('recommendVersionBump returns patch for metadata-only updates', () => {
  const previous = createTokenSetFromTree({
    motion: {
      duration: {
        $value: {
          durationType: 'css.transition-duration',
          value: 150,
          unit: 'ms',
        },
        $type: 'duration',
      },
    },
  });

  const next = createTokenSetFromTree({
    motion: {
      duration: {
        $value: {
          durationType: 'css.transition-duration',
          value: 150,
          unit: 'ms',
        },
        $type: 'duration',
        $description: 'Used for standard transitions',
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  assert.equal(recommendVersionBump(diff), 'patch');
});

test('recommendVersionBump returns none when no changes are detected', () => {
  const previous = createTokenSetFromTree({
    opacity: {
      subtle: {
        $value: {
          opacityType: 'css.opacity',
          value: 0.5,
        },
        $type: 'opacity',
      },
    },
  });

  const next = createTokenSetFromTree({
    opacity: {
      subtle: {
        $value: {
          opacityType: 'css.opacity',
          value: 0.5,
        },
        $type: 'opacity',
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  assert.equal(recommendVersionBump(diff), 'none');
});

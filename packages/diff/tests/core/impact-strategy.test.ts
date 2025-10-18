import { test } from 'vitest';
import assert from 'node:assert/strict';

import { createTokenSetFromTree } from '../../src/token-set.js';
import { diffTokenSets, createFieldImpactStrategy } from '../../src/diff.js';

test('createFieldImpactStrategy customises addition and metadata impacts', () => {
  const previous = createTokenSetFromTree({
    color: {
      base: {
        $value: {
          colorSpace: 'srgb',
          components: [0, 0, 0],
          hex: '#000000',
        },
        $type: 'color',
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      base: {
        $value: {
          colorSpace: 'srgb',
          components: [0, 0, 0],
          hex: '#000000',
        },
        $type: 'color',
        $description: 'Updated copy',
      },
      accent: {
        $value: {
          colorSpace: 'srgb',
          components: [1, 1, 1],
          hex: '#ffffff',
        },
        $type: 'color',
      },
    },
  });

  const impactStrategy = createFieldImpactStrategy({
    additionImpact: 'breaking',
    breakingFields: ['value'],
    defaultModificationImpact: 'non-breaking',
  });

  const diff = diffTokenSets(previous, next, { impactStrategy });

  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0]?.impact, 'breaking');

  const modification = diff.changed.find((entry) => entry.id === '#/color/base');
  assert.ok(modification, 'expected metadata change for #/color/base');
  assert.equal(modification.impact, 'non-breaking');
});

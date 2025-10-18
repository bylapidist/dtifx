import { test } from 'vitest';
import assert from 'node:assert/strict';

import { createTokenSetFromTree } from '../../src/token-set.js';
import { diffTokenSets, createStructuralRenameStrategy } from '../../src/diff.js';

const baseTree = {
  color: {
    primary: {
      $value: {
        colorSpace: 'srgb',
        components: [13 / 255, 26 / 255, 51 / 255],
        hex: '#0D1A33',
      },
      $type: 'color',
      $extensions: { 'example.audit': 'baseline' },
    },
  },
};

const renamedTree = {
  color: {
    flagship: {
      $value: {
        colorSpace: 'srgb',
        components: [13 / 255, 26 / 255, 51 / 255],
        hex: '#0D1A33',
      },
      $type: 'color',
      $extensions: { 'example.audit': 'updated' },
    },
  },
};

test('createStructuralRenameStrategy can ignore extension metadata', () => {
  const previous = createTokenSetFromTree(baseTree);
  const next = createTokenSetFromTree(renamedTree);

  const defaultDiff = diffTokenSets(previous, next);
  assert.equal(defaultDiff.renamed.length, 0);
  assert.equal(defaultDiff.added.length, 1);
  assert.equal(defaultDiff.removed.length, 1);

  const renameStrategy = createStructuralRenameStrategy({ includeExtensions: false });
  const diff = diffTokenSets(previous, next, { renameStrategy });

  assert.equal(diff.renamed.length, 1);
  assert.equal(diff.renamed[0]?.previousId, '#/color/primary');
  assert.equal(diff.renamed[0]?.nextId, '#/color/flagship');
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
});

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { diffTokenSets } from '../../src/diff.js';
import type {
  TokenDiffSummary,
  TokenDiffTypeSummary,
  TokenDiffGroupSummary,
} from '../../src/diff.js';
import { createTokenSetFromTree } from '../../src/token-set.js';

const baseTokens = {
  color: {
    brand: {
      alias: {
        $ref: '#/color/brand/primary',
        $type: 'color',
      },
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.05, 0.1, 0.2],
          hex: '#0D1A33',
        },
        $description: 'Brand primary',
        $extensions: { 'example.audit': { status: 'baseline' } },
        $deprecated: { $replacement: '#/color/brand/secondary' },
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
};

function expectTypeSummary(summary: TokenDiffSummary, type: string): TokenDiffTypeSummary {
  const entry = summary.types.find((item) => item.type === type);

  assert.ok(entry, `Expected type summary for ${type}`);

  return entry;
}

function expectGroupSummary(summary: TokenDiffSummary, group: string): TokenDiffGroupSummary {
  const entry = summary.groups.find((item) => item.group === group);

  assert.ok(entry, `Expected group summary for ${group}`);

  return entry;
}

test('diffTokenSets detects additions, renames, and modifications', () => {
  const previous = createTokenSetFromTree(baseTokens);
  const next = createTokenSetFromTree({
    color: {
      brand: {
        alias: {
          $ref: '#/color/brand/tertiary',
          $type: 'color',
        },
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.2, 0.15, 0.1],
            hex: '#332619',
          },
          $description: 'Updated primary',
          $extensions: { 'example.audit': { status: 'updated' } },
          $deprecated: true,
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

  assert.equal(diff.added.length, 1);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.changed.length, 2);
  assert.equal(diff.renamed.length, 1);
  assert.equal(diff.summary.added, 1);
  assert.equal(diff.summary.removed, 0);
  assert.equal(diff.summary.renamed, 1);
  assert.equal(diff.summary.changed, 2);
  assert.equal(diff.summary.unchanged, 0);
  assert.equal(diff.summary.breaking, 3);
  assert.equal(diff.summary.nonBreaking, 1);
  assert.equal(diff.summary.valueChanged, 2);
  assert.equal(diff.summary.metadataChanged, 0);
  assert.equal(diff.summary.recommendedBump, 'major');

  const colorSummary = expectTypeSummary(diff.summary, 'color');
  assert.equal(colorSummary.totalPrevious, previous.tokens.size);
  assert.equal(colorSummary.totalNext, next.tokens.size);
  assert.equal(colorSummary.added, 1);
  assert.equal(colorSummary.removed, 0);
  assert.equal(colorSummary.renamed, 1);
  assert.equal(colorSummary.changed, 2);
  assert.equal(colorSummary.unchanged, 0);
  assert.equal(colorSummary.breaking, 3);
  assert.equal(colorSummary.nonBreaking, 1);
  assert.equal(colorSummary.valueChanged, 2);
  assert.equal(colorSummary.metadataChanged, 0);

  const colorGroup = expectGroupSummary(diff.summary, 'color');
  assert.equal(colorGroup.totalPrevious, previous.tokens.size);
  assert.equal(colorGroup.totalNext, next.tokens.size);
  assert.equal(colorGroup.added, 1);
  assert.equal(colorGroup.removed, 0);
  assert.equal(colorGroup.renamed, 1);
  assert.equal(colorGroup.changed, 2);
  assert.equal(colorGroup.unchanged, 0);
  assert.equal(colorGroup.breaking, 3);
  assert.equal(colorGroup.nonBreaking, 1);
  assert.equal(colorGroup.valueChanged, 2);
  assert.equal(colorGroup.metadataChanged, 0);
  const brandGroup = expectGroupSummary(diff.summary, 'color/brand');
  assert.equal(brandGroup.totalPrevious, previous.tokens.size);
  assert.equal(brandGroup.totalNext, next.tokens.size);
  assert.equal(brandGroup.added, 1);
  assert.equal(brandGroup.removed, 0);
  assert.equal(brandGroup.renamed, 1);
  assert.equal(brandGroup.changed, 2);
  assert.equal(brandGroup.unchanged, 0);
  assert.equal(brandGroup.breaking, 3);
  assert.equal(brandGroup.nonBreaking, 1);

  const addition = diff.added[0];
  assert.equal(addition.id, '#/color/brand/tertiary');
  assert.deepEqual(addition.next.value, {
    colorSpace: 'srgb',
    components: [0.8, 0.85, 0.9],
    hex: '#CCD9E6',
  });
  assert.equal(addition.impact, 'non-breaking');

  const rename = diff.renamed[0];
  assert.equal(rename.previousId, '#/color/brand/secondary');
  assert.equal(rename.nextId, '#/color/brand/secondaryRenamed');
  assert.deepEqual(rename.previous.value, {
    colorSpace: 'srgb',
    components: [0.9, 0.9, 0.9],
    hex: '#E5E5E5',
  });
  assert.deepEqual(rename.next.value, {
    colorSpace: 'srgb',
    components: [0.9, 0.9, 0.9],
    hex: '#E5E5E5',
  });
  assert.equal(rename.impact, 'breaking');

  const primaryChange = diff.changed.find((entry) => entry.id === '#/color/brand/primary');
  assert.ok(primaryChange);
  assert.deepEqual(primaryChange.changes, [
    'value',
    'raw',
    'description',
    'extensions',
    'deprecated',
  ]);
  assert.deepEqual(primaryChange.previous.value, {
    colorSpace: 'srgb',
    components: [0.05, 0.1, 0.2],
    hex: '#0D1A33',
  });
  assert.deepEqual(primaryChange.next.value, {
    colorSpace: 'srgb',
    components: [0.2, 0.15, 0.1],
    hex: '#332619',
  });
  assert.equal(primaryChange.impact, 'breaking');

  const aliasChange = diff.changed.find((entry) => entry.id === '#/color/brand/alias');
  assert.ok(aliasChange);
  assert.deepEqual(aliasChange.changes, ['value', 'ref', 'references', 'resolutionPath']);
  assert.equal(aliasChange.previous.ref, '#/color/brand/primary');
  assert.equal(aliasChange.next.ref, '#/color/brand/tertiary');
  assert.equal(aliasChange.impact, 'breaking');
});

test('diffTokenSets counts metadata-only modifications separately', () => {
  const previous = createTokenSetFromTree({
    color: {
      info: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 85 / 255, 1],
          hex: '#0055FF',
        },
        $description: 'Informational blue',
        $deprecated: { $replacement: '#/color/infoNew' },
      },
      infoNew: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 85 / 255, 1],
          hex: '#0055FF',
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      info: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 85 / 255, 1],
          hex: '#0055FF',
        },
        $description: 'Updated informational blue',
        $deprecated: true,
      },
      infoNew: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 85 / 255, 1],
          hex: '#0055FF',
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);

  assert.equal(diff.changed.length, 1);
  assert.equal(diff.summary.changed, 1);
  assert.equal(diff.summary.valueChanged, 0);
  assert.equal(diff.summary.metadataChanged, 1);
  assert.equal(diff.summary.breaking, 0);
  assert.equal(diff.summary.nonBreaking, 1);

  const change = diff.changed[0];
  assert.deepEqual([...change.changes].toSorted(), ['deprecated', 'description']);
  assert.equal(change.impact, 'non-breaking');

  const typeSummary = expectTypeSummary(diff.summary, 'color');
  assert.equal(typeSummary.changed, 1);
  assert.equal(typeSummary.valueChanged, 0);
  assert.equal(typeSummary.metadataChanged, 1);
  assert.equal(typeSummary.breaking, 0);
  assert.equal(typeSummary.nonBreaking, 1);

  const groupSummary = expectGroupSummary(diff.summary, 'color');
  assert.equal(groupSummary.changed, 1);
  assert.equal(groupSummary.valueChanged, 0);
  assert.equal(groupSummary.metadataChanged, 1);
  assert.equal(groupSummary.breaking, 0);
  assert.equal(groupSummary.nonBreaking, 1);
});

test('diffTokenSets recognises renames when descriptions change', () => {
  const previous = createTokenSetFromTree({
    color: {
      accent: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.5, 0.6, 0.7],
          hex: '#8099B2',
        },
        $description: 'Accent',
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      accentNew: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.5, 0.6, 0.7],
          hex: '#8099B2',
        },
        $description: 'Accent updated',
      },
    },
  });

  const diff = diffTokenSets(previous, next);

  assert.equal(diff.renamed.length, 1);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.summary.renamed, 1);
  assert.equal(diff.summary.breaking, 1);
  assert.equal(diff.summary.nonBreaking, 0);
  assert.equal(diff.summary.valueChanged, 0);
  assert.equal(diff.summary.metadataChanged, 0);
  assert.equal(diff.summary.recommendedBump, 'major');

  const colorSummary = expectTypeSummary(diff.summary, 'color');
  assert.equal(colorSummary.totalPrevious, previous.tokens.size);
  assert.equal(colorSummary.totalNext, next.tokens.size);
  assert.equal(colorSummary.added, 0);
  assert.equal(colorSummary.removed, 0);
  assert.equal(colorSummary.renamed, 1);
  assert.equal(colorSummary.changed, 0);
  assert.equal(colorSummary.unchanged, 0);
  assert.equal(colorSummary.breaking, 1);
  assert.equal(colorSummary.nonBreaking, 0);
  assert.equal(colorSummary.valueChanged, 0);
  assert.equal(colorSummary.metadataChanged, 0);

  const colorGroup = expectGroupSummary(diff.summary, 'color');
  assert.equal(colorGroup.totalPrevious, previous.tokens.size);
  assert.equal(colorGroup.totalNext, next.tokens.size);
  assert.equal(colorGroup.added, 0);
  assert.equal(colorGroup.removed, 0);
  assert.equal(colorGroup.renamed, 1);
  assert.equal(colorGroup.changed, 0);
  assert.equal(colorGroup.unchanged, 0);
  assert.equal(colorGroup.breaking, 1);
  assert.equal(colorGroup.nonBreaking, 0);
  assert.equal(colorGroup.valueChanged, 0);
  assert.equal(colorGroup.metadataChanged, 0);

  const rename = diff.renamed[0];
  assert.equal(rename.previousId, '#/color/accent');
  assert.equal(rename.nextId, '#/color/accentNew');
  assert.equal(rename.impact, 'breaking');
});

test('diffTokenSets reports no changes for identical sets', () => {
  const previous = createTokenSetFromTree(baseTokens);
  const next = createTokenSetFromTree(baseTokens);

  const diff = diffTokenSets(previous, next);

  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.changed.length, 0);
  assert.equal(diff.summary.unchanged, previous.tokens.size);
  assert.equal(diff.summary.breaking, 0);
  assert.equal(diff.summary.nonBreaking, 0);
  assert.equal(diff.summary.valueChanged, 0);
  assert.equal(diff.summary.metadataChanged, 0);
  assert.equal(diff.summary.recommendedBump, 'none');

  const colorSummary = expectTypeSummary(diff.summary, 'color');
  assert.equal(colorSummary.totalPrevious, previous.tokens.size);
  assert.equal(colorSummary.totalNext, next.tokens.size);
  assert.equal(colorSummary.added, 0);
  assert.equal(colorSummary.removed, 0);
  assert.equal(colorSummary.renamed, 0);
  assert.equal(colorSummary.changed, 0);
  assert.equal(colorSummary.unchanged, previous.tokens.size);
  assert.equal(colorSummary.breaking, 0);
  assert.equal(colorSummary.nonBreaking, 0);
  assert.equal(colorSummary.valueChanged, 0);
  assert.equal(colorSummary.metadataChanged, 0);

  const colorGroup = expectGroupSummary(diff.summary, 'color');
  assert.equal(colorGroup.totalPrevious, previous.tokens.size);
  assert.equal(colorGroup.totalNext, next.tokens.size);
  assert.equal(colorGroup.added, 0);
  assert.equal(colorGroup.removed, 0);
  assert.equal(colorGroup.renamed, 0);
  assert.equal(colorGroup.changed, 0);
  assert.equal(colorGroup.unchanged, previous.tokens.size);
  assert.equal(colorGroup.breaking, 0);
  assert.equal(colorGroup.nonBreaking, 0);
  assert.equal(colorGroup.valueChanged, 0);
  assert.equal(colorGroup.metadataChanged, 0);
});

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  diffTokenSets,
  filterTokenDiff,
  type TokenDiffSummary,
  type TokenDiffTypeSummary,
  type TokenDiffGroupSummary,
} from '../../src/diff.js';
import { createTokenSetFromTree } from '../../src/token-set.js';

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

test('filterTokenDiff filters changes by token type', () => {
  const previous = createTokenSetFromTree({
    color: {
      accent: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 1, 0],
        },
      },
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.1, 0.2, 0.3],
          hex: '#1A334D',
        },
      },
    },
    size: {
      small: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 4,
          unit: 'px',
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      accentRenamed: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 1, 0],
        },
      },
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.15, 0.25, 0.35],
          hex: '#263F59',
        },
      },
      tertiary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.2, 0.2, 0.2],
          hex: '#333333',
        },
      },
    },
    size: {
      large: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 16,
          unit: 'px',
        },
      },
      small: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 8,
          unit: 'px',
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const filtered = filterTokenDiff(diff, previous, next, { types: ['Color'] });

  assert.equal(filtered.added.length, 1);
  assert.equal(filtered.added[0]?.id, '#/color/tertiary');

  assert.equal(filtered.removed.length, 0);

  assert.equal(filtered.changed.length, 1);
  assert.equal(filtered.changed[0]?.id, '#/color/primary');

  assert.equal(filtered.renamed.length, 1);
  assert.equal(filtered.renamed[0]?.previousId, '#/color/accent');
  assert.equal(filtered.renamed[0]?.nextId, '#/color/accentRenamed');

  assert.equal(filtered.summary.totalPrevious, 2);
  assert.equal(filtered.summary.totalNext, 3);
  assert.equal(filtered.summary.added, 1);
  assert.equal(filtered.summary.removed, 0);
  assert.equal(filtered.summary.changed, 1);
  assert.equal(filtered.summary.renamed, 1);
  assert.equal(filtered.summary.unchanged, 0);
  assert.equal(filtered.summary.breaking, 2);
  assert.equal(filtered.summary.nonBreaking, 1);
  assert.equal(filtered.summary.valueChanged, 1);
  assert.equal(filtered.summary.metadataChanged, 0);
  assert.equal(filtered.summary.valueChanged, 1);
  assert.equal(filtered.summary.metadataChanged, 0);
  assert.equal(filtered.summary.recommendedBump, 'major');

  const colorSummary = expectTypeSummary(filtered.summary, 'color');
  assert.equal(colorSummary.totalPrevious, 2);
  assert.equal(colorSummary.totalNext, 3);
  assert.equal(colorSummary.added, 1);
  assert.equal(colorSummary.removed, 0);
  assert.equal(colorSummary.renamed, 1);
  assert.equal(colorSummary.changed, 1);
  assert.equal(colorSummary.unchanged, 0);
  assert.equal(colorSummary.breaking, 2);
  assert.equal(colorSummary.nonBreaking, 1);
  assert.equal(colorSummary.valueChanged, 1);
  assert.equal(colorSummary.metadataChanged, 0);

  const colorGroup = expectGroupSummary(filtered.summary, 'color');
  assert.equal(colorGroup.totalPrevious, 2);
  assert.equal(colorGroup.totalNext, 3);
  assert.equal(colorGroup.added, 1);
  assert.equal(colorGroup.removed, 0);
  assert.equal(colorGroup.renamed, 1);
  assert.equal(colorGroup.changed, 1);
  assert.equal(colorGroup.unchanged, 0);
  assert.equal(colorGroup.breaking, 2);
  assert.equal(colorGroup.nonBreaking, 1);
  assert.equal(colorGroup.valueChanged, 1);
  assert.equal(colorGroup.metadataChanged, 0);
});

test('filterTokenDiff filters changes by top-level group', () => {
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
    spacing: {
      medium: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 12,
          unit: 'px',
        },
      },
      small: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 4,
          unit: 'px',
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
            components: [0.1, 0.1, 0.1],
            hex: '#1A1A1A',
          },
        },
      },
    },
    spacing: {
      large: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 24,
          unit: 'px',
        },
      },
      md: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 12,
          unit: 'px',
        },
      },
      small: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 8,
          unit: 'px',
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const filtered = filterTokenDiff(diff, previous, next, {
    groups: ['spacing'],
  });

  assert.equal(filtered.added.length, 1);
  assert.equal(filtered.added[0]?.id, '#/spacing/large');

  assert.equal(filtered.removed.length, 0);

  assert.equal(filtered.changed.length, 1);
  assert.equal(filtered.changed[0]?.id, '#/spacing/small');

  assert.equal(filtered.renamed.length, 1);
  assert.equal(filtered.renamed[0]?.previousId, '#/spacing/medium');
  assert.equal(filtered.renamed[0]?.nextId, '#/spacing/md');

  assert.equal(filtered.summary.totalPrevious, 2);
  assert.equal(filtered.summary.totalNext, 3);
  assert.equal(filtered.summary.added, 1);
  assert.equal(filtered.summary.removed, 0);
  assert.equal(filtered.summary.changed, 1);
  assert.equal(filtered.summary.renamed, 1);
  assert.equal(filtered.summary.unchanged, 0);
  assert.equal(filtered.summary.breaking, 2);
  assert.equal(filtered.summary.nonBreaking, 1);

  const dimensionSummary = expectTypeSummary(filtered.summary, 'dimension');
  assert.equal(dimensionSummary.totalPrevious, 2);
  assert.equal(dimensionSummary.totalNext, 3);
  assert.equal(dimensionSummary.added, 1);
  assert.equal(dimensionSummary.removed, 0);
  assert.equal(dimensionSummary.renamed, 1);
  assert.equal(dimensionSummary.changed, 1);
  assert.equal(dimensionSummary.unchanged, 0);
  assert.equal(dimensionSummary.breaking, 2);
  assert.equal(dimensionSummary.nonBreaking, 1);
  assert.equal(dimensionSummary.valueChanged, 1);
  assert.equal(dimensionSummary.metadataChanged, 0);

  const spacingGroup = expectGroupSummary(filtered.summary, 'spacing');
  assert.equal(spacingGroup.totalPrevious, 2);
  assert.equal(spacingGroup.totalNext, 3);
  assert.equal(spacingGroup.added, 1);
  assert.equal(spacingGroup.removed, 0);
  assert.equal(spacingGroup.renamed, 1);
  assert.equal(spacingGroup.changed, 1);
  assert.equal(spacingGroup.unchanged, 0);
  assert.equal(spacingGroup.breaking, 2);
  assert.equal(spacingGroup.nonBreaking, 1);
  assert.equal(spacingGroup.valueChanged, 1);
  assert.equal(spacingGroup.metadataChanged, 0);
});

test('filterTokenDiff filters changes by nested group path', () => {
  const previous = createTokenSetFromTree(scopedPreviousTokens);
  const next = createTokenSetFromTree(scopedNextTokens);

  const diff = diffTokenSets(previous, next);
  const filtered = filterTokenDiff(diff, previous, next, {
    groups: ['  Color / Brand  '],
  });

  assert.equal(filtered.added.length, 1);
  assert.equal(filtered.added[0]?.id, '#/color/brand/accent');

  assert.equal(filtered.removed.length, 0);

  assert.equal(filtered.changed.length, 1);
  assert.equal(filtered.changed[0]?.id, '#/color/brand/primary');

  assert.equal(filtered.renamed.length, 1);
  assert.equal(filtered.renamed[0]?.previousId, '#/color/brand/secondary');
  assert.equal(filtered.renamed[0]?.nextId, '#/color/neutrals/secondary');

  assert.equal(filtered.summary.totalPrevious, 3);
  assert.equal(filtered.summary.totalNext, 3);
  assert.equal(filtered.summary.added, 1);
  assert.equal(filtered.summary.removed, 0);
  assert.equal(filtered.summary.changed, 1);
  assert.equal(filtered.summary.renamed, 1);
  assert.equal(filtered.summary.unchanged, 1);
  assert.equal(filtered.summary.breaking, 2);
  assert.equal(filtered.summary.nonBreaking, 1);
  assert.equal(filtered.summary.valueChanged, 1);
  assert.equal(filtered.summary.metadataChanged, 0);

  const colorSummary = expectTypeSummary(filtered.summary, 'color');
  assert.equal(colorSummary.totalPrevious, 3);
  assert.equal(colorSummary.totalNext, 3);
  assert.equal(colorSummary.added, 1);
  assert.equal(colorSummary.removed, 0);
  assert.equal(colorSummary.renamed, 1);
  assert.equal(colorSummary.changed, 1);
  assert.equal(colorSummary.unchanged, 1);
  assert.equal(colorSummary.breaking, 2);
  assert.equal(colorSummary.nonBreaking, 1);
  assert.equal(colorSummary.valueChanged, 1);
  assert.equal(colorSummary.metadataChanged, 0);

  const colorGroup = expectGroupSummary(filtered.summary, 'color');
  assert.equal(colorGroup.totalPrevious, 3);
  assert.equal(colorGroup.totalNext, 3);
  assert.equal(colorGroup.added, 1);
  assert.equal(colorGroup.removed, 0);
  assert.equal(colorGroup.renamed, 1);
  assert.equal(colorGroup.changed, 1);
  assert.equal(colorGroup.unchanged, 1);
  assert.equal(colorGroup.breaking, 2);
  assert.equal(colorGroup.nonBreaking, 1);
  assert.equal(colorGroup.valueChanged, 1);
  assert.equal(colorGroup.metadataChanged, 0);

  const brandGroup = expectGroupSummary(filtered.summary, 'color/brand');
  assert.equal(brandGroup.totalPrevious, 3);
  assert.equal(brandGroup.totalNext, 3);
  assert.equal(brandGroup.added, 1);
  assert.equal(brandGroup.removed, 0);
  assert.equal(brandGroup.renamed, 1);
  assert.equal(brandGroup.changed, 1);
  assert.equal(brandGroup.unchanged, 1);
  assert.equal(brandGroup.breaking, 2);
  assert.equal(brandGroup.nonBreaking, 1);
  assert.equal(brandGroup.valueChanged, 1);
  assert.equal(brandGroup.metadataChanged, 0);

  const neutralsGroup = expectGroupSummary(filtered.summary, 'color/neutrals');
  assert.equal(neutralsGroup.totalPrevious, 0);
  assert.equal(neutralsGroup.totalNext, 0);
  assert.equal(neutralsGroup.added, 0);
  assert.equal(neutralsGroup.removed, 0);
  assert.equal(neutralsGroup.renamed, 1);
  assert.equal(neutralsGroup.changed, 0);
  assert.equal(neutralsGroup.unchanged, 0);
  assert.equal(neutralsGroup.breaking, 1);
  assert.equal(neutralsGroup.nonBreaking, 0);
});

const scopedPreviousTokens = {
  color: {
    brand: {
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.05, 0.1, 0.2],
          hex: '#0D1A33',
        },
      },
      secondary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.5, 0.5, 0.5],
          hex: '#808080',
        },
      },
      tertiary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.3, 0.3, 0.3],
          hex: '#4D4D4D',
        },
      },
    },
    neutrals: {
      base: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [1, 1, 1],
          hex: '#FFFFFF',
        },
      },
    },
  },
} as const;

const scopedNextTokens = {
  color: {
    brand: {
      accent: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [1, 0.8, 0],
        },
      },
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.1, 0.1, 0.1],
          hex: '#1A1A1A',
        },
      },
      tertiary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.3, 0.3, 0.3],
          hex: '#4D4D4D',
        },
      },
    },
    neutrals: {
      base: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [1, 1, 1],
          hex: '#FFFFFF',
        },
      },
      secondary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.5, 0.5, 0.5],
          hex: '#808080',
        },
      },
    },
  },
} as const;

const impactPreviousTokens = {
  color: {
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
        components: [1, 1, 1],
        hex: '#FFFFFF',
      },
      $description: 'Secondary brand color',
    },
    tertiary: {
      $type: 'color',
      $value: {
        colorSpace: 'srgb',
        components: [0.94, 0.94, 0.94],
        hex: '#F0F0F0',
      },
    },
  },
  size: {
    small: {
      $type: 'dimension',
      $value: {
        dimensionType: 'length',
        value: 8,
        unit: 'px',
      },
    },
  },
} as const;

const impactNextTokens = {
  color: {
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
        components: [0.1, 0.1, 0.1],
        hex: '#1A1A1A',
      },
    },
    secondary: {
      $type: 'color',
      $value: {
        colorSpace: 'srgb',
        components: [1, 1, 1],
        hex: '#FFFFFF',
      },
      $description: 'Updated secondary color',
    },
  },
  size: {
    medium: {
      $type: 'dimension',
      $value: {
        dimensionType: 'length',
        value: 8,
        unit: 'px',
      },
    },
  },
} as const;

test('filterTokenDiff filters by pointer prefix', () => {
  const previous = createTokenSetFromTree(scopedPreviousTokens);
  const next = createTokenSetFromTree(scopedNextTokens);

  const diff = diffTokenSets(previous, next);
  const filtered = filterTokenDiff(diff, previous, next, {
    paths: ['color/brand'],
  });

  assert.equal(filtered.added.length, 1);
  assert.equal(filtered.added[0]?.id, '#/color/brand/accent');

  assert.equal(filtered.changed.length, 1);
  assert.equal(filtered.changed[0]?.id, '#/color/brand/primary');

  assert.equal(filtered.renamed.length, 1);
  assert.equal(filtered.renamed[0]?.previousId, '#/color/brand/secondary');
  assert.equal(filtered.renamed[0]?.nextId, '#/color/neutrals/secondary');

  assert.equal(filtered.summary.totalPrevious, 3);
  assert.equal(filtered.summary.totalNext, 3);
  assert.equal(filtered.summary.added, 1);
  assert.equal(filtered.summary.changed, 1);
  assert.equal(filtered.summary.renamed, 1);
  assert.equal(filtered.summary.removed, 0);
  assert.equal(filtered.summary.unchanged, 1);
  assert.equal(filtered.summary.breaking, 2);
  assert.equal(filtered.summary.nonBreaking, 1);

  const colorSummary = expectTypeSummary(filtered.summary, 'color');
  assert.equal(colorSummary.totalPrevious, 3);
  assert.equal(colorSummary.totalNext, 3);
  assert.equal(colorSummary.added, 1);
  assert.equal(colorSummary.removed, 0);
  assert.equal(colorSummary.renamed, 1);
  assert.equal(colorSummary.changed, 1);
  assert.equal(colorSummary.unchanged, 1);
  assert.equal(colorSummary.breaking, 2);
  assert.equal(colorSummary.nonBreaking, 1);
});

test('filterTokenDiff includes renames when destination matches the filter', () => {
  const previous = createTokenSetFromTree(scopedPreviousTokens);
  const next = createTokenSetFromTree(scopedNextTokens);

  const diff = diffTokenSets(previous, next);
  const filtered = filterTokenDiff(diff, previous, next, {
    paths: ['#/color/neutrals/'],
  });

  assert.equal(filtered.renamed.length, 1);
  assert.equal(filtered.renamed[0]?.previousId, '#/color/brand/secondary');
  assert.equal(filtered.renamed[0]?.nextId, '#/color/neutrals/secondary');

  assert.equal(filtered.summary.totalPrevious, 1);
  assert.equal(filtered.summary.totalNext, 2);
  assert.equal(filtered.summary.unchanged, 1);
  assert.equal(filtered.summary.added, 0);
  assert.equal(filtered.summary.removed, 0);
  assert.equal(filtered.summary.changed, 0);
  assert.equal(filtered.summary.breaking, 1);
  assert.equal(filtered.summary.nonBreaking, 0);

  const colorSummary = expectTypeSummary(filtered.summary, 'color');
  assert.equal(colorSummary.totalPrevious, 1);
  assert.equal(colorSummary.totalNext, 2);
  assert.equal(colorSummary.added, 0);
  assert.equal(colorSummary.removed, 0);
  assert.equal(colorSummary.renamed, 1);
  assert.equal(colorSummary.changed, 0);
  assert.equal(colorSummary.unchanged, 1);
  assert.equal(colorSummary.breaking, 1);
  assert.equal(colorSummary.nonBreaking, 0);
});

test('filterTokenDiff filters breaking-impact changes', () => {
  const previous = createTokenSetFromTree(impactPreviousTokens);
  const next = createTokenSetFromTree(impactNextTokens);

  const diff = diffTokenSets(previous, next);
  const breaking = filterTokenDiff(diff, previous, next, {
    impacts: ['breaking'],
  });

  assert.equal(breaking.added.length, 0);
  assert.equal(breaking.removed.length, 1);
  assert.equal(breaking.removed[0]?.id, '#/color/tertiary');
  assert.equal(breaking.renamed.length, 1);
  assert.equal(breaking.renamed[0]?.previousId, '#/size/small');
  assert.equal(breaking.renamed[0]?.nextId, '#/size/medium');
  assert.equal(breaking.changed.length, 1);
  assert.equal(breaking.changed[0]?.id, '#/color/primary');

  assert.equal(breaking.summary.totalPrevious, 3);
  assert.equal(breaking.summary.totalNext, 2);
  assert.equal(breaking.summary.added, 0);
  assert.equal(breaking.summary.removed, 1);
  assert.equal(breaking.summary.renamed, 1);
  assert.equal(breaking.summary.changed, 1);
  assert.equal(breaking.summary.unchanged, 0);
  assert.equal(breaking.summary.breaking, 3);
  assert.equal(breaking.summary.nonBreaking, 0);

  const breakingColor = expectTypeSummary(breaking.summary, 'color');
  assert.equal(breakingColor.totalPrevious, 2);
  assert.equal(breakingColor.totalNext, 1);
  assert.equal(breakingColor.added, 0);
  assert.equal(breakingColor.removed, 1);
  assert.equal(breakingColor.renamed, 0);
  assert.equal(breakingColor.changed, 1);
  assert.equal(breakingColor.unchanged, 0);
  assert.equal(breakingColor.breaking, 2);
  assert.equal(breakingColor.nonBreaking, 0);

  const breakingDimension = expectTypeSummary(breaking.summary, 'dimension');
  assert.equal(breakingDimension.totalPrevious, 1);
  assert.equal(breakingDimension.totalNext, 1);
  assert.equal(breakingDimension.added, 0);
  assert.equal(breakingDimension.removed, 0);
  assert.equal(breakingDimension.renamed, 1);
  assert.equal(breakingDimension.changed, 0);
  assert.equal(breakingDimension.unchanged, 0);
  assert.equal(breakingDimension.breaking, 1);
  assert.equal(breakingDimension.nonBreaking, 0);
});

test('filterTokenDiff filters non-breaking changes', () => {
  const previous = createTokenSetFromTree(impactPreviousTokens);
  const next = createTokenSetFromTree(impactNextTokens);

  const diff = diffTokenSets(previous, next);
  const nonBreaking = filterTokenDiff(diff, previous, next, {
    impacts: ['non-breaking'],
  });

  assert.equal(nonBreaking.added.length, 1);
  assert.equal(nonBreaking.added[0]?.id, '#/color/accent');
  assert.equal(nonBreaking.removed.length, 0);
  assert.equal(nonBreaking.renamed.length, 0);
  assert.equal(nonBreaking.changed.length, 1);
  assert.equal(nonBreaking.changed[0]?.id, '#/color/secondary');

  assert.equal(nonBreaking.summary.totalPrevious, 1);
  assert.equal(nonBreaking.summary.totalNext, 2);
  assert.equal(nonBreaking.summary.added, 1);
  assert.equal(nonBreaking.summary.removed, 0);
  assert.equal(nonBreaking.summary.renamed, 0);
  assert.equal(nonBreaking.summary.changed, 1);
  assert.equal(nonBreaking.summary.unchanged, 0);
  assert.equal(nonBreaking.summary.breaking, 0);
  assert.equal(nonBreaking.summary.nonBreaking, 2);
  assert.equal(nonBreaking.summary.recommendedBump, 'minor');

  const nonBreakingColor = expectTypeSummary(nonBreaking.summary, 'color');
  assert.equal(nonBreakingColor.totalPrevious, 1);
  assert.equal(nonBreakingColor.totalNext, 2);
  assert.equal(nonBreakingColor.added, 1);
  assert.equal(nonBreakingColor.removed, 0);
  assert.equal(nonBreakingColor.renamed, 0);
  assert.equal(nonBreakingColor.changed, 1);
  assert.equal(nonBreakingColor.unchanged, 0);
  assert.equal(nonBreakingColor.breaking, 0);
  assert.equal(nonBreakingColor.nonBreaking, 2);
});

test('filterTokenDiff accepts the singular impact alias', () => {
  const previous = createTokenSetFromTree(impactPreviousTokens);
  const next = createTokenSetFromTree(impactNextTokens);

  const diff = diffTokenSets(previous, next);
  const breakingOnly = filterTokenDiff(diff, previous, next, {
    impact: 'breaking',
  });

  assert.equal(breakingOnly.summary.breaking, 3);
  assert.equal(breakingOnly.summary.nonBreaking, 0);

  const nonBreakingOnly = filterTokenDiff(diff, previous, next, {
    impact: ['non-breaking'],
  });

  assert.equal(nonBreakingOnly.summary.breaking, 0);
  assert.equal(nonBreakingOnly.summary.nonBreaking, 2);
  assert.equal(nonBreakingOnly.summary.recommendedBump, 'minor');
});

test('filterTokenDiff filters changes by change kind', () => {
  const previous = createTokenSetFromTree({
    color: {
      accent: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [1, 204 / 255, 0],
          hex: '#FFCC00',
        },
      },
      alias: {
        $type: 'color',
        $ref: '#/color/accent',
      },
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 0, 0],
          hex: '#000000',
        },
      },
    },
    spacing: {
      small: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 4,
          unit: 'px',
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      accent: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [1, 204 / 255, 0],
          hex: '#FFCC00',
        },
      },
      aliasRenamed: {
        $type: 'color',
        $ref: '#/color/accent',
      },
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [17 / 255, 17 / 255, 17 / 255],
          hex: '#111111',
        },
      },
      tertiary: {
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

  const additions = filterTokenDiff(diff, previous, next, { kinds: ['added'] });

  assert.equal(additions.added.length, 1);
  assert.equal(additions.added[0]?.id, '#/color/tertiary');
  assert.equal(additions.removed.length, 0);
  assert.equal(additions.renamed.length, 0);
  assert.equal(additions.changed.length, 0);
  assert.equal(additions.summary.totalPrevious, 0);
  assert.equal(additions.summary.totalNext, 1);
  assert.equal(additions.summary.added, 1);
  assert.equal(additions.summary.breaking, 0);
  assert.equal(additions.summary.nonBreaking, 1);

  const renames = filterTokenDiff(diff, previous, next, { kind: 'renamed' });

  assert.equal(renames.added.length, 0);
  assert.equal(renames.removed.length, 0);
  assert.equal(renames.changed.length, 0);
  assert.equal(renames.renamed.length, 1);
  assert.equal(renames.renamed[0]?.previousId, '#/color/alias');
  assert.equal(renames.renamed[0]?.nextId, '#/color/aliasRenamed');
  assert.equal(renames.summary.totalPrevious, 1);
  assert.equal(renames.summary.totalNext, 1);
  assert.equal(renames.summary.renamed, 1);
  assert.equal(renames.summary.breaking, 1);
  assert.equal(renames.summary.nonBreaking, 0);

  const modifications = filterTokenDiff(diff, previous, next, {
    kinds: ['changed', 'removed'],
  });

  assert.equal(modifications.added.length, 0);
  assert.equal(modifications.removed.length, 1);
  assert.equal(modifications.removed[0]?.id, '#/spacing/small');
  assert.equal(modifications.changed.length, 1);
  assert.equal(modifications.changed[0]?.id, '#/color/primary');
  assert.equal(modifications.renamed.length, 0);
  assert.equal(modifications.summary.totalPrevious, 2);
  assert.equal(modifications.summary.totalNext, 1);
  assert.equal(modifications.summary.removed, 1);
  assert.equal(modifications.summary.changed, 1);
  assert.equal(modifications.summary.added, 0);
  assert.equal(modifications.summary.renamed, 0);
  assert.equal(modifications.summary.unchanged, 0);
  assert.equal(modifications.summary.breaking, 2);
  assert.equal(modifications.summary.nonBreaking, 0);
});

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { diffTokenSets } from '../../src/diff.js';
import { formatDiffAsHtml } from '../../src/reporting/renderers/html.js';
import {
  createTokenSetFromTree,
  type TokenPointer,
  type TokenSnapshot,
} from '../../src/token-set.js';
import type {
  TokenDiffGroupSummary,
  TokenDiffResult,
  TokenDiffSummary,
  TokenDiffTypeSummary,
  TokenModification,
} from '../../src/diff.js';

test('formatDiffAsHtml renders a complete document with sections', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
          },
          $type: 'color',
        },
      },
    },
    size: {
      small: {
        $value: {
          dimensionType: 'length',
          value: 4,
          unit: 'px',
        },
        $type: 'dimension',
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $value: {
            colorSpace: 'srgb',
            components: [0.13, 0.13, 0.13],
          },
          $type: 'color',
        },
        secondary: {
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
          $type: 'color',
        },
      },
    },
    size: {
      small: {
        $value: {
          dimensionType: 'length',
          value: 8,
          unit: 'px',
        },
        $type: 'dimension',
      },
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
  const output = formatDiffAsHtml(diff, {
    runContext: {
      previous: 'previous.json',
      next: 'next.json',
      startedAt: '2024-03-01T09:15:00Z',
      durationMs: 1234,
    },
  });

  assert.match(output, /<!doctype html>/i);
  assert.match(output, /<html lang="en">/);
  assert.match(output, /Comparing previous\.json → next\.json \(2 tokens → 4 tokens\)\.<\/p>/);
  assert.match(output, /Started 2024-03-01 09:15 UTC\.<\/p>/);
  assert.match(output, /Duration 1\.2s\.<\/p>/);
  assert.match(output, /<h2>Executive summary<\/h2>/);
  assert.match(
    output,
    /<strong class="dtifx-diff__summary-value">2<\/strong>\s*<span class="dtifx-diff__summary-label">Added<\/span>/,
  );
  assert.match(
    output,
    /<strong class="dtifx-diff__summary-value">2<\/strong>\s*<span class="dtifx-diff__summary-label">Breaking<\/span>/,
  );
  assert.match(
    output,
    /<strong class="dtifx-diff__summary-value">2<\/strong>\s*<span class="dtifx-diff__summary-label">Non-breaking<\/span>/,
  );
  assert.match(
    output,
    /<strong class="dtifx-diff__summary-value">2<\/strong>\s*<span class="dtifx-diff__summary-label">Value changes<\/span>/,
  );
  assert.match(
    output,
    /<strong class="dtifx-diff__summary-value">0<\/strong>\s*<span class="dtifx-diff__summary-label">Metadata changes<\/span>/,
  );
  assert.match(
    output,
    /<strong class="dtifx-diff__summary-value">Major<\/strong>\s*<span class="dtifx-diff__summary-label">Recommended bump<\/span>/,
  );
  assert.match(output, /<div class="dtifx-diff__summary-meta">[\s\S]*Impact:[\s\S]*Changes:/);
  assert.match(output, /<h3>Type breakdown<\/h3>/);
  assert.match(output, /<th scope="col">Value changes<\/th>/);
  assert.match(output, /<th scope="col">Metadata changes<\/th>/);
  assert.match(
    output,
    /<th scope="row">color<\/th>[\s\S]*?<td>1<\/td>[\s\S]*?<td>2<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>1<\/td>/,
  );
  assert.match(
    output,
    /<th scope="row">dimension<\/th>[\s\S]*?<td>1<\/td>[\s\S]*?<td>2<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>1<\/td>/,
  );
  assert.match(output, /<h3>Group breakdown<\/h3>/);
  assert.match(
    output,
    /Diff by token group[\s\S]*<th scope="row">color<\/th>[\s\S]*?<td>1<\/td>[\s\S]*?<td>2<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>1<\/td>/,
  );
  assert.match(
    output,
    /Diff by token group[\s\S]*<th scope="row">size<\/th>[\s\S]*?<td>1<\/td>[\s\S]*?<td>2<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>0<\/td>[\s\S]*?<td>1<\/td>[\s\S]*?<td>1<\/td>/,
  );
  assert.match(output, /<section id="top-risks"[\s\S]*dtifx-diff__risk-list/);
  assert.match(output, /<section id="type-color"[\s\S]*dtifx-diff__type-operation--changed/);
  assert.match(
    output,
    /<div class="dtifx-diff__group"[^>]*data-group="color-brand"[\s\S]*dtifx-diff__group-body[\s\S]*dtifx-diff__type-operation--changed/,
  );
  assert.match(output, /<section id="type-dimension"[\s\S]*dtifx-diff__type-operation--changed/);
  assert.match(output, /dtifx-diff__type-operation--added/);
  assert.match(
    output,
    /<li class="dtifx-diff__list-item dtifx-diff__list-item--added">[\s\S]*<div class="dtifx-diff__item-row"><code>#\/color\/brand\/secondary<\/code> = <code>{ colorSpace: &#39;srgb&#39;, components: \[ 1, 1, 1 ] }<\/code>[\s\S]*dtifx-diff__chip[\s\S]*dtifx-diff__impact--non-breaking/,
  );
  assert.match(
    output,
    /dtifx-diff__list-item--added[\s\S]*<div class="dtifx-diff__guidance">[\s\S]*dtifx-diff__guidance-line--impact"><strong>Impact:<\/strong> Non-breaking addition: publicise availability to adopters\.<\/p>/,
  );
  assert.match(
    output,
    /dtifx-diff__list-item--added[\s\S]*dtifx-diff__guidance-line--next"><strong>Next:<\/strong> Plan adoption for #\/color\/brand\/secondary across consuming teams\.<\/p>/,
  );
  assert.match(
    output,
    /<article class="dtifx-diff__change">[\s\S]*<h4><code>#\/color\/brand\/primary<\/code> <span class="dtifx-diff__impact dtifx-diff__impact--breaking">Breaking<\/span><\/h4>/,
  );
  assert.match(
    output,
    /<article class="dtifx-diff__change">[\s\S]*<p class="dtifx-diff__guidance-title">Value updated<\/p>/,
  );
  assert.match(
    output,
    /dtifx-diff__guidance-line--impact"><strong>Impact:<\/strong> Breaking update: dependent experiences may regress\.<\/p>/,
  );
  assert.match(
    output,
    /dtifx-diff__guidance-line--next"><strong>Next:<\/strong> Coordinate updates for #\/color\/brand\/primary before release\.<\/p>/,
  );
  assert.match(
    output,
    /<div class="dtifx-diff__comparison dtifx-diff__comparison--value">[\s\S]*dtifx-diff__value--previous[\s\S]*dtifx-diff__value--next/,
  );
  assert.match(output, /Swatch:<\/span> [\s\S]*dtifx-diff__chip/);
  assert.match(
    output,
    /<div class="dtifx-diff__dimension-row">[\s\S]*Dimension:[\s\S]*dtifx-diff__dimension-meter--previous[\s\S]*dtifx-diff__dimension-meter--next[\s\S]*<span class="dtifx-diff__dimension-delta">\+4px \(\+100%\)<\/span>/,
  );
});

test('formatDiffAsHtml can emit the summary section only', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
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
            components: [0.2, 0.2, 0.2],
          },
          $type: 'color',
        },
        secondary: {
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
          $type: 'color',
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsHtml(diff, { mode: 'summary' });

  assert.match(output, /<h2>Executive summary<\/h2>/);
  assert.match(output, /<h3>Type breakdown<\/h3>/);
  assert.match(output, /<h3>Group breakdown<\/h3>/);
  assert.doesNotMatch(output, /<section id="top-risks"/);
  assert.doesNotMatch(output, /<section class="dtifx-diff__type-operation/);
});

test('formatDiffAsHtml renders rename and metadata changes with escaping', () => {
  const previous = createTokenSetFromTree({
    color: {
      accent: {
        $value: {
          colorSpace: 'srgb',
          components: [0.67, 0.8, 0.94],
        },
        $type: 'color',
      },
      alias: {
        $type: 'color',
        $ref: '#/color/accent',
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      accentRenamed: {
        $value: {
          colorSpace: 'srgb',
          components: [0.67, 0.8, 0.94],
        },
        $type: 'color',
      },
      alias: {
        $type: 'color',
        $ref: '#/color/accentRenamed',
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsHtml(diff);

  assert.match(output, /dtifx-diff__type-operation--renamed/);
  assert.match(output, /<code>#\/color\/accent<\/code> → <code>#\/color\/accentRenamed<\/code>/);
  assert.match(output, /dtifx-diff__impact--breaking/);
  assert.match(output, /dtifx-diff__chip/);
  assert.match(output, /dtifx-diff__field--ref/);
  assert.match(
    output,
    /<code class="dtifx-diff__code">&quot;#\/color\/accent&quot;<\/code>[\s\S]*<code class="dtifx-diff__code">&quot;#\/color\/accentRenamed&quot;<\/code>/,
  );
  assert.match(output, /dtifx-diff__field--references/);
  assert.match(output, /dtifx-diff__field--resolutionPath/);
});

test('formatDiffAsHtml reveals why text when requested', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [0, 0, 0] },
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [17 / 255, 17 / 255, 17 / 255] },
        },
        secondary: {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [1, 1, 1] },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const defaultHtml = formatDiffAsHtml(diff);
  const whyHtml = formatDiffAsHtml(diff, { showWhy: true });

  assert.equal(defaultHtml.includes('<p class="dtifx-diff__risk-why">'), false);
  assert.equal(whyHtml.includes('<p class="dtifx-diff__risk-why">'), true);
});

test('formatDiffAsHtml limits pointer lists by default', () => {
  const previous = createTokenSetFromTree({
    color: {
      base: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0] } },
      aliasA: { $type: 'color', $ref: '#/color/base' },
      aliasB: { $type: 'color', $ref: '#/color/aliasA' },
      aliasC: { $type: 'color', $ref: '#/color/aliasB' },
      aliasD: { $type: 'color', $ref: '#/color/aliasC' },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      base: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0] } },
      aliasA: { $type: 'color', $ref: '#/color/base' },
      aliasB: { $type: 'color', $ref: '#/color/aliasA' },
      aliasC: { $type: 'color', $ref: '#/color/aliasB' },
      aliasD: { $type: 'color', $ref: '#/color/aliasA' },
    },
  });

  const diff = diffTokenSets(previous, next);
  const html = formatDiffAsHtml(diff);

  assert.match(html, /\(\+2 more\)/);
  assert.match(html, /\(\+1 more\)/);
});

test('formatDiffAsHtml condensed mode suppresses risks and trims pointer context', () => {
  const diff = createManualDiff();
  const full = formatDiffAsHtml(diff, { diffContext: 3 });
  const condensed = formatDiffAsHtml(diff, { diffContext: 3, mode: 'condensed' });

  assert.match(full, /<section id="top-risks"/);
  assert.doesNotMatch(condensed, /<section id="top-risks"/);
  assert.match(full, /#\/components\/button\/icon/);
  assert.doesNotMatch(condensed, /#\/components\/button\/icon/);
  assert.match(condensed, /\(\+2 more\)\]<\/code>/);
});

test('formatDiffAsHtml renders typography previews for additions and changes', () => {
  const previous = createTokenSetFromTree({
    typography: {
      heading: {
        $type: 'typography',
        $value: {
          fontFamily: 'Inter',
          fontWeight: '600',
          fontSize: {
            dimensionType: 'length',
            value: 24,
            unit: 'px',
          },
          lineHeight: {
            dimensionType: 'length',
            value: 32,
            unit: 'px',
          },
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    typography: {
      heading: {
        $type: 'typography',
        $value: {
          fontFamily: 'Inter',
          fontWeight: '700',
          fontSize: {
            dimensionType: 'length',
            value: 28,
            unit: 'px',
          },
          lineHeight: {
            dimensionType: 'length',
            value: 36,
            unit: 'px',
          },
        },
      },
      body: {
        $type: 'typography',
        $value: {
          fontFamily: 'Source Sans Pro',
          fontWeight: '400',
          fontSize: {
            dimensionType: 'length',
            value: 16,
            unit: 'px',
          },
          lineHeight: {
            dimensionType: 'length',
            value: 24,
            unit: 'px',
          },
          letterSpacing: {
            dimensionType: 'length',
            value: 0.01,
            unit: 'em',
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsHtml(diff);

  assert.match(
    output,
    /dtifx-diff__list-item--added[\s\S]*dtifx-diff__chip--typography[\s\S]*Source Sans Pro · 400 · 16px \/ 24px · letter 0.01em/,
  );
  assert.match(
    output,
    /Typography:[\s\S]*dtifx-diff__chip--typography[\s\S]*→[\s\S]*dtifx-diff__chip--typography/,
  );
  assert.match(output, /dtifx-diff__typography-chip-text"[^>]*style="[^"]*font-weight: 700[^"]*"/);
  assert.ok(
    output.includes('fontSize: { dimensionType: &#39;length&#39;, unit: &#39;px&#39;, value: 24 }'),
  );
  assert.ok(
    output.includes('fontSize: { dimensionType: &#39;length&#39;, unit: &#39;px&#39;, value: 28 }'),
  );
  assert.ok(
    output.includes('#/typography/body</code> = <code>{ fontFamily: &#39;Source Sans Pro&#39;'),
  );
  assert.ok(
    output.includes(
      'letterSpacing: { dimensionType: &#39;length&#39;, unit: &#39;em&#39;, value: 0.01 }',
    ),
  );
});

test('formatDiffAsHtml renders detail panels in detailed mode', () => {
  const previous = createTokenSetFromTree({
    color: {
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0, 0, 0],
        },
      },
      accent: {
        $type: 'color',
        $value: { colorSpace: 'srgb', components: [1, 0, 0] },
      },
      secondary: {
        $type: 'color',
        $value: { colorSpace: 'srgb', components: [0, 1, 0] },
      },
    },
    spacing: {
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
    color: {
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.1, 0.1, 0.1],
        },
      },
      accentRenamed: {
        $type: 'color',
        $value: { colorSpace: 'srgb', components: [1, 0, 0] },
      },
      highlight: {
        $type: 'color',
        $value: { colorSpace: 'srgb', components: [1, 1, 1] },
      },
    },
    spacing: {
      large: {
        $type: 'dimension',
        $value: {
          dimensionType: 'length',
          value: 16,
          unit: 'px',
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const detailed = formatDiffAsHtml(diff, { mode: 'detailed' });
  const full = formatDiffAsHtml(diff);

  assert.match(detailed, /<h2>Executive summary<\/h2>/);
  assert.match(detailed, /dtifx-diff__type-operation--added/);
  assert.match(detailed, /dtifx-diff__type-operation--removed/);
  assert.match(detailed, /dtifx-diff__type-operation--renamed/);
  assert.match(detailed, /dtifx-diff__type-operation--changed/);
  assert.match(detailed, /<div class="dtifx-diff__details/);
  assert.match(detailed, /Previous snapshot/);
  assert.doesNotMatch(full, /<div class="dtifx-diff__details/);
});

function createManualDiff(): TokenDiffResult {
  const previous = createSnapshot('#/color/brand/primary', {
    value: { colorSpace: 'srgb', components: [0, 0, 0] },
    references: [
      createPointer('#/components/button/background'),
      createPointer('#/components/button/text'),
      createPointer('#/components/button/icon'),
    ],
    resolutionPath: [
      createPointer('#/aliases/brand/base'),
      createPointer('#/aliases/brand/accent'),
      createPointer('#/aliases/brand/contrast'),
    ],
    appliedAliases: [
      createPointer('#/color/base'),
      createPointer('#/color/accent'),
      createPointer('#/color/contrast'),
    ],
  });
  const next = createSnapshot('#/color/brand/primary', {
    value: {
      colorSpace: 'srgb',
      components: [17 / 255, 17 / 255, 17 / 255],
    },
    references: [
      createPointer('#/components/button/background'),
      createPointer('#/components/button/text'),
      createPointer('#/components/button/icon'),
    ],
    resolutionPath: [
      createPointer('#/aliases/brand/base'),
      createPointer('#/aliases/brand/accent'),
      createPointer('#/aliases/brand/contrast'),
    ],
    appliedAliases: [
      createPointer('#/color/base'),
      createPointer('#/color/accent'),
      createPointer('#/color/contrast'),
    ],
  });
  const modification: TokenModification = {
    kind: 'changed',
    id: previous.id,
    impact: 'breaking',
    previous,
    next,
    changes: ['value', 'references', 'resolutionPath', 'appliedAliases'],
  };
  return {
    added: [],
    removed: [],
    renamed: [],
    changed: [modification],
    summary: createSummary(),
  };
}

function createSummary(): TokenDiffSummary {
  const typeSummary: TokenDiffTypeSummary = {
    type: 'color',
    totalPrevious: 1,
    totalNext: 1,
    added: 0,
    removed: 0,
    renamed: 0,
    changed: 1,
    unchanged: 0,
    breaking: 1,
    nonBreaking: 0,
    valueChanged: 1,
    metadataChanged: 0,
  };
  const groupSummary: TokenDiffGroupSummary = {
    group: 'color/brand',
    totalPrevious: 1,
    totalNext: 1,
    added: 0,
    removed: 0,
    renamed: 0,
    changed: 1,
    unchanged: 0,
    breaking: 1,
    nonBreaking: 0,
    valueChanged: 1,
    metadataChanged: 0,
  };
  return {
    totalPrevious: 1,
    totalNext: 1,
    added: 0,
    removed: 0,
    renamed: 0,
    changed: 1,
    unchanged: 0,
    breaking: 1,
    nonBreaking: 0,
    valueChanged: 1,
    metadataChanged: 0,
    recommendedBump: 'major',
    types: [typeSummary],
    groups: [groupSummary],
  };
}

function createSnapshot(
  id: string,
  overrides: Partial<
    Pick<TokenSnapshot, 'value' | 'references' | 'resolutionPath' | 'appliedAliases'>
  >,
): TokenSnapshot {
  const path = id
    .replace(/^#\//, '')
    .split('/')
    .filter((segment) => segment.length > 0);
  return {
    id,
    path,
    type: 'color',
    value: overrides.value,
    raw: overrides.value,
    ref: undefined,
    description: 'Test token',
    extensions: {},
    deprecated: undefined,
    source: { uri: 'memory://tokens.json', line: 1, column: 1 },
    references: overrides.references ?? [],
    resolutionPath: overrides.resolutionPath ?? [],
    appliedAliases: overrides.appliedAliases ?? [],
  };
}

function createPointer(pointer: string): TokenPointer {
  return { pointer, uri: 'memory://usage.json' };
}

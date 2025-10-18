import { test } from 'vitest';
import assert from 'node:assert/strict';

import { diffTokenSets } from '../../src/diff.js';
import { formatDiffAsMarkdown } from '../../src/reporting/renderers/markdown.js';
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

const srgb = (r: number, g: number, b: number, hex: string) => ({
  colorSpace: 'srgb',
  components: [r, g, b] as const,
  hex,
});

test('formatDiffAsMarkdown produces Markdown sections', () => {
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
      alias: {
        $type: 'color',
        $ref: '#/color/brand/primary',
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
      alias: {
        $type: 'color',
        $ref: '#/color/brand/secondary',
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsMarkdown(diff, {
    runContext: {
      previous: 'previous.json',
      next: 'next.json',
      startedAt: '2024-03-01T09:15:00Z',
      durationMs: 1800,
    },
  });

  assert.match(output, /^# DTIFx Diff report/m);
  assert.match(output, /## Executive summary/);
  assert.match(output, /- Recommended version bump: \*\*Major\*\*/);
  assert.match(output, /- Compared: previous\.json → next\.json/);
  assert.match(output, /- Started: 2024-03-01 09:15 UTC/);
  assert.match(output, /- Duration: 1\.8s/);
  assert.match(output, /- Impact: 2 breaking · 1 non-breaking/);
  assert.match(output, /- Changes: 1 added · 2 changed · 0 removed · 0 renamed/);
  assert.match(output, /- Tokens analysed: 2 previous → 3 next/);
  assert.match(output, /- Change mix: 2 value changes, 0 metadata changes/);
  assert.match(output, /- Type hotspots: color \(3 changes, 2 breaking\)/);
  assert.match(
    output,
    /- Group hotspots: color \(3 changes, 2 breaking\), color\/brand \(2 changes, 1 breaking\)/,
  );
  assert.match(
    output,
    /\| Type \| Previous \| Next \| Added \| Removed \| Renamed \| Changed \| Value changes \| Metadata changes \| Unchanged \| Breaking \| Non-breaking \|/,
  );
  assert.match(output, /\| color \| 2 \| 3 \| 1 \| 0 \| 0 \| 2 \| 2 \| 0 \| 0 \| 2 \| 1 \|/);
  assert.match(
    output,
    /\| Group \| Previous \| Next \| Added \| Removed \| Renamed \| Changed \| Value changes \| Metadata changes \| Unchanged \| Breaking \| Non-breaking \|/,
  );
  assert.match(output, /\| color \| 2 \| 3 \| 1 \| 0 \| 0 \| 2 \| 2 \| 0 \| 0 \| 2 \| 1 \|/);
  assert.match(output, /## Top risks \(3\)/);
  assert.match(
    output,
    /1\. \*\*\[BREAKING]\*\* ~ color `#\/color\/brand\/primary` — Value updated/,
  );
  assert.match(output, /Impact: Breaking update: dependent experiences may regress\./);
  assert.match(output, /Next: Coordinate updates for #\/color\/brand\/primary before release\./);
  assert.match(output, /- Fields: `value`, `raw`/);
  assert.match(output, /- Fields: `value`, `ref`, `references`, `resolutionPath`/);
  assert.doesNotMatch(output, /Why:/);
  assert.match(output, /## Grouped detail/);
  assert.match(output, /### color \(3 changes: 2 changed · 1 added\)/);
  assert.match(output, /#### color \(1 change: 1 changed\)/);
  assert.match(output, /#### color\/brand \(2 changes: 1 changed · 1 added\)/);
  assert.match(output, /#### color \(1 change: 1 changed\)[\s\S]*##### Changed \(1\)/);
  assert.match(
    output,
    /#### color\/brand \(2 changes: 1 changed · 1 added\)[\s\S]*##### Changed \(1\)/,
  );
  assert.match(output, /- ~ `#\/color\/alias` — Value updated/);
  assert.match(
    output,
    /- ~ `#\/color\/brand\/primary` — Value updated <span[^>]+><\/span> \(\*\*breaking\*\*\)/,
  );
  assert.match(output, /  - Impact: Breaking update: dependent experiences may regress\./);
  assert.match(
    output,
    /- value: { colorSpace: 'srgb', components: \[ 0, 0, 0 ] } → { colorSpace: 'srgb', components: \[ 0.2, 0.2, 0.2 ] }/,
  );
  assert.match(
    output,
    /  - Swatch: <span style="[^"]*background:#000000;[^"]*" aria-label="#000000" title="#000000"><\/span> → <span style="[^"]*background:#333333;[^"]*" aria-label="#333333" title="#333333"><\/span>/,
  );
  assert.match(output, /- ref: "#\/color\/brand\/primary" → "#\/color\/brand\/secondary"/);
  assert.match(output, /- references: \[\{ uri: .*?, pointer: '#\/color\/brand\/primary' }/);
  assert.match(output, /- references: .*pointer: '#\/color\/brand\/secondary'/);
  assert.match(output, /##### Added \(1\)/);
  assert.match(
    output,
    /- \+ `#\/color\/brand\/secondary` = { colorSpace: 'srgb', components: \[ 1, 1, 1 ] } <span[^>]+><\/span> \(_non-breaking_\)/,
  );
  assert.match(output, /## Hints/);
  assert.match(output, /## Exit codes/);
});

test('formatDiffAsMarkdown can return the summary section only', () => {
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
            components: [0.07, 0.07, 0.07],
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
  const output = formatDiffAsMarkdown(diff, {
    mode: 'summary',
    runContext: {
      previous: 'previous.json',
      next: 'next.json',
      startedAt: '2024-03-01T09:15:00Z',
      durationMs: 640,
    },
  });

  assert.strictEqual(
    output,
    [
      '# DTIFx Diff report',
      '',
      '## Executive summary',
      '- Recommended version bump: **Major**',
      '- Compared: previous.json → next.json',
      '- Started: 2024-03-01 09:15 UTC',
      '- Duration: 640ms',
      '- Impact: 1 breaking · 1 non-breaking',
      '- Changes: 1 added · 1 changed · 0 removed · 0 renamed',
      '- Tokens analysed: 1 previous → 2 next',
      '- Change mix: 1 value change, 0 metadata changes',
      '- Type hotspots: color (2 changes, 1 breaking)',
      '- Group hotspots: color (2 changes, 1 breaking), color/brand (2 changes, 1 breaking)',
      '',
      '### Type breakdown',
      '| Type | Previous | Next | Added | Removed | Renamed | Changed | Value changes | Metadata changes | Unchanged | Breaking | Non-breaking |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      '| color | 1 | 2 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 1 | 1 |',
      '',
      '### Group breakdown',
      '| Group | Previous | Next | Added | Removed | Renamed | Changed | Value changes | Metadata changes | Unchanged | Breaking | Non-breaking |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      '| color | 1 | 2 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 1 | 1 |',
      '| color/brand | 1 | 2 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 1 | 1 |',
      '',
      '## Hints',
      '- Use `--verbose` or `--mode detailed` for full token metadata and links.',
      '- Show rationale with `--why` and adjust context via `--diff-context N`.',
      '- Disable OSC-8 links with `--no-links`.',
      '- Export machine output via `--format json|yaml|sarif --output ./reports/dtifx-diff.json`.',
      '',
      '## Exit codes',
      '- 0 success',
      '- 1 failure triggered by `--fail-on-breaking` or `--fail-on-changes`.',
      '- 2 parser or IO error.',
    ].join('\n'),
  );
});

test('formatDiffAsMarkdown renders renamed tokens', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
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

  const next = createTokenSetFromTree({
    color: {
      brand: {
        secondaryRenamed: {
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
  const output = formatDiffAsMarkdown(diff);

  assert.match(output, /## Grouped detail/);
  assert.match(output, /### color \(1 change: 1 renamed\)/);
  assert.match(output, /#### Renamed \(1\)/);
  assert.match(
    output,
    /- > `#\/color\/brand\/secondary` → `#\/color\/brand\/secondaryRenamed` = { colorSpace: 'srgb', components: \[ 1, 1, 1 ] } <span[^>]+><\/span> \(\*\*breaking\*\*\)/,
  );
  assert.match(
    output,
    /  - Impact: Breaking rename: references must switch to #\/color\/brand\/secondaryRenamed\./,
  );
  assert.match(
    output,
    /  - Next: Replace usages of #\/color\/brand\/secondary with #\/color\/brand\/secondaryRenamed\./,
  );
  assert.match(
    output,
    /<span style="[^"]*background:#FFFFFF;[^"]*" aria-label="#FFFFFF" title="#FFFFFF"><\/span>/,
  );
});

test('formatDiffAsMarkdown includes rationale when showWhy is enabled', () => {
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
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsMarkdown(diff, { showWhy: true });

  assert.match(output, /- Why: Changed fields: value and raw data/);
  assert.match(output, /- Why: Introduces new color token/);
  assert.match(output, /  - Why: Changed fields: value and raw data/);
});

test('formatDiffAsMarkdown renders swatches for semi-transparent colors', () => {
  const previous = createTokenSetFromTree({});

  const next = createTokenSetFromTree({
    color: {
      overlay: {
        $value: {
          colorSpace: 'srgb',
          components: [15 / 255, 59 / 255, 255 / 255],
          hex: '#0F3BFF',
          alpha: 0.5,
        },
        $type: 'color',
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsMarkdown(diff);

  assert.match(
    output,
    /<span style="[^"]*background:rgba\(15, 59, 255, 0\.5\);[^"]*" aria-label="#0F3BFF, alpha 0\.5" title="#0F3BFF, alpha 0\.5"><\/span>/,
  );
});

test('formatDiffAsMarkdown renders typography previews alongside swatches', () => {
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
  const output = formatDiffAsMarkdown(diff);

  assert.match(
    output,
    /<span style="[^"]*font-family:&quot;Source Sans Pro&quot;[^"]*letter-spacing:0\.01em;" aria-label="Source Sans Pro · 400 · 16px \/ 24px · letter 0\.01em" title="Source Sans Pro · 400 · 16px \/ 24px · letter 0\.01em">Ag<\/span> <span style="font-size:0\.75em;margin-left:0\.35rem;">Source Sans Pro · 400 · 16px \/ 24px · letter 0\.01em<\/span> \(_non-breaking_\)/,
  );
  assert.match(
    output,
    /- value: { fontFamily: 'Inter',[\s\S]*fontSize: \{ dimensionType: 'length', unit: 'px', value: 24 }[\s\S]*fontWeight: '600'[\s\S]*lineHeight: \{ dimensionType: 'length', unit: 'px', value: 32 } } → { fontFamily: 'Inter',[\s\S]*fontSize: \{ dimensionType: 'length', unit: 'px', value: 28 }[\s\S]*lineHeight: \{ dimensionType: 'length', unit: 'px', value: 36 } }/,
  );
  assert.match(
    output,
    /- \+ `#\/typography\/body` = { fontFamily: 'Source Sans Pro',[\s\S]*fontSize: \{ dimensionType: 'length', unit: 'px', value: 16 }[\s\S]*letterSpacing: \{ dimensionType: 'length', unit: 'em', value: 0\.01 }[\s\S]*lineHeight: \{ dimensionType: 'length', unit: 'px', value: 24 } }/,
  );
  assert.match(
    output,
    /Typography: <span style="[^"]*font-family:Inter[^"]*font-weight:600[^"]*font-size:24px[^"]*line-height:32px;" aria-label="Inter · 600 · 24px \/ 32px" title="Inter · 600 · 24px \/ 32px">Ag<\/span> <span style="font-size:0\.75em;margin-left:0\.35rem;">Inter · 600 · 24px \/ 32px<\/span> → <span style="[^"]*font-family:Inter[^"]*font-weight:700[^"]*font-size:28px[^"]*line-height:36px;" aria-label="Inter · 700 · 28px \/ 36px" title="Inter · 700 · 28px \/ 36px">Ag<\/span> <span style="font-size:0\.75em;margin-left:0\.35rem;">Inter · 700 · 28px \/ 36px<\/span>/,
  );
});

test('formatDiffAsMarkdown annotates dimension deltas', () => {
  const previous = createTokenSetFromTree({
    spacing: {
      gap: {
        $type: 'dimension',
        $value: { dimensionType: 'length', value: 4, unit: 'px' },
      },
    },
  });

  const next = createTokenSetFromTree({
    spacing: {
      gap: {
        $type: 'dimension',
        $value: { dimensionType: 'length', value: 6, unit: 'px' },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsMarkdown(diff);

  assert.match(output, /  - delta: \+2px \(\+50%\)/);
});

test('formatDiffAsMarkdown includes detail lists in detailed mode', () => {
  const previous = createTokenSetFromTree({
    color: {
      primary: {
        $type: 'color',
        $value: srgb(0, 0, 0, '#000000'),
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      primary: {
        $type: 'color',
        $value: srgb(17 / 255, 17 / 255, 17 / 255, '#111111'),
      },
      secondary: {
        $type: 'color',
        $value: srgb(1, 1, 1, '#FFFFFF'),
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const detailed = formatDiffAsMarkdown(diff, { mode: 'detailed' });
  const full = formatDiffAsMarkdown(diff);

  assert.notEqual(detailed, full);
  assert.match(detailed, /Source:/);
  assert.match(detailed, /Type:/);
  assert.doesNotMatch(full, /Source:/);
});

test('formatDiffAsMarkdown condensed mode suppresses risks and trims pointer context', () => {
  const diff = createManualDiff();
  const full = formatDiffAsMarkdown(diff, { diffContext: 3 });
  const condensed = formatDiffAsMarkdown(diff, { diffContext: 3, mode: 'condensed' });

  assert.match(full, /## Top risks/);
  assert.doesNotMatch(condensed, /## Top risks/);
  assert.match(full, /#\/components\/button\/icon/);
  assert.doesNotMatch(condensed, /#\/components\/button\/icon/);
  assert.match(condensed, /\(\+2 more\)]/);
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

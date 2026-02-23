import { test } from 'vitest';
import assert from 'node:assert/strict';
import { stdout } from 'node:process';

import { diffTokenSets } from '../../src/diff.js';
import { formatDiffAsCli } from '../../src/reporting/renderers/cli.js';
import { createTokenSetFromTree } from '../../src/token-set.js';
import type { TokenPointer } from '../../src/token-set.js';

const srgb = (r: number, g: number, b: number, hex: string) => ({
  colorSpace: 'srgb',
  components: [r, g, b] as const,
  hex,
});

function stripControlSequences(value: string): string {
  return value
    .replaceAll(/\u001B\[[0-9;]*m/g, '')
    .replaceAll(/\u001B]8;;[^\u0007]*\u0007/g, '')
    .replaceAll('\u001B]8;;\u0007', '');
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\\$&`);
}

test('formatDiffAsCli renders condensed output by default', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
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
            components: [0.13, 0.13, 0.13],
          },
        },
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    links: false,
    runContext: {
      previous: 'previous.json',
      next: 'next.json',
      startedAt: '2024-03-01T09:15:00Z',
      durationMs: 1250,
    },
  });
  const condensed = formatDiffAsCli(diff, {
    color: false,
    links: false,
    mode: 'condensed',
    runContext: {
      previous: 'previous.json',
      next: 'next.json',
      startedAt: '2024-03-01T09:15:00Z',
      durationMs: 1250,
    },
  });

  const headerLines = output.split('\n');
  assert.match(headerLines[0] ?? '', /DTIFX DIFF REPORT v[0-9.]+/);
  assert.match(output, /recommended bump: Major/);
  assert.match(output, /impact 1 breaking · 1 non-breaking/);
  assert.match(output, /tokens 1 → 2/);
  assert.match(output, /compare previous\.json → next\.json/);
  assert.match(output, /started 2024-03-01 09:15 UTC/);
  assert.match(output, /duration 1\.3s/);
  assert.match(output, /Executive summary/);
  assert.match(output, /Top risks \(2\)/);
  assert.doesNotMatch(output, /Impact: Breaking update: dependent experiences may regress\./);
  assert.doesNotMatch(
    output,
    /Next: Coordinate updates for #\/color\/brand\/primary before release\./,
  );
  assert.doesNotMatch(output, /Before:/);
  assert.doesNotMatch(output, /After:/);
  assert.match(output, /Grouped detail[\s\S]*  color \(2 changes: 1 changed · 1 added\)/);
  assert.match(output, /      Changed \(1\)\n        • ~ #\/color\/brand\/primary \[breaking]/);
  assert.match(
    output,
    /      Added \(1\)\n        • \+ #\/color\/brand\/secondary \[non-breaking]/,
  );
  assert.equal(output, condensed);
});

test('formatDiffAsCli renders expanded metadata in full mode', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
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
            components: [0.13, 0.13, 0.13],
          },
        },
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    links: false,
    mode: 'full',
    runContext: {
      previous: 'previous.json',
      next: 'next.json',
      startedAt: '2024-03-01T09:15:00Z',
      durationMs: 1250,
    },
  });

  const headerLines = output.split('\n');
  assert.match(headerLines[0] ?? '', /DTIFX DIFF REPORT v[0-9.]+/);
  assert.match(output, /recommended bump: Major/);
  assert.match(output, /impact 1 breaking · 1 non-breaking/);
  assert.match(output, /tokens 1 → 2/);
  assert.match(output, /compare previous\.json → next\.json/);
  assert.match(output, /started 2024-03-01 09:15 UTC/);
  assert.match(output, /duration 1\.3s/);
  assert.match(output, /Executive summary/);
  assert.match(output, /Impact: 1 breaking · 1 non-breaking/);
  assert.match(output, /Changes: 1 added · 1 changed · 0 removed · 0 renamed/);
  assert.match(output, /Type hotspots: color \(2 changes, 1 breaking\)/);
  assert.match(output, /Top risks \(2\)/);
  assert.match(output, /! \[BREAKING] ~ color #\/color\/brand\/primary — Value updated/);
  assert.match(output, /Impact: Breaking update: dependent experiences may regress\./);
  assert.match(output, /Next: Coordinate updates for #\/color\/brand\/primary before release\./);
  assert.match(
    output,
    /Grouped detail[\s\S]*  color \(2 changes: 1 changed · 1 added\)[\s\S]*    color\/brand \(2 changes: 1 changed · 1 added\)/,
  );
  assert.match(output, /      Changed \(1\)\n        • ~ #\/color\/brand\/primary \[breaking]/);
  assert.match(
    output,
    /      Added \(1\)[\s\S]*        • \+ #\/color\/brand\/secondary = { colorSpace: 'srgb', components: \[ 1, 1, 1 ] } (?:… )?\[swatch #FFFFFF] \[non-breaking]/,
  );
  assert.match(output, /\[swatch #FFFFFF\]/);
  assert.match(output, / {8}Impact: Non-breaking addition: publicise availability to adopters\./);
  assert.match(
    output,
    / {8}Next: Plan adoption for #\/color\/brand\/secondary across consuming teams\./,
  );
  assert.match(
    output,
    / {8,}• Value updated\n {12}Before: { colorSpace: 'srgb', components: \[ 0, 0, 0 ] }\n {12}After: { colorSpace: 'srgb', components: \[ 0.13, 0.13, 0.13 ] }/,
  );
  assert.match(output, /Swatch: \[swatch #000000] → \[swatch #212121]/);
  assert.doesNotMatch(output, /Hints/);
  assert.doesNotMatch(output, /Exit codes/);
});

test('formatDiffAsCli can fall back to ASCII-friendly glyphs', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
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
            components: [0.13, 0.13, 0.13],
          },
        },
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    mode: 'full',
    links: false,
    unicode: false,
    runContext: {
      previous: 'previous.json',
      next: 'next.json',
      startedAt: '2024-03-01T09:15:00Z',
      durationMs: 1250,
    },
  });

  assert.match(output, /impact 1 breaking \| 1 non-breaking/);
  assert.match(output, /tokens 1 -> 2/);
  assert.match(output, /Top risks/);
  assert.match(output, /\* ~ #\/color\/brand\/primary \[breaking]/);
  assert.match(output, /Impact: Breaking update: dependent experiences may regress\./);
  assert.doesNotMatch(output, /[·→↪─│•…◦—]/u);
});

test('formatDiffAsCli can render the summary only', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
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
            components: [0.13, 0.13, 0.13],
          },
        },
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    mode: 'summary',
    links: false,
    runContext: {
      previous: 'previous.json',
      next: 'next.json',
      startedAt: '2024-03-01T09:15:00Z',
      durationMs: 640,
    },
  });

  const headerLines = output.split('\n');
  assert.match(headerLines[0] ?? '', /DTIFX DIFF REPORT v[0-9.]+/);
  assert.match(output, /recommended bump: Major/);
  assert.match(output, /impact 1 breaking · 1 non-breaking/);
  assert.match(output, /tokens 1 → 2/);
  assert.match(output, /compare previous\.json → next\.json/);
  assert.match(output, /started 2024-03-01 09:15 UTC/);
  assert.match(output, /duration 640ms/);
  assert.match(output, /Executive summary/);
  assert.match(output, /Change mix: 1 value change, 0 metadata changes/);
  assert.match(output, /Type hotspots: color \(2 changes, 1 breaking\)/);
  assert.doesNotMatch(output, /Top risks/);
  assert.doesNotMatch(output, /Grouped detail/);
  assert.doesNotMatch(output, /Hints/);
  assert.doesNotMatch(output, /Exit codes/);
});

test('formatDiffAsCli adapts to narrow widths', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
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
            components: [0.13, 0.13, 0.13],
          },
        },
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    mode: 'full',
    width: 60,
    links: false,
    runContext: {
      previous: 'previous.json',
      next: 'next.json',
      startedAt: '2024-03-01T09:15:00Z',
      durationMs: 2750,
    },
  });

  assert.ok(output.includes('DTIFX DIFF REPORT v'));
  assert.ok(output.includes('recommended bump'));
  assert.ok(output.includes('compare previous.json → next.json'));
  assert.ok(output.includes('started 2024-03-01 09:15 UTC'));
  assert.ok(output.includes('duration 2.8s'));
  assert.ok(output.includes('impact 1 breaking'));
  assert.ok(output.includes('tokens 1 → 2'));
  assert.match(output, /Type hotspots: color \(2 changes[^\n]*1 breaking[^\n]*\)/);
  assert.ok(output.includes('#/…/brand/primary'));
  assert.match(output, /^    Impact: Breaking update: dependent experiences may/m);
  assert.match(output, /^    Next: Coordinate updates for/m);
});

test('formatDiffAsCli highlights pointer and metadata changes', () => {
  const previous = createTokenSetFromTree({
    color: {
      alias: {
        $type: 'color',
        $ref: '#/color/brand/primary',
      },
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
          },
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      alias: {
        $type: 'color',
        $ref: '#/color/brand/secondary',
      },
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
          },
        },
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    mode: 'full',
    links: false,
  });

  assert.match(
    output,
    / {8,}• Reference updated\n {12}Before: #\/color\/brand\/primary\n {12}After: #\/color\/brand\/secondary/,
  );
  assert.match(
    output,
    /• \+ #\/color\/brand\/secondary = .* (?:… )?\[swatch #FFFFFF] \[non-breaking]/,
  );
  assert.match(output, /• ~ #\/color\/alias \[breaking]/);
  assert.match(
    output,
    / {8,}• References updated\n {12}Before:\n {14}◦ memory:\/inline-dtif#\/color\/brand\/primary/,
  );
  assert.match(
    output,
    /References updated[\s\S]*After:\n {14}◦ memory:\/inline-dtif#\/color\/brand\/secondary/,
  );
  assert.match(
    output,
    / {8,}• Resolution path updated[\s\S]*Before:\n {14}◦ memory:\/inline-dtif#\/color\/alias/,
  );
  assert.match(output, /memory:\/inline-dtif#\/color\/brand\/secondary/);
  assert.ok(!output.includes('file://'));
});

test('formatDiffAsCli includes rationale when --why is enabled', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
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
            components: [0.13, 0.13, 0.13],
          },
        },
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    mode: 'full',
    showWhy: true,
    links: false,
  });

  assert.match(output, /Why: Changed fields: value and raw data/);
  assert.match(output, /Why: Introduces new color token/);
});

test('formatDiffAsCli emits OSC-8 hyperlinks when links are enabled', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: srgb(0, 0, 0, '#000000'),
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: srgb(17 / 255, 17 / 255, 17 / 255, '#111111'),
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const withLinks = formatDiffAsCli(diff, { color: false, links: true });
  const withoutLinks = formatDiffAsCli(diff, { color: false, links: false });

  assert.ok(withLinks.includes('\u001B]8;;'));
  assert.ok(!withoutLinks.includes('\u001B]8;;'));
});

test('formatDiffAsCli strips control characters from metadata and disables unsafe hyperlinks', () => {
  const ESC = '\u001B';
  const BEL = '\u0007';
  const CONTROL_PATTERN = /[\u0000-\u001F\u007F]/g;
  const maliciousTokenKey = `pr${ESC}imary${BEL}`;
  const sanitizedTokenKey = maliciousTokenKey.replaceAll(CONTROL_PATTERN, '');
  const maliciousDescription = `Updated ${ESC}description${BEL}`;
  const sanitizedDescription = maliciousDescription.replaceAll(CONTROL_PATTERN, '');
  const maliciousRef = `#/ref${ESC}path${BEL}`;
  const sanitizedRef = maliciousRef.replaceAll(CONTROL_PATTERN, '');
  const maliciousSourceUri = `invalid${ESC}source${BEL}`;
  const maliciousPointerUri = `pointer${ESC}uri${BEL}`;

  const previous = createTokenSetFromTree({
    color: {
      brand: {
        [maliciousTokenKey]: {
          $type: 'color',
          $value: srgb(0, 0, 0, '#000000'),
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        [maliciousTokenKey]: {
          $type: 'color',
          $value: srgb(17 / 255, 17 / 255, 17 / 255, '#111111'),
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const change = diff.changed[0];
  const mutableNext = change.next as unknown as {
    source: { uri: string; line: number; column: number };
    ref?: string;
    description?: string;
    references: TokenPointer[];
    resolutionPath: TokenPointer[];
    appliedAliases: TokenPointer[];
  };
  const mutablePrevious = change.previous as unknown as {
    source: { uri: string; line: number; column: number };
    references: TokenPointer[];
    resolutionPath: TokenPointer[];
    appliedAliases: TokenPointer[];
  };

  mutableNext.source.uri = maliciousSourceUri;
  mutableNext.source.line = 7;
  mutableNext.source.column = 9;
  mutableNext.ref = maliciousRef;
  mutableNext.description = maliciousDescription;

  const pointer: TokenPointer = {
    pointer: `#/color/brand/${maliciousTokenKey}`,
    uri: maliciousPointerUri,
  };

  mutableNext.references = [pointer];
  mutableNext.resolutionPath = [pointer];
  mutableNext.appliedAliases = [pointer];
  mutablePrevious.source.uri = maliciousSourceUri;
  mutablePrevious.source.line = 3;
  mutablePrevious.source.column = 5;
  const previousPointer: TokenPointer = { ...pointer };
  mutablePrevious.references = [previousPointer];
  mutablePrevious.resolutionPath = [previousPointer];
  mutablePrevious.appliedAliases = [previousPointer];

  const output = formatDiffAsCli(diff, { color: false, mode: 'full', links: true, unicode: false });

  assert.ok(!output.includes(`\u001B]8;;invalidsource`));
  assert.ok(!output.includes(`\u001B]8;;pointer`));

  const plain = stripControlSequences(output);
  assert.ok(!plain.includes(ESC));
  assert.ok(!plain.includes(BEL));
  assert.match(plain, new RegExp(`#\/color\/brand\/${escapeRegExp(sanitizedTokenKey)}`));
  assert.match(plain, new RegExp(`Ref: ${escapeRegExp(sanitizedRef)}`));
  assert.match(plain, new RegExp(`Description: ${escapeRegExp(sanitizedDescription)}`));
  assert.match(plain, /Source: invalidsource:7:9/);
  assert.match(
    plain,
    new RegExp(
      `Resolution path:[^\n]*\n\\s+- ${escapeRegExp(`pointeruri#/color/brand/${sanitizedTokenKey}`)}`,
    ),
  );
});

test('formatDiffAsCli disables hyperlinks by default in CI environments', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: srgb(0, 0, 0, '#000000'),
          $extensions: {
            'example.source': {
              uri: 'file:///tmp/previous.json',
              line: 1,
              column: 1,
            },
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
          $value: srgb(17 / 255, 17 / 255, 17 / 255, '#111111'),
          $extensions: {
            'example.source': {
              uri: 'file:///tmp/next.json',
              line: 1,
              column: 1,
            },
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const originalCi = process.env.CI;
  const originalDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

  try {
    process.env.CI = 'true';
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
      enumerable: true,
      writable: true,
    });

    const output = formatDiffAsCli(diff, { color: false });
    assert.ok(!output.includes('\u001B]8;;'));
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(process.stdout, 'isTTY', originalDescriptor);
    } else {
      delete (process.stdout as { isTTY?: boolean }).isTTY;
    }

    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }
  }
});

test('formatDiffAsCli renders renamed tokens', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        secondaryRenamed: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    mode: 'full',
    links: false,
  });

  const headerLines = output.split('\n', 3);
  assert.match(
    headerLines[0] ?? '',
    /DTIFX DIFF REPORT v[0-9.]+ │ recommended bump: Major │ impact 1 breaking · 0 non-breaking/,
  );
  assert.match(headerLines[1] ?? '', /tokens 1 → 1/);
  assert.match(output, /Top risks \(1\)/);
  assert.match(
    output,
    /! \[BREAKING] > color #\/color\/brand\/secondary → #\/color\/brand\/secondaryRenamed — Token renamed/,
  );
  assert.match(
    output,
    /Group hotspots: color \(1 change, 1 breaking\); color\/brand \(1 change, 1 breaking\)/,
  );
  assert.match(output, /Grouped detail/);
  assert.match(output, /  color \(1 change: 1 renamed\)/);
  assert.match(output, /    color\/brand \(1 change: 1 renamed\)/);
  assert.match(output, /      Renamed \(1\)/);
  assert.match(
    output,
    /        • ↪ #\/color\/brand\/secondary → #\/color\/brand\/secondaryRenamed = { colorSpace: 'srgb', .* (?:… )?\[swatch #FFFFFF] \[breaking]/,
  );
  assert.match(output, /\[swatch #FFFFFF\]/);
});

test('formatDiffAsCli groups changes by token type', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: srgb(34 / 255, 34 / 255, 34 / 255, '#222222'),
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        accent: {
          $type: 'color',
          $value: srgb(1, 0, 0, '#FF0000'),
        },
        primary: {
          $type: 'color',
          $value: srgb(34 / 255, 34 / 255, 34 / 255, '#222222'),
        },
      },
    },
    spacing: {
      scale: {
        small: {
          $type: 'dimension',
          $value: {
            dimensionType: 'length',
            value: 4,
            unit: 'px',
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    mode: 'full',
    links: false,
  });

  assert.match(
    output,
    /  color \(1 change: 1 added\)[\s\S]*    color\/brand \(1 change: 1 added\)[\s\S]*      Added \(1\)\n        • \+ #\/color\/brand\/accent = \{ colorSpace: 'srgb', components: \[ 1, 0, 0 ], hex: '#FF0000' } \[swatch #FF0000] \[non-breaking]/,
  );
  assert.match(
    output,
    /  dimension \(1 change: 1 added\)[\s\S]*    spacing\/scale \(1 change: 1 added\)[\s\S]*      Added \(1\)\n        • \+ #\/spacing\/scale\/small = { dimensionType: 'length', unit: 'px', value: 4 } \[non-breaking]/,
  );
});

test('formatDiffAsCli renders ANSI color swatches when enabled', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $value: {
            colorSpace: 'srgb',
            components: [0, 0, 0],
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
            components: [0.13, 0.13, 0.13],
          },
        },
        secondary: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [1, 1, 1],
          },
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: true,
    mode: 'full',
    links: false,
  });

  assert.match(output, /\[swatch #FFFFFF\]/);
  assert.match(output, /\u001B\[48;2;255;255;255m  \u001B\[0m/);
});

test('formatDiffAsCli annotates dimension deltas', () => {
  const previous = createTokenSetFromTree({
    spacing: {
      small: {
        $type: 'dimension',
        $value: { dimensionType: 'length', value: 4, unit: 'px' },
      },
    },
  });

  const next = createTokenSetFromTree({
    spacing: {
      small: {
        $type: 'dimension',
        $value: { dimensionType: 'length', value: 6, unit: 'px' },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    mode: 'full',
    links: false,
  });

  assert.match(output, /Delta: \+2px \(\+50%\)/);
});

test('formatDiffAsCli annotates typography changes', () => {
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
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    mode: 'full',
    links: false,
  });

  assert.match(
    output,
    /Before: \{ fontFamily: 'Inter',[\s\S]*fontSize: \{ dimensionType: 'length', unit: 'px', value: 24 }[\s\S]*lineHeight: \{ dimensionType: 'length', unit: 'px', value: 32 } }/,
  );
  assert.match(
    output,
    /After: \{ fontFamily: 'Inter',[\s\S]*fontSize: \{ dimensionType: 'length', unit: 'px', value: 28 }[\s\S]*lineHeight: \{ dimensionType: 'length', unit: 'px', value: 36 } }/,
  );
  assert.match(
    output,
    /\+ #\/typography\/body = \{ fontFamily: 'Source Sans Pro',[\s\S]*fontSize: \{ dimensionType: 'length', unit: 'px', value: 16 }[\s\S]*letterSpacing: \{ dimensionType: 'length', unit: 'em', value: 0\.01 }[\s\S]*lineHeight: \{ dimensionType: 'length', unit: 'px', value: 24 } }/,
  );
  assert.match(output, /\[type Source Sans Pro · 400 · 16px \/ 24px · letter 0\.01em]/);
  assert.match(output, /Typography: Inter · 600 · 24px \/ 32px → Inter · 700 · 28px \/ 36px/);
});

test('formatDiffAsCli treats detailed mode as an alias of full', () => {
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
  const full = formatDiffAsCli(diff, {
    color: false,
    mode: 'full',
    links: false,
  });
  const detailed = formatDiffAsCli(diff, {
    color: false,
    mode: 'detailed',
    links: false,
  });

  assert.equal(detailed, full);
  assert.match(full, /Source:/);
  assert.match(full, /Type: color/);
});

test('formatDiffAsCli sanitizes file URIs in string output', () => {
  const previous = createTokenSetFromTree({
    color: {
      primary: {
        $type: 'color',
        $value: srgb(0, 0, 0, '#000000'),
        $extensions: {
          'example.snapshot': 'file:///private/secret-directory/previous.json',
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      primary: {
        $type: 'color',
        $value: srgb(17 / 255, 17 / 255, 17 / 255, '#111111'),
        $extensions: {
          'example.snapshot': 'file:///private/top-secret/next.json',
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    mode: 'full',
    links: false,
  });

  assert.equal(output.includes('secret-directory'), false);
  assert.equal(output.includes('top-secret'), false);
  assert.equal(/previous\.json|next\.json/.test(output), true);
});

test('formatDiffAsCli caps auto-detected width at the default maximum', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: srgb(0, 0, 0, '#000000'),
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: srgb(17 / 255, 17 / 255, 17 / 255, '#111111'),
        },
        secondary: {
          $type: 'color',
          $value: srgb(1, 1, 1, '#FFFFFF'),
        },
      },
    },
  });

  const originalColumns = stdout.columns;
  (stdout as typeof stdout & { columns?: number }).columns = 240;

  try {
    const diff = diffTokenSets(previous, next);
    const output = formatDiffAsCli(diff, {
      color: false,
      mode: 'full',
      links: false,
    });
    const lines = output.split('\n');
    const visibleLength = (value: string): number =>
      value
        .replaceAll(/\u001B\[[0-9;]*m/g, '')
        .replaceAll(/\u001B]8;;[^\u0007]*\u0007/g, '')
        .replaceAll('\u001B]8;;\u0007', '').length;

    for (const line of lines) {
      if (line.includes('+ #/color/brand/secondary')) {
        assert.ok(line.includes('…'), 'expected truncated addition line');
        continue;
      }

      assert.ok(visibleLength(line) <= 100, `line exceeded width: ${line}`);
    }

    const divider = lines.find((line) => /^─+$/.test(line));
    assert.equal(divider?.length, 100);
  } finally {
    if (typeof originalColumns === 'number') {
      (stdout as typeof stdout & { columns?: number }).columns = originalColumns;
    } else {
      delete (stdout as typeof stdout & { columns?: number }).columns;
    }
  }
});

test('formatDiffAsCli hyperlinks only token pointer segments', () => {
  const previous = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: srgb(0, 0, 0, '#000000'),
        },
      },
    },
  });

  const next = createTokenSetFromTree({
    color: {
      brand: {
        primary: {
          $type: 'color',
          $value: srgb(17 / 255, 17 / 255, 17 / 255, '#111111'),
        },
        secondary: {
          $type: 'color',
          $value: srgb(1, 1, 1, '#FFFFFF'),
        },
      },
    },
  });

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: false,
    links: true,
  });

  const originalLines = output.split('\n');
  const plainLines = originalLines.map((line) => stripControlSequences(line));

  const additionIndex = plainLines.findIndex((line) => line.includes('+ #/color/brand/secondary'));
  assert.notEqual(additionIndex, -1);
  const additionLine = originalLines[additionIndex];

  const hyperlinkStart = additionLine.indexOf('\u001B]8;;');
  assert.notEqual(hyperlinkStart, -1);

  const pointerTextStart = additionLine.indexOf('\u0007', hyperlinkStart) + 1;
  const pointerTextEnd = additionLine.indexOf('\u001B]8;;\u0007', pointerTextStart);
  const linkedPointer = additionLine.slice(pointerTextStart, pointerTextEnd);

  assert.equal(linkedPointer, '#/color/brand/secondary');
  assert.ok(additionLine.slice(0, hyperlinkStart).includes('• + '));

  const modificationIndex = plainLines.findIndex((line) =>
    line.includes('~ #/color/brand/primary'),
  );
  assert.notEqual(modificationIndex, -1);
  const modificationLine = originalLines[modificationIndex];

  const modificationStart = modificationLine.indexOf('\u001B]8;;');
  assert.notEqual(modificationStart, -1);

  const modificationPointerStart = modificationLine.indexOf('\u0007', modificationStart) + 1;
  const modificationPointerEnd = modificationLine.indexOf(
    '\u001B]8;;\u0007',
    modificationPointerStart,
  );
  const modificationPointer = modificationLine.slice(
    modificationPointerStart,
    modificationPointerEnd,
  );

  assert.equal(modificationPointer, '#/color/brand/primary');
});

test('formatDiffAsCli preserves hyperlinks and ANSI styling when wrapping entries', () => {
  const previous = createTokenSetFromTree(
    {
      color: {
        brand: {
          primary: {
            $type: 'color',
            $value: srgb(0, 0, 0, '#000000'),
          },
        },
      },
    },
    { source: 'file:///tokens/previous.json' },
  );

  const next = createTokenSetFromTree(
    {
      color: {
        brand: {
          primary: {
            $type: 'color',
            $value: srgb(0.13, 0.13, 0.13, '#212121'),
          },
          secondaryButtonBackgroundCritical: {
            $type: 'color',
            $description:
              'A critical button background with an extremely long description to force truncation in CLI outputs.',
            $value: srgb(1, 0, 0, '#FF0000'),
          },
        },
      },
    },
    { source: 'file:///tokens/next.json' },
  );

  const diff = diffTokenSets(previous, next);
  const output = formatDiffAsCli(diff, {
    color: true,
    links: true,
    mode: 'full',
    unicode: true,
    width: 60,
  });

  assert.match(output, /\u001B\[[0-9;]*m/);
  assert.match(output, /\u001B]8;;[^\u0007]+\u0007/);
  assert.match(output, /\u001B]8;;\u0007/);

  const additionLine = output.split('\n').find((line) => line.includes('[swatch #FF0000]'));

  assert.ok(additionLine, 'expected to locate truncated addition entry');

  const sanitized = stripControlSequences(additionLine ?? '');
  assert.equal(
    sanitized,
    '        • + #/…/brand/secondaryButtonBackgroundCritical =  …    [swatch #FF0000] [non-breaking]',
  );
});

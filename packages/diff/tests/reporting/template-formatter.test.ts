import { test } from 'vitest';
import assert from 'node:assert/strict';

import { diffTokenSets } from '../../src/diff.js';
import { formatDiffWithTemplate } from '../../src/reporting/renderers/template.js';
import { createTokenSetFromTree } from '../../src/token-set.js';

// The template formatter depends on the optional Handlebars runtime. In
// environments where the module is not installed we skip the formatter tests so
// the rest of the suite can run successfully.

let hasHandlebarsRuntime = true;

try {
  await import('handlebars');
} catch {
  hasHandlebarsRuntime = false;
}

const previous = createTokenSetFromTree({
  color: {
    brand: {
      primary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [17 / 255, 34 / 255, 51 / 255],
        },
      },
    },
  },
  spacing: {
    sm: {
      $type: 'dimension',
      $value: {
        dimensionType: 'length',
        value: 8,
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
          components: [34 / 255, 51 / 255, 68 / 255],
        },
        $description: 'Updated shade',
      },
      secondary: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [68 / 255, 85 / 255, 102 / 255],
        },
      },
    },
  },
  spacing: {
    smRenamed: {
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

const escapingPrevious = createTokenSetFromTree({});
const escapingNext = createTokenSetFromTree({
  color: {
    brand: {
      script: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [1 / 255, 2 / 255, 3 / 255],
        },
        $description: '<script>alert(1)</script>',
      },
    },
  },
});

const escapingDiff = diffTokenSets(escapingPrevious, escapingNext);

test(
  'formatDiffWithTemplate exposes diff summary and change collections',
  { skip: !hasHandlebarsRuntime },
  () => {
    const summary = diff.summary;
    const output = formatDiffWithTemplate(diff, {
      template:
        'Added {{summary.added}} / Removed {{summary.removed}} / Renamed {{summary.renamed}} / Changed {{summary.changed}}',
    });

    assert.equal(
      output,
      `Added ${String(summary.added)} / Removed ${String(summary.removed)} / Renamed ${String(summary.renamed)} / Changed ${String(summary.changed)}`,
    );
  },
);

test(
  'formatDiffWithTemplate allows iterating change arrays via Handlebars',
  { skip: !hasHandlebarsRuntime },
  () => {
    const output = formatDiffWithTemplate(diff, {
      template:
        '{{#each diff.added}}{{this.id}} {{/each}}{{#each diff.renamed}}{{this.previousId}}→{{this.nextId}} {{/each}}',
    });

    assert.match(output, /#\/color\/brand\/secondary/u);
    assert.match(output, /#\/spacing\/sm→#\/spacing\/smRenamed/u);
  },
);

test(
  'formatDiffWithTemplate exposes report insights and helpers',
  { skip: !hasHandlebarsRuntime },
  () => {
    const output = formatDiffWithTemplate(diff, {
      mode: 'summary',
      template:
        'Impact {{report.summary.impact.breaking}}/{{report.summary.impact.nonBreaking}} json={{json summary 0}}',
    });

    assert.match(output, /Impact \d+\/\d+/u);
    assert.match(output, /json=\{/u);
  },
);

test('formatDiffWithTemplate registers supplied partials', { skip: !hasHandlebarsRuntime }, () => {
  const output = formatDiffWithTemplate(diff, {
    template: '{{> summaryPartial }}',
    partials: {
      summaryPartial: 'Added {{summary.added}} token(s); Removed {{summary.removed}} token(s)',
    },
  });

  assert.equal(
    output,
    `Added ${String(diff.summary.added)} token(s); Removed ${String(diff.summary.removed)} token(s)`,
  );
});

test(
  'formatDiffWithTemplate escapes template output by default',
  { skip: !hasHandlebarsRuntime },
  () => {
    const output = formatDiffWithTemplate(escapingDiff, {
      template: '{{diff.added.[0].next.description}}',
    });

    assert.equal(output, '&lt;script&gt;alert(1)&lt;/script&gt;');
  },
);

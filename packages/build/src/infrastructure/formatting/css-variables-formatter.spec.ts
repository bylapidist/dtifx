import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createCssVariablesFormatterFactory } from './css-variables-formatter.js';
import type { TokenSnapshot } from '../../session/resolution-session.js';
import {
  typographyToCssTransform,
  type TypographyCssTransformOutput,
} from '../../transform/typography-transforms.js';

function createToken(
  pointer: JsonPointer,
  type: FormatterToken['type'],
  transforms: ReadonlyMap<string, unknown>,
  value: unknown = undefined,
): FormatterToken {
  const snapshot = {
    pointer,
    token: { type, value },
  } as unknown as BuildTokenSnapshot;
  return {
    snapshot,
    pointer,
    type,
    value,
    transforms,
  } satisfies FormatterToken;
}

function createTypographyCssOutput(): TypographyCssTransformOutput {
  const snapshot = { pointer: '/typography/Body' } as unknown as TokenSnapshot;
  const result = typographyToCssTransform.run({
    snapshot,
    pointer: snapshot.pointer,
    type: 'typography',
    value: {
      fontSize: createFontDimensionReference(16, '/dimension/typography/fontSize'),
      lineHeight: createFontDimensionReference(24, '/dimension/typography/lineHeight'),
      letterSpacing: createFontDimensionReference(0.5, '/dimension/typography/letterSpacing'),
    },
  });

  if (!result) {
    throw new Error('Failed to generate typography CSS output for tests');
  }

  return result;
}

function createFontDimensionReference(value: number, pointer: string): unknown {
  return {
    $ref: pointer,
    fontDimensionReference: {
      pointer,
      value: { unit: 'pixel', value, dimensionType: 'length', fontScale: true },
    },
  };
}

describe('createCssVariablesFormatterFactory', () => {
  it('emits CSS custom properties for supported token types', async () => {
    const factory = createCssVariablesFormatterFactory();
    const entry = { name: 'css.variables', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/color/brand/primary',
        'color',
        new Map([
          [
            'color.toCss',
            {
              srgbHex: '#798940bf',
              oklch: {
                l: Number.parseFloat('0.6'),
                c: Number.parseFloat('0.1'),
                h: Number.parseFloat('120'),
                css: 'oklch(0.6000 0.1000 120.0000 / 0.7500)',
              },
              relativeLuminance: Number.parseFloat('0.222664'),
            },
          ],
        ]),
      ),
      createToken(
        '/dimension/Spacing Large',
        'dimension',
        new Map([['dimension.toRem', { rem: 2, css: '2rem' }]]),
      ),
      createToken(
        '/gradient/hero~1header',
        'gradient',
        new Map([['gradient.toCss', { css: 'linear-gradient(to bottom, #fff 0%, #000 100%)' }]]),
      ),
      createToken(
        '/typography/Body',
        'typography',
        new Map([['typography.toCss', createTypographyCssOutput()]]),
      ),
      createToken(
        '/shadow/Card/Default',
        'shadow',
        new Map([['shadow.toCss', { css: '0 4px 16px rgba(0, 0, 0, 0.4)' }]]),
      ),
      createToken(
        '/border/Card/Default',
        'border',
        new Map([['border.toCss', { css: '1px solid #000000' }]]),
      ),
      createToken(
        '/font/Sans Body',
        'font',
        new Map([
          [
            'font.toCss',
            {
              css: 'Inter, "Helvetica Neue", sans-serif',
              family: 'Inter',
              fallbacks: ['"Helvetica Neue"', 'sans-serif'],
            },
          ],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'tokens.css',
        contents:
          ':root {\n' +
          '  --color-brand-primary: oklch(0.6000 0.1000 120.0000 / 0.7500);\n' +
          '  --dimension-spacing-large: 2rem;\n' +
          '  --gradient-hero-header: linear-gradient(to bottom, #fff 0%, #000 100%);\n' +
          '  --typography-body-font-size: 16px;\n' +
          '  --typography-body-line-height: 24px;\n' +
          '  --typography-body-letter-spacing: 0.5px;\n' +
          '  --shadow-card-default: 0 4px 16px rgba(0, 0, 0, 0.4);\n' +
          '  --border-card-default: 1px solid #000000;\n' +
          '  --font-sans-body: Inter, "Helvetica Neue", sans-serif;\n' +
          '}\n',
        encoding: 'utf8',
        metadata: { declarationCount: 9 },
      },
    ]);
  });

  it('normalises camelCase pointer segments while preserving snake and kebab segments', async () => {
    const factory = createCssVariablesFormatterFactory();
    const entry = { name: 'css.variables', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/color/brandHighlight',
        'color',
        new Map([
          [
            'color.toCss',
            {
              oklch: { css: 'oklch(0.1 0.2 0.3)' },
            },
          ],
        ]),
      ),
      createToken(
        '/color/brand_highlight',
        'color',
        new Map([
          [
            'color.toCss',
            {
              oklch: { css: 'oklch(0.4 0.5 0.6)' },
            },
          ],
        ]),
      ),
      createToken(
        '/dimension/paddingX',
        'dimension',
        new Map([['dimension.toRem', { rem: 1, css: '1rem' }]]),
      ),
      createToken(
        '/dimension/padding-y',
        'dimension',
        new Map([['dimension.toRem', { rem: 2, css: '2rem' }]]),
      ),
      createToken(
        '/dimension/spacing4Tight',
        'dimension',
        new Map([['dimension.toRem', { rem: 3, css: '3rem' }]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toHaveLength(1);
    const contents = artifacts[0]?.contents ?? '';

    expect(contents).toContain('  --color-brand-highlight: oklch(0.1 0.2 0.3);');
    expect(contents).toContain('  --color-brand_highlight: oklch(0.4 0.5 0.6);');
    expect(contents).toContain('  --dimension-padding-x: 1rem;');
    expect(contents).toContain('  --dimension-padding-y: 2rem;');
    expect(contents).toContain('  --dimension-spacing-4-tight: 3rem;');
  });

  it('respects custom selector, filename, and prefix options', async () => {
    const factory = createCssVariablesFormatterFactory();
    const entry = {
      name: 'css.variables',
      output: {},
      options: { selector: '.theme-light', filename: 'light.css', prefix: 'ds' },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/color/brand/primary',
        'color',
        new Map([
          [
            'color.toCss',
            {
              srgbHex: '#4080bfcc',
              oklch: {
                l: Number.parseFloat('0.58555'),
                c: Number.parseFloat('0.118266'),
                h: Number.parseFloat('250.532374'),
                css: 'oklch(0.5856 0.1183 250.5324 / 0.8000)',
              },
              relativeLuminance: Number.parseFloat('0.201625'),
            },
          ],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'light.css',
        contents:
          '.theme-light {\n' +
          '  --ds-color-brand-primary: oklch(0.5856 0.1183 250.5324 / 0.8000);\n' +
          '}\n',
        encoding: 'utf8',
        metadata: { declarationCount: 1 },
      },
    ]);
  });

  it('omits artifacts when no declarations can be produced', async () => {
    const factory = createCssVariablesFormatterFactory();
    const entry = { name: 'css.variables', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [createToken('/color/missing', 'color', new Map())];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([]);
  });

  it('validates option types', () => {
    const factory = createCssVariablesFormatterFactory();
    const entry = {
      name: 'css.variables',
      output: {},
      options: { selector: '' },
    };
    const context = { config: {} as BuildConfig };

    expect(() => factory.create(entry, context)).toThrow(
      'Option "selector" for "css.variables" must be a non-empty string.',
    );
  });
});

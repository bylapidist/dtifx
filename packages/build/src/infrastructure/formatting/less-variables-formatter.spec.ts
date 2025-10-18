import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createLessVariablesFormatterFactory } from './less-variables-formatter.js';
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

describe('createLessVariablesFormatterFactory', () => {
  it('emits Less variables for supported token types', async () => {
    const factory = createLessVariablesFormatterFactory();
    const entry = { name: 'less.variables', output: {} };
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
              srgbHex: '#ff0000',
              oklch: { l: 0.5, c: 0.2, h: 120, css: 'oklch(0.5000 0.2000 120.0000)' },
              relativeLuminance: 0.4,
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
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'tokens.less',
        contents:
          '@color-brand-primary: oklch(0.5000 0.2000 120.0000);\n' +
          '@dimension-spacing-large: 2rem;\n' +
          '@gradient-hero-header: linear-gradient(to bottom, #fff 0%, #000 100%);\n' +
          '@typography-body-font-size: 16px;\n' +
          '@typography-body-line-height: 24px;\n' +
          '@typography-body-letter-spacing: 0.5px;\n' +
          '@shadow-card-default: 0 4px 16px rgba(0, 0, 0, 0.4);\n' +
          '@border-card-default: 1px solid #000000;\n',
        encoding: 'utf8',
        metadata: { declarationCount: 8 },
      },
    ]);
  });

  it('respects custom filename and prefix options', async () => {
    const factory = createLessVariablesFormatterFactory();
    const entry = {
      name: 'less.variables',
      output: {},
      options: { filename: 'tokens/variables.less', prefix: 'ds' },
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
              srgbHex: '#00ff00',
              oklch: { l: 0.6, c: 0.1, h: 90, css: 'oklch(0.6000 0.1000 90.0000)' },
              relativeLuminance: 0.5,
            },
          ],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'tokens/variables.less',
        contents: '@ds-color-brand-primary: oklch(0.6000 0.1000 90.0000);\n',
        encoding: 'utf8',
        metadata: { declarationCount: 1 },
      },
    ]);
  });

  it('omits artifacts when no declarations can be produced', async () => {
    const factory = createLessVariablesFormatterFactory();
    const entry = { name: 'less.variables', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [createToken('/color/missing', 'color', new Map())];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([]);
  });

  it('validates option types', () => {
    const factory = createLessVariablesFormatterFactory();
    const entry = {
      name: 'less.variables',
      output: {},
      options: { prefix: '' },
    };
    const context = { config: {} as BuildConfig };

    expect(() => factory.create(entry, context)).toThrow(
      'Formatter "less.variables" prefix must be a non-empty string when provided.',
    );
  });
});

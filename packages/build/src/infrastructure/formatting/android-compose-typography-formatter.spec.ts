import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { typographyToAndroidComposeTransform } from '../../transform/typography-transforms.js';
import { createAndroidComposeTypographyFormatterFactory } from './android-compose-typography-formatter.js';

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

describe('createAndroidComposeTypographyFormatterFactory', () => {
  it('emits Compose text styles for supported tokens', async () => {
    const factory = createAndroidComposeTypographyFormatterFactory();
    const entry = { name: 'android.compose.typography', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const pixelDimensions = {
      fontSize: { unit: 'pixel', value: 12, dimensionType: 'length' },
      lineHeight: { unit: 'pixel', value: 16, dimensionType: 'length' },
      letterSpacing: { unit: 'pixel', value: 0.5, dimensionType: 'length' },
    };

    const pixelMetadata = typographyToAndroidComposeTransform.run({
      value: pixelDimensions,
    } as never);

    if (!pixelMetadata) {
      throw new Error('Expected typography metadata for pixel dimensions');
    }

    const tokens: FormatterToken[] = [
      createToken(
        '/typography/body/regular',
        'typography',
        new Map([
          [
            'typography.toAndroidCompose',
            {
              fontFamily: 'Inter',
              fontWeight: '500',
              fontSize: { sp: 16 },
              lineHeight: { sp: 24 },
              letterSpacing: { sp: 0.5 },
            },
          ],
        ]),
      ),
      createToken(
        '/typography/caption/plain',
        'typography',
        new Map([['typography.toAndroidCompose', pixelMetadata]]),
      ),
      createToken(
        '/typography/heading/large',
        'typography',
        new Map([
          [
            'typography.toAndroidCompose',
            {
              fontSize: { sp: 32 },
              lineHeight: { multiplier: 1.2, literal: '1.2' },
            },
          ],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'src/main/java/com/example/tokens/ComposeTypographyTokens.kt',
        contents:
          'package com.example.tokens\n' +
          '\n' +
          'import androidx.compose.ui.text.TextStyle\n' +
          'import androidx.compose.ui.text.font.Font\n' +
          'import androidx.compose.ui.text.font.FontFamily\n' +
          'import androidx.compose.ui.text.font.FontWeight\n' +
          'import androidx.compose.ui.unit.em\n' +
          'import androidx.compose.ui.unit.sp\n' +
          '\n' +
          'object ComposeTypographyTokens {\n' +
          '  // /typography/body/regular\n' +
          '  val TypographyBodyRegular = TextStyle(\n' +
          '    fontFamily = FontFamily(Font(resId = R.font.inter)),\n' +
          '    fontWeight = FontWeight(500),\n' +
          '    fontSize = 16.sp,\n' +
          '    lineHeight = 24.sp,\n' +
          '    letterSpacing = 0.5.sp,\n' +
          '  )\n' +
          '\n' +
          '  // /typography/caption/plain\n' +
          '  val TypographyCaptionPlain = TextStyle(\n' +
          '    fontSize = 12.sp,\n' +
          '    lineHeight = 16.sp,\n' +
          '    letterSpacing = 0.5.sp,\n' +
          '  )\n' +
          '\n' +
          '  // /typography/heading/large\n' +
          '  val TypographyHeadingLarge = TextStyle(\n' +
          '    fontSize = 32.sp,\n' +
          '    lineHeight = 1.2.em,\n' +
          '  )\n' +
          '}\n',
        encoding: 'utf8',
        metadata: { typographyCount: 3 },
      },
    ]);
  });

  it('ensures identifiers remain unique when collisions occur', async () => {
    const factory = createAndroidComposeTypographyFormatterFactory();
    const entry = { name: 'android.compose.typography', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/typography/body/title',
        'typography',
        new Map([['typography.toAndroidCompose', { fontSize: { sp: 20 } }]]),
      ),
      createToken(
        '/typography/body_title',
        'typography',
        new Map([['typography.toAndroidCompose', { fontSize: { sp: 18 } }]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    const contents = artifacts[0]?.contents ?? '';
    expect(contents).toContain('val TypographyBodyTitle = TextStyle(');
    expect(contents).toContain('val TypographyBodyTitle2 = TextStyle(');
  });

  it('respects custom options', async () => {
    const factory = createAndroidComposeTypographyFormatterFactory();
    const entry = {
      name: 'android.compose.typography',
      output: {},
      options: {
        filename: 'src/main/kotlin/app/tokens/Typography.kt',
        packageName: 'app.tokens',
        objectName: 'TypographyTokens',
      },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/typography/body',
        'typography',
        new Map([['typography.toAndroidCompose', { fontSize: { sp: 14 } }]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts[0]?.path).toBe('src/main/kotlin/app/tokens/Typography.kt');
    expect(artifacts[0]?.contents).toContain('package app.tokens');
    expect(artifacts[0]?.contents).toContain('object TypographyTokens');
  });

  it('emits sp metrics when fontScale metadata is missing', async () => {
    const factory = createAndroidComposeTypographyFormatterFactory();
    const entry = { name: 'android.compose.typography', output: {} } as const;
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const dimensionsWithoutFontScale = {
      fontSize: { unit: 'pixel', value: 11, dimensionType: 'length' },
      lineHeight: { unit: 'pixel', value: 14, dimensionType: 'length' },
      letterSpacing: { unit: 'pixel', value: 0.35, dimensionType: 'length' },
    } as const;

    const metadata = typographyToAndroidComposeTransform.run({
      value: dimensionsWithoutFontScale,
    } as never);

    if (!metadata) {
      throw new Error('Expected typography metadata without fontScale');
    }

    const tokens: FormatterToken[] = [
      createToken(
        '/typography/body/compact',
        'typography',
        new Map([['typography.toAndroidCompose', metadata]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });
    const contents = artifacts[0]?.contents ?? '';

    expect(contents).toContain('fontSize = 11.sp');
    expect(contents).toContain('lineHeight = 14.sp');
    expect(contents).toContain('letterSpacing = 0.35.sp');
  });

  it('omits artifacts when no typography metadata is available', async () => {
    const factory = createAndroidComposeTypographyFormatterFactory();
    const entry = { name: 'android.compose.typography', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [createToken('/typography/missing', 'typography', new Map())];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([]);
  });
});

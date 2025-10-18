import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { typographyToAndroidMaterialTransform } from '../../transform/typography-transforms.js';
import { createAndroidMaterialTypographyFormatterFactory } from './android-material-typography-formatter.js';

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

describe('createAndroidMaterialTypographyFormatterFactory', () => {
  it('emits Kotlin artifacts describing typography tokens', async () => {
    const factory = createAndroidMaterialTypographyFormatterFactory();
    const entry = { name: 'android.material.typography', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const pixelDimensions = {
      fontSize: { unit: 'pixel', value: 13, dimensionType: 'length' },
      lineHeight: { unit: 'pixel', value: 18, dimensionType: 'length' },
      letterSpacing: { unit: 'pixel', value: 0.25, dimensionType: 'length' },
      paragraphSpacing: { unit: 'pixel', value: 10, dimensionType: 'length' },
    };

    const pixelMetadata = typographyToAndroidMaterialTransform.run({
      value: pixelDimensions,
    } as never);

    if (!pixelMetadata) {
      throw new Error('Expected typography metadata for pixel dimensions');
    }

    const tokens: FormatterToken[] = [
      createToken(
        '/typography/body/primary',
        'typography',
        new Map([
          [
            'typography.toAndroidMaterial',
            {
              fontFamily: 'Inter',
              fontWeight: '500',
              fontSize: { sp: 16, literal: '16sp' },
              lineHeight: { sp: 24, literal: '24sp' },
              letterSpacing: { sp: 0.5, literal: '0.5sp' },
              paragraphSpacing: { dp: 12, literal: '12dp' },
              textCase: 'uppercase',
              textTransform: 'capitalize',
            },
          ],
        ]),
      ),
      createToken(
        '/typography/caption/plain',
        'typography',
        new Map([['typography.toAndroidMaterial', pixelMetadata]]),
      ),
      createToken(
        '/typography/heading',
        'typography',
        new Map([
          [
            'typography.toAndroidMaterial',
            {
              fontSize: { sp: 32, literal: '32sp' },
              lineHeight: { multiplier: 1.25, literal: '1.25' },
            },
          ],
        ]),
      ),
      createToken('/color/primary', 'color', new Map()),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'src/main/java/com/example/tokens/TypographyTokens.kt',
        contents:
          'package com.example.tokens\n' +
          '\n' +
          'import androidx.compose.ui.unit.Dp\n' +
          'import androidx.compose.ui.unit.TextUnit\n' +
          'import androidx.compose.ui.unit.dp\n' +
          'import androidx.compose.ui.unit.em\n' +
          'import androidx.compose.ui.unit.sp\n' +
          '\n' +
          'data class AndroidTypographyToken(\n' +
          '    val fontFamily: String? = null,\n' +
          '    val fontWeight: Int? = null,\n' +
          '    val fontSize: TextUnit? = null,\n' +
          '    val lineHeight: TextUnit? = null,\n' +
          '    val letterSpacing: TextUnit? = null,\n' +
          '    val paragraphSpacing: Dp? = null,\n' +
          '    val textCase: String? = null,\n' +
          '    val textTransform: String? = null,\n' +
          ')\n' +
          '\n' +
          'object TypographyTokens {\n' +
          '  // /typography/body/primary\n' +
          '  val TypographyBodyPrimary = AndroidTypographyToken(\n' +
          '    fontFamily = "Inter",\n' +
          '    fontWeight = 500,\n' +
          '    fontSize = 16.sp,\n' +
          '    lineHeight = 24.sp,\n' +
          '    letterSpacing = 0.5.sp,\n' +
          '    paragraphSpacing = 12.dp,\n' +
          '    textCase = "uppercase",\n' +
          '    textTransform = "capitalize",\n' +
          '  )\n' +
          '\n' +
          '  // /typography/caption/plain\n' +
          '  val TypographyCaptionPlain = AndroidTypographyToken(\n' +
          '    fontSize = 13.sp,\n' +
          '    lineHeight = 18.sp,\n' +
          '    letterSpacing = 0.25.sp,\n' +
          '    paragraphSpacing = 10.dp,\n' +
          '  )\n' +
          '\n' +
          '  // /typography/heading\n' +
          '  val TypographyHeading = AndroidTypographyToken(\n' +
          '    fontSize = 32.sp,\n' +
          '    lineHeight = 1.25.em,\n' +
          '  )\n' +
          '}\n',
        encoding: 'utf8',
        metadata: { typographyCount: 3 },
      },
    ]);
  });

  it('respects formatter options for filenames and identifiers', async () => {
    const factory = createAndroidMaterialTypographyFormatterFactory();
    const entry = {
      name: 'android.material.typography',
      output: {},
      options: {
        filename: 'src/main/java/example/Typography.kt',
        packageName: 'example.tokens',
        objectName: 'ExampleTypography',
        dataClassName: 'ExampleTypographyToken',
      },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/typography/body',
        'typography',
        new Map([
          [
            'typography.toAndroidMaterial',
            {
              fontWeight: '400',
              fontSize: { sp: 14, literal: '14sp' },
            },
          ],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts[0]?.path).toBe('src/main/java/example/Typography.kt');
    expect(artifacts[0]?.contents).toContain('package example.tokens');
    expect(artifacts[0]?.contents).toContain('data class ExampleTypographyToken(');
    expect(artifacts[0]?.contents).toContain('object ExampleTypography');
  });

  it('serialises typography metadata when fontScale hints are absent', async () => {
    const factory = createAndroidMaterialTypographyFormatterFactory();
    const entry = { name: 'android.material.typography', output: {} } as const;
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const dimensionsWithoutFontScale = {
      fontSize: { unit: 'pixel', value: 15, dimensionType: 'length' },
      lineHeight: { unit: 'pixel', value: 21, dimensionType: 'length' },
      letterSpacing: { unit: 'pixel', value: 0.25, dimensionType: 'length' },
      paragraphSpacing: { unit: 'pixel', value: 9, dimensionType: 'length' },
    } as const;

    const metadata = typographyToAndroidMaterialTransform.run({
      value: dimensionsWithoutFontScale,
    } as never);

    if (!metadata) {
      throw new Error('Expected typography metadata without fontScale');
    }

    const tokens: FormatterToken[] = [
      createToken(
        '/typography/body/compact',
        'typography',
        new Map([['typography.toAndroidMaterial', metadata]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });
    const contents = artifacts[0]?.contents ?? '';

    expect(contents).toContain('fontSize = 15.sp');
    expect(contents).toContain('lineHeight = 21.sp');
    expect(contents).toContain('letterSpacing = 0.25.sp');
    expect(contents).toContain('paragraphSpacing = 9.dp');
  });

  it('omits artifacts when no typography metadata is available', async () => {
    const factory = createAndroidMaterialTypographyFormatterFactory();
    const entry = { name: 'android.material.typography', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [createToken('/typography/missing', 'typography', new Map())];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([]);
  });

  it('ensures identifier collisions are resolved deterministically', async () => {
    const factory = createAndroidMaterialTypographyFormatterFactory();
    const entry = { name: 'android.material.typography', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/Typography/Body',
        'typography',
        new Map([['typography.toAndroidMaterial', { fontSize: { sp: 16, literal: '16sp' } }]]),
      ),
      createToken(
        '/typography_body',
        'typography',
        new Map([['typography.toAndroidMaterial', { fontSize: { sp: 18, literal: '18sp' } }]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });
    const contents = artifacts[0]?.contents ?? '';

    expect(contents).toContain('val TypographyBody = AndroidTypographyToken(');
    expect(contents).toContain('val TypographyBody2 = AndroidTypographyToken(');
  });

  it('validates formatter options', () => {
    const factory = createAndroidMaterialTypographyFormatterFactory();
    const entry = {
      name: 'android.material.typography',
      output: {},
      options: {
        filename: '',
      },
    };
    const context = { config: {} as BuildConfig };

    expect(() => factory.create(entry, context)).toThrow(
      'Formatter "android.material.typography" filename must be a non-empty string.',
    );

    expect(() =>
      factory.create(
        {
          ...entry,
          options: { objectName: '123Invalid' },
        },
        context,
      ),
    ).toThrow(
      'Formatter "android.material.typography" objectName must be a valid Kotlin identifier string.',
    );
  });
});

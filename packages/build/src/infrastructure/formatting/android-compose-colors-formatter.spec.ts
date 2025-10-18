import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createAndroidComposeColorsFormatterFactory } from './android-compose-colors-formatter.js';

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

describe('createAndroidComposeColorsFormatterFactory', () => {
  it('emits Compose color objects for supported tokens', async () => {
    const factory = createAndroidComposeColorsFormatterFactory();
    const entry = { name: 'android.compose.colors', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/color/brand/Primary',
        'color',
        new Map([
          ['color.toAndroidComposeColor', { argbHex: '#FF336699', hexLiteral: '0xFF336699' }],
        ]),
      ),
      createToken(
        '/color/brand/Secondary',
        'color',
        new Map([
          ['color.toAndroidComposeColor', { argbHex: '#FF123456', hexLiteral: '0xFF123456' }],
        ]),
      ),
      createToken('/dimension/spacing', 'dimension', new Map()),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'src/main/java/com/example/tokens/ComposeColorTokens.kt',
        contents:
          'package com.example.tokens\n' +
          '\n' +
          'import androidx.compose.ui.graphics.Color\n' +
          '\n' +
          'object ComposeColorTokens {\n' +
          '  // /color/brand/Primary\n' +
          '  val ColorBrandPrimary = Color(0xFF336699)\n' +
          '\n' +
          '  // /color/brand/Secondary\n' +
          '  val ColorBrandSecondary = Color(0xFF123456)\n' +
          '}\n',
        encoding: 'utf8',
        metadata: { colorCount: 2 },
      },
    ]);
  });

  it('ensures identifiers remain unique when collisions occur', async () => {
    const factory = createAndroidComposeColorsFormatterFactory();
    const entry = { name: 'android.compose.colors', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/color/state/Primary',
        'color',
        new Map([
          ['color.toAndroidComposeColor', { argbHex: '#FF000000', hexLiteral: '0xFF000000' }],
        ]),
      ),
      createToken(
        '/color/state_primary',
        'color',
        new Map([
          ['color.toAndroidComposeColor', { argbHex: '#FFFFFFFF', hexLiteral: '0xFFFFFFFF' }],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    const contents = artifacts[0]?.contents ?? '';
    expect(contents).toContain('val ColorStatePrimary = Color(0xFFFFFFFF)');
    expect(contents).toContain('val ColorStatePrimary2 = Color(0xFF000000)');
  });

  it('respects custom options', async () => {
    const factory = createAndroidComposeColorsFormatterFactory();
    const entry = {
      name: 'android.compose.colors',
      output: {},
      options: {
        filename: 'src/main/kotlin/app/tokens/Colors.kt',
        packageName: 'app.tokens',
        objectName: 'ColorTokens',
      },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/color/theme',
        'color',
        new Map([
          ['color.toAndroidComposeColor', { argbHex: '#FF101010', hexLiteral: '0xFF101010' }],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts[0]?.path).toBe('src/main/kotlin/app/tokens/Colors.kt');
    expect(artifacts[0]?.contents).toContain('package app.tokens');
    expect(artifacts[0]?.contents).toContain('object ColorTokens');
  });

  it('omits artifacts when no color metadata is available', async () => {
    const factory = createAndroidComposeColorsFormatterFactory();
    const entry = { name: 'android.compose.colors', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [createToken('/color/missing', 'color', new Map())];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([]);
  });
});

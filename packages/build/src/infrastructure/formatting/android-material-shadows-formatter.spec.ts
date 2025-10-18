import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createAndroidMaterialShadowsFormatterFactory } from './android-material-shadows-formatter.js';

function createToken(
  pointer: JsonPointer,
  transforms: ReadonlyMap<string, unknown>,
  value: unknown = undefined,
): FormatterToken {
  const snapshot = {
    pointer,
    token: { type: 'shadow', value },
  } as unknown as BuildTokenSnapshot;
  return {
    snapshot,
    pointer,
    type: 'shadow',
    value,
    transforms,
  } satisfies FormatterToken;
}

describe('createAndroidMaterialShadowsFormatterFactory', () => {
  it('emits Kotlin shadow artifacts for supported tokens', async () => {
    const factory = createAndroidMaterialShadowsFormatterFactory();
    const entry = { name: 'android.material.shadows', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const invalidToken = createToken('/shadow/card/invalid' as JsonPointer, new Map());
    const tokens: FormatterToken[] = [
      createToken(
        '/shadow/card/default' as JsonPointer,
        new Map([
          [
            'shadow.toAndroidMaterial',
            {
              layers: [{ color: '#000000', x: 4, y: -8, radius: 12, spread: 1, opacity: 0.5 }],
            },
          ],
        ]),
      ),
      createToken(
        '/shadow/card/elevated' as JsonPointer,
        new Map([
          [
            'shadow.toAndroidMaterial',
            {
              layers: [
                { color: '#ffffff', x: 0, y: 6, radius: 4, spread: 8, opacity: 0.25 },
                { color: '#123456', x: 24, y: 2, radius: 10 },
              ],
            },
          ],
        ]),
      ),
      { ...invalidToken, transforms: new Map() },
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'src/main/java/com/example/tokens/ShadowTokens.kt',
        contents:
          'package com.example.tokens\n' +
          '\n' +
          'data class AndroidShadowLayer(\n' +
          '  val color: String,\n' +
          '  val x: Double,\n' +
          '  val y: Double,\n' +
          '  val radius: Double,\n' +
          '  val spread: Double? = null,\n' +
          '  val opacity: Double? = null,\n' +
          ')\n' +
          '\n' +
          'data class AndroidShadowToken(\n' +
          '  val layers: List<AndroidShadowLayer>,\n' +
          ')\n' +
          '\n' +
          'object ShadowTokens {\n' +
          '  // /shadow/card/default\n' +
          '  val ShadowCardDefault = AndroidShadowToken(\n' +
          '    layers = listOf(\n' +
          '      AndroidShadowLayer(color = "#000000", x = 4, y = -8, radius = 12, spread = 1, opacity = 0.5),\n' +
          '    ),\n' +
          '  )\n' +
          '  \n' +
          '  // /shadow/card/elevated\n' +
          '  val ShadowCardElevated = AndroidShadowToken(\n' +
          '    layers = listOf(\n' +
          '      AndroidShadowLayer(color = "#ffffff", x = 0, y = 6, radius = 4, spread = 8, opacity = 0.25),\n' +
          '      AndroidShadowLayer(color = "#123456", x = 24, y = 2, radius = 10),\n' +
          '    ),\n' +
          '  )\n' +
          '}\n' +
          '\n',
        encoding: 'utf8',
        metadata: { shadowCount: 2 },
      },
    ]);
  });

  it('ensures identifiers remain unique when collisions occur', async () => {
    const factory = createAndroidMaterialShadowsFormatterFactory();
    const entry = { name: 'android.material.shadows', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const heroShadow = { layers: [{ color: '#fff', x: 0, y: 2, radius: 4 }] };
    const heroShadowAlt = { layers: [{ color: '#000', x: 1, y: 3, radius: 6 }] };

    const tokens: FormatterToken[] = [
      createToken(
        '/shadow/card/Hero' as JsonPointer,
        new Map([['shadow.toAndroidMaterial', heroShadow]]),
      ),
      createToken(
        '/shadow/card-hero' as JsonPointer,
        new Map([['shadow.toAndroidMaterial', heroShadowAlt]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });
    const contents = artifacts[0]?.contents ?? '';

    expect(contents).toContain('val ShadowCardHero =');
    expect(contents).toContain('val ShadowCardHero2 =');
  });

  it('supports custom formatter options', async () => {
    const factory = createAndroidMaterialShadowsFormatterFactory();
    const entry = {
      name: 'android.material.shadows',
      output: {},
      options: {
        filename: 'src/main/java/com/example/design/Shadows.kt',
        packageName: 'com.example.design',
        objectName: 'DesignShadows',
        dataClassName: 'DesignShadowToken',
        layerClassName: 'DesignShadowLayer',
      },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const defaultShadow = { layers: [{ color: '#000000', x: 4, y: -8, radius: 12 }] };

    const tokens: FormatterToken[] = [
      createToken(
        '/shadow/card/default' as JsonPointer,
        new Map([['shadow.toAndroidMaterial', defaultShadow]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts[0]).toMatchObject({
      path: 'src/main/java/com/example/design/Shadows.kt',
    });
    expect(artifacts[0]?.contents).toContain('package com.example.design');
    expect(artifacts[0]?.contents).toContain('object DesignShadows');
    expect(artifacts[0]?.contents).toContain('DesignShadowToken(');
    expect(artifacts[0]?.contents).toContain('List<DesignShadowLayer>');
  });

  it('omits artifacts when no shadow metadata is available', async () => {
    const factory = createAndroidMaterialShadowsFormatterFactory();
    const entry = { name: 'android.material.shadows', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken('/shadow/card/missing' as JsonPointer, new Map()),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([]);
  });

  it('validates formatter options', () => {
    const factory = createAndroidMaterialShadowsFormatterFactory();
    const entry = {
      name: 'android.material.shadows',
      output: {},
      options: {
        objectName: '123Invalid',
      },
    };
    const context = { config: {} as BuildConfig };

    expect(() => factory.create(entry, context)).toThrow(
      'Formatter "android.material.shadows" objectName must be a valid Kotlin identifier string.',
    );
  });
});

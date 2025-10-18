import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createAndroidMaterialGradientsFormatterFactory } from './android-material-gradients-formatter.js';

function createToken(
  pointer: JsonPointer,
  transforms: ReadonlyMap<string, unknown>,
  value: unknown = undefined,
): FormatterToken {
  const snapshot = {
    pointer,
    token: { type: 'gradient', value },
  } as unknown as BuildTokenSnapshot;
  return {
    snapshot,
    pointer,
    type: 'gradient',
    value,
    transforms,
  } satisfies FormatterToken;
}

describe('createAndroidMaterialGradientsFormatterFactory', () => {
  it('emits Kotlin gradient artifacts for supported tokens', async () => {
    const factory = createAndroidMaterialGradientsFormatterFactory();
    const entry = { name: 'android.material.gradients', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const invalidToken = createToken('/gradient/background/invalid' as JsonPointer, new Map());
    const tokens: FormatterToken[] = [
      createToken(
        '/gradient/background/hero' as JsonPointer,
        new Map([
          [
            'gradient.toAndroidMaterial',
            {
              kind: 'linear',
              angle: 270,
              stops: [
                { color: '#ff0000', position: 0 },
                { color: '#00ff00', position: 0.5 },
                { color: '#0000ff' },
              ],
            },
          ],
        ]),
      ),
      createToken(
        '/gradient/background/overlay' as JsonPointer,
        new Map([
          [
            'gradient.toAndroidMaterial',
            {
              kind: 'radial',
              stops: [
                { color: 'rgba(0, 0, 0, 0.2)', position: 0.25, easing: 'ease-in-out' },
                { color: 'rgba(0, 0, 0, 0)', position: 1 },
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
        path: 'src/main/java/com/example/tokens/GradientTokens.kt',
        contents:
          'package com.example.tokens\n' +
          '\n' +
          'data class AndroidGradientStop(\n' +
          '  val color: String,\n' +
          '  val position: Double? = null,\n' +
          '  val easing: String? = null,\n' +
          ')\n' +
          '\n' +
          'enum class AndroidGradientKind {\n' +
          '  Linear,\n' +
          '  Radial,\n' +
          '}\n' +
          '\n' +
          'data class AndroidGradientToken(\n' +
          '  val kind: AndroidGradientKind,\n' +
          '  val angle: Double? = null,\n' +
          '  val stops: List<AndroidGradientStop>,\n' +
          ')\n' +
          '\n' +
          'object GradientTokens {\n' +
          '  // /gradient/background/hero\n' +
          '  val GradientBackgroundHero = AndroidGradientToken(\n' +
          '    kind = AndroidGradientKind.Linear,\n' +
          '    angle = 270,\n' +
          '    stops = listOf(\n' +
          '      AndroidGradientStop(color = "#ff0000", position = 0),\n' +
          '      AndroidGradientStop(color = "#00ff00", position = 0.5),\n' +
          '      AndroidGradientStop(color = "#0000ff"),\n' +
          '    ),\n' +
          '  )\n' +
          '  \n' +
          '  // /gradient/background/overlay\n' +
          '  val GradientBackgroundOverlay = AndroidGradientToken(\n' +
          '    kind = AndroidGradientKind.Radial,\n' +
          '    stops = listOf(\n' +
          '      AndroidGradientStop(color = "rgba(0, 0, 0, 0.2)", position = 0.25, easing = "ease-in-out"),\n' +
          '      AndroidGradientStop(color = "rgba(0, 0, 0, 0)", position = 1),\n' +
          '    ),\n' +
          '  )\n' +
          '}\n' +
          '\n',
        encoding: 'utf8',
        metadata: { gradientCount: 2 },
      },
    ]);
  });

  it('ensures identifiers remain unique when collisions occur', async () => {
    const factory = createAndroidMaterialGradientsFormatterFactory();
    const entry = { name: 'android.material.gradients', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/gradient/background/Hero' as JsonPointer,
        new Map([
          [
            'gradient.toAndroidMaterial',
            {
              kind: 'linear',
              stops: [
                { color: '#fff', position: 0 },
                { color: '#000', position: 1 },
              ],
            },
          ],
        ]),
      ),
      createToken(
        '/gradient/background-hero' as JsonPointer,
        new Map([
          [
            'gradient.toAndroidMaterial',
            {
              kind: 'linear',
              stops: [
                { color: '#000', position: 0 },
                { color: '#fff', position: 1 },
              ],
            },
          ],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });
    const contents = artifacts[0]?.contents ?? '';

    expect(contents).toContain('val GradientBackgroundHero =');
    expect(contents).toContain('val GradientBackgroundHero2 =');
  });

  it('supports custom formatter options', async () => {
    const factory = createAndroidMaterialGradientsFormatterFactory();
    const entry = {
      name: 'android.material.gradients',
      output: {},
      options: {
        filename: 'src/main/java/com/example/design/Gradients.kt',
        packageName: 'com.example.design',
        objectName: 'DesignGradients',
        dataClassName: 'DesignGradientToken',
        stopClassName: 'DesignGradientStop',
        kindEnumName: 'DesignGradientKind',
      },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/gradient/background/hero' as JsonPointer,
        new Map([
          [
            'gradient.toAndroidMaterial',
            {
              kind: 'linear',
              angle: 90,
              stops: [{ color: '#fff', position: 0 }],
            },
          ],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts[0]).toMatchObject({
      path: 'src/main/java/com/example/design/Gradients.kt',
    });
    expect(artifacts[0]?.contents).toContain('package com.example.design');
    expect(artifacts[0]?.contents).toContain('object DesignGradients');
    expect(artifacts[0]?.contents).toContain('DesignGradientToken(');
    expect(artifacts[0]?.contents).toContain('List<DesignGradientStop>');
    expect(artifacts[0]?.contents).toContain('DesignGradientKind.Linear');
  });

  it('omits artifacts when no gradient metadata is available', async () => {
    const factory = createAndroidMaterialGradientsFormatterFactory();
    const entry = { name: 'android.material.gradients', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken('/gradient/background/missing' as JsonPointer, new Map()),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([]);
  });

  it('validates formatter options', () => {
    const factory = createAndroidMaterialGradientsFormatterFactory();
    const entry = {
      name: 'android.material.gradients',
      output: {},
      options: {
        filename: '',
      },
    };
    const context = { config: {} as BuildConfig };

    expect(() => factory.create(entry, context)).toThrow(
      'Formatter "android.material.gradients" filename must be a non-empty string.',
    );
  });
});

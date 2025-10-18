import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createAndroidComposeShapesFormatterFactory } from './android-compose-shapes-formatter.js';

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

describe('createAndroidComposeShapesFormatterFactory', () => {
  it('emits Compose rounded corner shapes for supported tokens', async () => {
    const factory = createAndroidComposeShapesFormatterFactory();
    const entry = { name: 'android.compose.shapes', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/border/card/rounded',
        'border',
        new Map([
          [
            'border.toAndroidComposeShape',
            { corners: { topLeft: 16, topRight: 16, bottomRight: 16, bottomLeft: 16 } },
          ],
        ]),
      ),
      createToken(
        '/border/dialog/asymmetric',
        'border',
        new Map([
          [
            'border.toAndroidComposeShape',
            { corners: { topLeft: 24, topRight: 12, bottomRight: 0, bottomLeft: 12 } },
          ],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'src/main/java/com/example/tokens/ComposeShapeTokens.kt',
        contents:
          'package com.example.tokens\n' +
          '\n' +
          'import androidx.compose.foundation.shape.RoundedCornerShape\n' +
          'import androidx.compose.ui.unit.dp\n' +
          '\n' +
          'object ComposeShapeTokens {\n' +
          '  // /border/card/rounded\n' +
          '  val BorderCardRounded = RoundedCornerShape(16.dp)\n' +
          '\n' +
          '  // /border/dialog/asymmetric\n' +
          '  val BorderDialogAsymmetric = RoundedCornerShape(topStart = 24.dp, topEnd = 12.dp, bottomEnd = 0.dp, bottomStart = 12.dp)\n' +
          '}\n',
        encoding: 'utf8',
        metadata: { shapeCount: 2 },
      },
    ]);
  });

  it('ensures identifiers remain unique when collisions occur', async () => {
    const factory = createAndroidComposeShapesFormatterFactory();
    const entry = { name: 'android.compose.shapes', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/border/component/shape',
        'border',
        new Map([['border.toAndroidComposeShape', { corners: { topLeft: 8 } }]]),
      ),
      createToken(
        '/border/component_shape',
        'border',
        new Map([['border.toAndroidComposeShape', { corners: { topLeft: 4 } }]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    const contents = artifacts[0]?.contents ?? '';
    expect(contents).toContain(
      'val BorderComponentShape = RoundedCornerShape(topStart = 4.dp, topEnd = 0.dp, bottomEnd = 0.dp, bottomStart = 0.dp)',
    );
    expect(contents).toContain(
      'val BorderComponentShape2 = RoundedCornerShape(topStart = 8.dp, topEnd = 0.dp, bottomEnd = 0.dp, bottomStart = 0.dp)',
    );
  });

  it('respects custom options', async () => {
    const factory = createAndroidComposeShapesFormatterFactory();
    const entry = {
      name: 'android.compose.shapes',
      output: {},
      options: {
        filename: 'src/main/kotlin/app/tokens/Shapes.kt',
        packageName: 'app.tokens',
        objectName: 'ShapeTokens',
      },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/border/app',
        'border',
        new Map([['border.toAndroidComposeShape', { corners: { topLeft: 6, topRight: 6 } }]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts[0]?.path).toBe('src/main/kotlin/app/tokens/Shapes.kt');
    expect(artifacts[0]?.contents).toContain('package app.tokens');
    expect(artifacts[0]?.contents).toContain('object ShapeTokens');
  });

  it('omits artifacts when no shape metadata is available', async () => {
    const factory = createAndroidComposeShapesFormatterFactory();
    const entry = { name: 'android.compose.shapes', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [createToken('/border/missing', 'border', new Map())];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([]);
  });
});

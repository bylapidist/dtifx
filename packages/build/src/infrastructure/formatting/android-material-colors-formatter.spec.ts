import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createAndroidMaterialColorsFormatterFactory } from './android-material-colors-formatter.js';

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

describe('createAndroidMaterialColorsFormatterFactory', () => {
  it('emits Android XML color resources for supported tokens', async () => {
    const factory = createAndroidMaterialColorsFormatterFactory();
    const entry = { name: 'android.material.colors', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/color/brand/Primary',
        'color',
        new Map([
          [
            'color.toAndroidArgb',
            { alpha: 255, red: 255, green: 0, blue: 0, argbHex: '#FFFF0000' },
          ],
        ]),
      ),
      createToken(
        '/color/brand/Secondary',
        'color',
        new Map([
          [
            'color.toAndroidArgb',
            { alpha: 128, red: 32, green: 64, blue: 128, argbHex: '#80204080' },
          ],
        ]),
      ),
      createToken(
        '/color/brandHighlight',
        'color',
        new Map([
          [
            'color.toAndroidArgb',
            { alpha: 255, red: 0, green: 255, blue: 0, argbHex: '#FF00FF00' },
          ],
        ]),
      ),
      createToken('/dimension/spacing', 'dimension', new Map()),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'values/colors.xml',
        contents:
          '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<resources>\n' +
          '    <color name="color_brand_primary">#ffff0000</color>\n' +
          '    <color name="color_brand_secondary">#80204080</color>\n' +
          '    <color name="color_brand_highlight">#ff00ff00</color>\n' +
          '</resources>\n',
        encoding: 'utf8',
        metadata: { colorCount: 3 },
      },
    ]);
  });

  it('ensures resource names remain unique when collisions occur', async () => {
    const factory = createAndroidMaterialColorsFormatterFactory();
    const entry = { name: 'android.material.colors', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/color/State/Primary',
        'color',
        new Map([
          [
            'color.toAndroidArgb',
            {
              alpha: 255,
              red: 0,
              green: 0,
              blue: 0,
              argbHex: '#FF000000',
            },
          ],
        ]),
      ),
      createToken(
        '/color/state-primary',
        'color',
        new Map([
          [
            'color.toAndroidArgb',
            {
              alpha: 255,
              red: 255,
              green: 255,
              blue: 255,
              argbHex: '#FFFFFFFF',
            },
          ],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    const contents = artifacts[0]?.contents ?? '';
    expect(contents).toContain('name="color_state_primary"');
    expect(contents).toContain('name="color_state_primary_2"');
    expect(contents).toContain('#ff000000');
    expect(contents).toContain('#ffffffff');
  });

  it('respects custom filenames via formatter options', async () => {
    const factory = createAndroidMaterialColorsFormatterFactory();
    const entry = {
      name: 'android.material.colors',
      output: {},
      options: { filename: 'res/values/colors-dark.xml' },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/color/brand/dark',
        'color',
        new Map([
          ['color.toAndroidArgb', { alpha: 255, red: 0, green: 0, blue: 0, argbHex: '#FF000000' }],
        ]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts[0]?.path).toBe('res/values/colors-dark.xml');
  });

  it('omits artifacts when no color metadata is available', async () => {
    const factory = createAndroidMaterialColorsFormatterFactory();
    const entry = { name: 'android.material.colors', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [createToken('/color/brand/missing', 'color', new Map())];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([]);
  });

  it('validates option types', () => {
    const factory = createAndroidMaterialColorsFormatterFactory();
    const entry = {
      name: 'android.material.colors',
      output: {},
      options: { filename: '' },
    };
    const context = { config: {} as BuildConfig };

    expect(() => factory.create(entry, context)).toThrow(
      'Formatter "android.material.colors" filename must be a non-empty string.',
    );
  });
});

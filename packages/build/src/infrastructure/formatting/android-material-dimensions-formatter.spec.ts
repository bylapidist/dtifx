import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createAndroidMaterialDimensionsFormatterFactory } from './android-material-dimensions-formatter.js';

function createToken(
  pointer: JsonPointer,
  transforms: ReadonlyMap<string, unknown>,
  value: unknown = undefined,
): FormatterToken {
  const snapshot = {
    pointer,
    token: { type: 'dimension', value },
  } as unknown as BuildTokenSnapshot;
  return {
    snapshot,
    pointer,
    type: 'dimension',
    value,
    transforms,
  } satisfies FormatterToken;
}

describe('createAndroidMaterialDimensionsFormatterFactory', () => {
  it('emits Android XML dimension resources for supported tokens', async () => {
    const factory = createAndroidMaterialDimensionsFormatterFactory();
    const entry = { name: 'android.material.dimensions', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/dimension/spacing/extraWide' as JsonPointer,
        new Map([['dimension.toAndroidDp', { dp: 48, literal: '48dp' }]]),
      ),
      createToken(
        '/dimension/spacing/large' as JsonPointer,
        new Map([
          ['dimension.toAndroidDp', { dp: 24, literal: '24dp' }],
          ['dimension.toAndroidSp', { sp: 24, literal: '24sp' }],
        ]),
      ),
      createToken(
        '/dimension/typography/body' as JsonPointer,
        new Map([['dimension.toAndroidSp', { sp: 16, literal: '16sp' }]]),
      ),
      {
        ...createToken('/dimension/spacing/missing' as JsonPointer, new Map()),
        transforms: new Map(),
      },
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'values/dimens.xml',
        contents:
          '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<resources>\n' +
          '    <dimen name="dimension_spacing_extra_wide">48dp</dimen>\n' +
          '    <dimen name="dimension_spacing_large">24dp</dimen>\n' +
          '    <dimen name="dimension_typography_body">16sp</dimen>\n' +
          '</resources>\n',
        encoding: 'utf8',
        metadata: { dimensionCount: 3 },
      },
    ]);
  });

  it('ensures resource names remain unique when collisions occur', async () => {
    const factory = createAndroidMaterialDimensionsFormatterFactory();
    const entry = { name: 'android.material.dimensions', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/dimension/Spacing/Body' as JsonPointer,
        new Map([['dimension.toAndroidDp', { dp: 20, literal: '20dp' }]]),
      ),
      createToken(
        '/dimension/spacing-body' as JsonPointer,
        new Map([['dimension.toAndroidDp', { dp: 16, literal: '16dp' }]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    const contents = artifacts[0]?.contents ?? '';
    expect(contents).toContain('name="dimension_spacing_body"');
    expect(contents).toContain('name="dimension_spacing_body_2"');
    expect(contents).toContain('20dp');
    expect(contents).toContain('16dp');
  });

  it('respects custom filenames via formatter options', async () => {
    const factory = createAndroidMaterialDimensionsFormatterFactory();
    const entry = {
      name: 'android.material.dimensions',
      output: {},
      options: { filename: 'res/values/dimens-v2.xml' },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '/dimension/spacing/base' as JsonPointer,
        new Map([['dimension.toAndroidDp', { dp: 16, literal: '16dp' }]]),
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts[0]?.path).toBe('res/values/dimens-v2.xml');
  });

  it('omits artifacts when no dimension metadata is available', async () => {
    const factory = createAndroidMaterialDimensionsFormatterFactory();
    const entry = { name: 'android.material.dimensions', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken('/dimension/spacing/missing' as JsonPointer, new Map()),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([]);
  });

  it('validates option types', () => {
    const factory = createAndroidMaterialDimensionsFormatterFactory();
    const entry = {
      name: 'android.material.dimensions',
      output: {},
      options: { filename: '' },
    };
    const context = { config: {} as BuildConfig };

    expect(() => factory.create(entry, context)).toThrow(
      'Formatter "android.material.dimensions" filename must be a non-empty string.',
    );
  });
});

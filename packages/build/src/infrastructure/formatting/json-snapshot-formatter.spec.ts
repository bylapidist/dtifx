import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createJsonSnapshotFormatterFactory } from './json-snapshot-formatter.js';

function createToken(
  pointer: JsonPointer,
  token: Record<string, unknown>,
  value: unknown = token['value'],
): FormatterToken {
  const snapshot = {
    pointer,
    token,
  } as unknown as BuildTokenSnapshot;
  return {
    snapshot,
    pointer,
    value,
    transforms: new Map<string, unknown>(),
  } satisfies FormatterToken;
}

describe('createJsonSnapshotFormatterFactory', () => {
  it('emits a flattened snapshot document for all tokens', async () => {
    const factory = createJsonSnapshotFormatterFactory();
    const entry = { name: 'json.snapshot', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken('#/tokens/library/color/primary', {
        id: 'color.primary',
        pointer: '#/tokens/library/color/primary',
        type: 'color',
        value: { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' },
      }),
      createToken('#/tokens/library/size/spacing-large', {
        id: 'dimension.spacing-large',
        pointer: '#/tokens/library/size/spacing-large',
        type: 'dimension',
        value: { unit: 'rem', value: 1.5, dimensionType: 'length' },
      }),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'tokens.json',
        contents:
          '{\n' +
          '  "tokens": {\n' +
          '    "library": {\n' +
          '      "color": {\n' +
          '        "primary": {\n' +
          '          "id": "color.primary",\n' +
          '          "pointer": "#/tokens/library/color/primary",\n' +
          '          "type": "color",\n' +
          '          "value": {\n' +
          '            "colorSpace": "srgb",\n' +
          '            "components": [\n' +
          '              1,\n' +
          '              0,\n' +
          '              0\n' +
          '            ],\n' +
          '            "hex": "#ff0000"\n' +
          '          }\n' +
          '        }\n' +
          '      },\n' +
          '      "size": {\n' +
          '        "spacing-large": {\n' +
          '          "id": "dimension.spacing-large",\n' +
          '          "pointer": "#/tokens/library/size/spacing-large",\n' +
          '          "type": "dimension",\n' +
          '          "value": {\n' +
          '            "unit": "rem",\n' +
          '            "value": 1.5,\n' +
          '            "dimensionType": "length"\n' +
          '          }\n' +
          '        }\n' +
          '      }\n' +
          '    }\n' +
          '  }\n' +
          '}\n',
        encoding: 'utf8',
        metadata: { tokenCount: 2 },
      },
    ]);
  });

  it('respects custom filename and indent options', async () => {
    const factory = createJsonSnapshotFormatterFactory();
    const entry = {
      name: 'json.snapshot',
      output: {},
      options: { filename: 'snapshots/library.json', indent: 0 },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken('#/tokens/library/color/primary', {
        id: 'color.primary',
        pointer: '#/tokens/library/color/primary',
        type: 'color',
        value: { colorSpace: 'srgb', components: [0, 0, 0] },
      }),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toStrictEqual([
      {
        path: 'snapshots/library.json',
        contents:
          '{"tokens":{"library":{"color":{"primary":{"id":"color.primary","pointer":"#/tokens/library/color/primary","type":"color","value":{"colorSpace":"srgb","components":[0,0,0]}}}}}}\n',
        encoding: 'utf8',
        metadata: { tokenCount: 1 },
      },
    ]);
  });

  it('omits artifacts when no tokens match', async () => {
    const factory = createJsonSnapshotFormatterFactory();
    const entry = { name: 'json.snapshot', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const artifacts = await definition.run({ tokens: [] });

    expect(artifacts).toStrictEqual([]);
  });

  it('validates option types', () => {
    const factory = createJsonSnapshotFormatterFactory();
    const entry = {
      name: 'json.snapshot',
      output: {},
      options: { indent: -1 },
    };
    const context = { config: {} as BuildConfig };

    expect(() => factory.create(entry, context)).toThrow(
      'Option "indent" for "json.snapshot" must be an integer between 0 and 10. Received -1.',
    );
  });
});

import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createJavascriptModuleFormatterFactory } from './javascript-module-formatter.js';

function createToken(
  pointer: JsonPointer,
  token: Record<string, unknown>,
  options: {
    readonly value?: unknown;
    readonly transforms?: ReadonlyMap<string, unknown>;
    readonly metadata?: FormatterToken['metadata'];
  } = {},
): FormatterToken {
  const snapshot = {
    pointer,
    token,
    ...(options.metadata === undefined ? undefined : { metadata: options.metadata }),
  } as unknown as BuildTokenSnapshot;
  return {
    snapshot,
    pointer,
    value: options.value ?? token['value'],
    transforms: options.transforms ?? new Map<string, unknown>(),
    ...(options.metadata === undefined ? undefined : { metadata: options.metadata }),
  } satisfies FormatterToken;
}

describe('createJavascriptModuleFormatterFactory', () => {
  it('emits JavaScript modules and declarations with default options', async () => {
    const factory = createJavascriptModuleFormatterFactory();
    const entry = { name: 'javascript.module', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken('#/tokens/library/color/primary', {
        id: 'color.primary',
        pointer: '#/tokens/library/color/primary',
        type: 'color',
        value: { colorSpace: 'srgb', components: [1, 0, 0] },
      }),
      createToken('#/tokens/library/size/spacing-large', {
        id: 'dimension.spacing-large',
        pointer: '#/tokens/library/size/spacing-large',
        type: 'dimension',
        value: { unit: 'rem', value: 1.5, dimensionType: 'length' },
      }),
    ];

    const artifacts = await definition.run({ tokens });

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).toEqual({
      path: 'tokens.js',
      contents:
        'export const tokens = {\n' +
        '  tokens: {\n' +
        '    library: {\n' +
        '      color: {\n' +
        '        primary: {\n' +
        '          id: "color.primary",\n' +
        '          pointer: "#/tokens/library/color/primary",\n' +
        '          type: "color",\n' +
        '          value: {\n' +
        '            colorSpace: "srgb",\n' +
        '            components: [\n' +
        '              1,\n' +
        '              0,\n' +
        '              0\n' +
        '            ]\n' +
        '          }\n' +
        '        }\n' +
        '      },\n' +
        '      size: {\n' +
        '        "spacing-large": {\n' +
        '          id: "dimension.spacing-large",\n' +
        '          pointer: "#/tokens/library/size/spacing-large",\n' +
        '          type: "dimension",\n' +
        '          value: {\n' +
        '            dimensionType: "length",\n' +
        '            unit: "rem",\n' +
        '            value: 1.5\n' +
        '          }\n' +
        '        }\n' +
        '      }\n' +
        '    }\n' +
        '  }\n' +
        '};\n' +
        'export default tokens;\n',
      encoding: 'utf8',
      metadata: { language: 'javascript', namedExportCount: 0, role: 'module', tokenCount: 2 },
    });
    expect(artifacts[1]).toEqual({
      path: 'tokens.d.ts',
      contents:
        'export declare const tokens: {\n' +
        '  readonly tokens: {\n' +
        '    readonly library: {\n' +
        '      readonly color: {\n' +
        '        readonly primary: {\n' +
        '          readonly id: "color.primary";\n' +
        '          readonly pointer: "#/tokens/library/color/primary";\n' +
        '          readonly type: "color";\n' +
        '          readonly value: {\n' +
        '            readonly colorSpace: "srgb";\n' +
        '            readonly components: readonly [\n' +
        '              1,\n' +
        '              0,\n' +
        '              0\n' +
        '            ];\n' +
        '          };\n' +
        '        };\n' +
        '      };\n' +
        '      readonly size: {\n' +
        '        readonly "spacing-large": {\n' +
        '          readonly id: "dimension.spacing-large";\n' +
        '          readonly pointer: "#/tokens/library/size/spacing-large";\n' +
        '          readonly type: "dimension";\n' +
        '          readonly value: {\n' +
        '            readonly dimensionType: "length";\n' +
        '            readonly unit: "rem";\n' +
        '            readonly value: 1.5;\n' +
        '          };\n' +
        '        };\n' +
        '      };\n' +
        '    };\n' +
        '  };\n' +
        '};\n' +
        'export default tokens;\n' +
        'export type TokenModule = typeof tokens;\n',
      encoding: 'utf8',
      metadata: { language: 'typescript', namedExportCount: 0, role: 'declaration', tokenCount: 2 },
    });
  });

  it('respects custom options, named exports, and transform selections', async () => {
    const factory = createJavascriptModuleFormatterFactory();
    const entry = {
      name: 'javascript.module',
      output: {},
      options: {
        filename: 'modules/tokens.js',
        rootIdentifier: 'libraryTokens',
        namedExports: true,
        transforms: ['dimension.toRem'],
      },
    } as const;
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '#/tokens/library/size/spacing-large',
        {
          id: 'dimension.spacing-large',
          pointer: '#/tokens/library/size/spacing-large',
          type: 'dimension',
          value: { unit: 'rem', value: 1.5 },
        },
        {
          transforms: new Map([
            ['dimension.toRem', { rem: 1.5, css: '1.5rem' }],
            ['dimension.toPx', { px: 24 }],
          ]),
          metadata: { tags: ['spacing'] },
        },
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(definition.selector.transforms).toEqual(['dimension.toRem']);
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).toEqual({
      path: 'modules/tokens.js',
      contents:
        'export const libraryTokens = {\n' +
        '  tokens: {\n' +
        '    library: {\n' +
        '      size: {\n' +
        '        "spacing-large": {\n' +
        '          id: "dimension.spacing-large",\n' +
        '          metadata: {\n' +
        '            tags: [\n' +
        '              "spacing"\n' +
        '            ]\n' +
        '          },\n' +
        '          pointer: "#/tokens/library/size/spacing-large",\n' +
        '          transforms: {\n' +
        '            "dimension.toRem": {\n' +
        '              css: "1.5rem",\n' +
        '              rem: 1.5\n' +
        '            }\n' +
        '          },\n' +
        '          type: "dimension",\n' +
        '          value: {\n' +
        '            unit: "rem",\n' +
        '            value: 1.5\n' +
        '          }\n' +
        '        }\n' +
        '      }\n' +
        '    }\n' +
        '  }\n' +
        '};\n' +
        'export const tokens = libraryTokens.tokens;\n' +
        'export default libraryTokens;\n',
      encoding: 'utf8',
      metadata: { language: 'javascript', namedExportCount: 1, role: 'module', tokenCount: 1 },
    });
    expect(artifacts[1]).toEqual({
      path: 'modules/tokens.d.ts',
      contents:
        'export declare const libraryTokens: {\n' +
        '  readonly tokens: {\n' +
        '    readonly library: {\n' +
        '      readonly size: {\n' +
        '        readonly "spacing-large": {\n' +
        '          readonly id: "dimension.spacing-large";\n' +
        '          readonly metadata: {\n' +
        '            readonly tags: readonly [\n' +
        '              "spacing"\n' +
        '            ];\n' +
        '          };\n' +
        '          readonly pointer: "#/tokens/library/size/spacing-large";\n' +
        '          readonly transforms: {\n' +
        '            readonly "dimension.toRem": {\n' +
        '              readonly css: "1.5rem";\n' +
        '              readonly rem: 1.5;\n' +
        '            };\n' +
        '          };\n' +
        '          readonly type: "dimension";\n' +
        '          readonly value: {\n' +
        '            readonly unit: "rem";\n' +
        '            readonly value: 1.5;\n' +
        '          };\n' +
        '        };\n' +
        '      };\n' +
        '    };\n' +
        '  };\n' +
        '};\n' +
        'export declare const tokens: typeof libraryTokens.tokens;\n' +
        'export default libraryTokens;\n' +
        'export type TokenModule = typeof libraryTokens;\n',
      encoding: 'utf8',
      metadata: { language: 'typescript', namedExportCount: 1, role: 'declaration', tokenCount: 1 },
    });
  });

  it('validates option types and filename extensions', () => {
    const factory = createJavascriptModuleFormatterFactory();

    expect(() =>
      factory.create(
        { name: 'javascript.module', output: {}, options: { filename: 'tokens.mjs' } },
        { config: {} as BuildConfig },
      ),
    ).toThrow('Option "filename" for "javascript.module" must end with ".js".');
    expect(() =>
      factory.create(
        { name: 'javascript.module', output: {}, options: { rootIdentifier: '123tokens' } },
        { config: {} as BuildConfig },
      ),
    ).toThrow(
      'Formatter "javascript.module" rootIdentifier must be a valid JavaScript identifier string.',
    );
    expect(() =>
      factory.create(
        { name: 'javascript.module', output: {}, options: { namedExports: 'yes' } },
        { config: {} as BuildConfig },
      ),
    ).toThrow('Formatter "javascript.module" namedExports must be a boolean when provided.');
  });

  it('returns no artifacts when no tokens match', async () => {
    const factory = createJavascriptModuleFormatterFactory();
    const definition = factory.create(
      { name: 'javascript.module', output: {} },
      { config: {} as BuildConfig },
    );

    const artifacts = await definition.run({ tokens: [] });

    expect(artifacts).toEqual([]);
  });
});

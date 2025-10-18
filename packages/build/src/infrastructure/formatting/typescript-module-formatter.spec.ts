import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { createTypescriptModuleFormatterFactory } from './typescript-module-formatter.js';

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

describe('createTypescriptModuleFormatterFactory', () => {
  it('emits TypeScript modules with default options', async () => {
    const factory = createTypescriptModuleFormatterFactory();
    const entry = { name: 'typescript.module', output: {} };
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

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toEqual({
      path: 'tokens.ts',
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
        '              0,\n' +
        '              0,\n' +
        '              0\n' +
        '            ]\n' +
        '          }\n' +
        '        }\n' +
        '      }\n' +
        '    }\n' +
        '  }\n' +
        '} as const;\n' +
        'export type TokenModule = typeof tokens;\n' +
        'export default tokens;\n',
      encoding: 'utf8',
      metadata: { language: 'typescript', namedExportCount: 0, role: 'module', tokenCount: 1 },
    });
  });

  it('respects custom options, named exports, and transform selections', async () => {
    const factory = createTypescriptModuleFormatterFactory();
    const entry = {
      name: 'typescript.module',
      output: {},
      options: {
        filename: 'modules/tokens.ts',
        rootIdentifier: 'moduleTokens',
        namedExports: true,
        transforms: ['color.toCss'],
      },
    } as const;
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const tokens: FormatterToken[] = [
      createToken(
        '#/tokens/library/color/primary',
        {
          id: 'color.primary',
          pointer: '#/tokens/library/color/primary',
          type: 'color',
          value: { colorSpace: 'srgb', components: [1, 0, 0] },
        },
        {
          transforms: new Map([['color.toCss', { css: '#ff0000' }]]),
          metadata: { tags: ['brand'] },
        },
      ),
    ];

    const artifacts = await definition.run({ tokens });

    expect(definition.selector.transforms).toEqual(['color.toCss']);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toEqual({
      path: 'modules/tokens.ts',
      contents:
        'export const moduleTokens = {\n' +
        '  tokens: {\n' +
        '    library: {\n' +
        '      color: {\n' +
        '        primary: {\n' +
        '          id: "color.primary",\n' +
        '          metadata: {\n' +
        '            tags: [\n' +
        '              "brand"\n' +
        '            ]\n' +
        '          },\n' +
        '          pointer: "#/tokens/library/color/primary",\n' +
        '          transforms: {\n' +
        '            "color.toCss": {\n' +
        '              css: "#ff0000"\n' +
        '            }\n' +
        '          },\n' +
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
        '      }\n' +
        '    }\n' +
        '  }\n' +
        '} as const;\n' +
        'export const tokens = moduleTokens.tokens;\n' +
        'export type TokenModule = typeof moduleTokens;\n' +
        'export default moduleTokens;\n',
      encoding: 'utf8',
      metadata: { language: 'typescript', namedExportCount: 1, role: 'module', tokenCount: 1 },
    });
  });

  it('validates option types and filename extensions', () => {
    const factory = createTypescriptModuleFormatterFactory();

    expect(() =>
      factory.create(
        { name: 'typescript.module', output: {}, options: { filename: 'tokens.js' } },
        { config: {} as BuildConfig },
      ),
    ).toThrow('Option "filename" for "typescript.module" must end with ".ts".');
    expect(() =>
      factory.create(
        { name: 'typescript.module', output: {}, options: { rootIdentifier: '123' } },
        { config: {} as BuildConfig },
      ),
    ).toThrow(
      'Formatter "typescript.module" rootIdentifier must be a valid JavaScript identifier string.',
    );
    expect(() =>
      factory.create(
        { name: 'typescript.module', output: {}, options: { namedExports: 1 } },
        { config: {} as BuildConfig },
      ),
    ).toThrow('Formatter "typescript.module" namedExports must be a boolean when provided.');
  });

  it('returns no artifacts when no tokens match', async () => {
    const factory = createTypescriptModuleFormatterFactory();
    const definition = factory.create(
      { name: 'typescript.module', output: {} },
      { config: {} as BuildConfig },
    );

    const artifacts = await definition.run({ tokens: [] });

    expect(artifacts).toEqual([]);
  });
});

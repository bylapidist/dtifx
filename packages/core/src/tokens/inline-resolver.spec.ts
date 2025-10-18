import { DiagnosticCodes } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import { INLINE_SOURCE_URI, createInlineResolver } from './index.js';
import type { TokenSnapshot } from './index.js';

describe('createInlineResolver', () => {
  const baseToken: TokenSnapshot = {
    id: '#/tokens/color/base',
    path: ['tokens', 'color', 'base'],
    type: 'color',
    value: { hex: '#ffffff' },
    extensions: {},
    source: {
      uri: INLINE_SOURCE_URI.href,
      line: 1,
      column: 1,
    },
    references: [],
    resolutionPath: [],
    appliedAliases: [],
  };

  it('resolves alias chains and preserves pointer ordering', () => {
    const aliasToken: TokenSnapshot = {
      ...baseToken,
      id: '#/tokens/color/alias',
      path: ['tokens', 'color', 'alias'],
      ref: baseToken.id,
      extensions: {},
      references: [],
      resolutionPath: [],
      appliedAliases: [],
    };

    const tokens = new Map<string, TokenSnapshot>([
      [baseToken.id, baseToken],
      [aliasToken.id, aliasToken],
    ]);

    const resolver = createInlineResolver(tokens, INLINE_SOURCE_URI);

    const result = resolver.resolve(aliasToken.id);

    expect(result.diagnostics).toEqual([]);
    expect(result.transforms).toEqual([]);
    expect(result.token).toBeDefined();
    expect(result.token?.pointer).toBe(aliasToken.id);
    expect(result.token?.source?.pointer).toBe(baseToken.id);
    expect(result.token?.trace).toEqual([
      { pointer: aliasToken.id, kind: 'alias' },
      { pointer: baseToken.id, kind: 'token' },
    ]);
    expect(result.token?.value).toEqual(baseToken.value);
    expect(result.token?.value).not.toBe(baseToken.value);
  });

  it('emits diagnostics when the pointer is missing', () => {
    const tokens = new Map<string, TokenSnapshot>([[baseToken.id, baseToken]]);

    const resolver = createInlineResolver(tokens, INLINE_SOURCE_URI);

    expect(resolver.resolve('#/missing')).toEqual({
      diagnostics: [
        {
          code: DiagnosticCodes.resolver.UNKNOWN_POINTER,
          message: 'No token exists at pointer "#/missing".',
          severity: 'error',
          pointer: '#/missing',
        },
      ],
      transforms: [],
    });
  });

  it('reports cycles detected while resolving aliases', () => {
    const first: TokenSnapshot = {
      ...baseToken,
      id: '#/a',
      path: ['a'],
      ref: '#/b',
      extensions: {},
      references: [],
      resolutionPath: [],
      appliedAliases: [],
    };

    const second: TokenSnapshot = {
      ...baseToken,
      id: '#/b',
      path: ['b'],
      ref: '#/a',
      extensions: {},
      references: [],
      resolutionPath: [],
      appliedAliases: [],
    };

    const tokens = new Map<string, TokenSnapshot>([
      [first.id, first],
      [second.id, second],
    ]);

    const resolver = createInlineResolver(tokens, INLINE_SOURCE_URI);

    expect(resolver.resolve(first.id)).toEqual({
      diagnostics: [
        {
          code: DiagnosticCodes.resolver.CYCLE_DETECTED,
          message: 'Circular reference detected while resolving "#/a".',
          severity: 'error',
          pointer: '#/a',
        },
      ],
      transforms: [],
    });
  });
});

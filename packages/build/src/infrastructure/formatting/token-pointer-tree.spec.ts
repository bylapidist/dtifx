import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { collapseTokensToPointerTree } from './token-pointer-tree.js';

function createToken(pointer: JsonPointer, value: unknown): FormatterToken {
  const snapshot = {
    pointer,
    token: { id: pointer, value },
  } as unknown as BuildTokenSnapshot;
  return {
    snapshot,
    pointer,
    value,
    transforms: new Map<string, unknown>(),
  } satisfies FormatterToken;
}

describe('collapseTokensToPointerTree', () => {
  it('collapses tokens into a nested pointer tree', () => {
    const tokens: FormatterToken[] = [
      createToken('#/tokens/library/color/primary', { type: 'color' }),
      createToken('#/tokens/library/color/secondary', { type: 'color' }),
      createToken('#/tokens/library/size/spacing-large', { type: 'dimension' }),
    ];

    const tree = collapseTokensToPointerTree(tokens, (token) => token.value);

    expect(tree).toEqual({
      tokens: {
        library: {
          color: {
            primary: { type: 'color' },
            secondary: { type: 'color' },
          },
          size: {
            'spacing-large': { type: 'dimension' },
          },
        },
      },
    });
  });

  it('throws when conflicting pointer segments are encountered', () => {
    const tokens: FormatterToken[] = [
      createToken('#/tokens/library/color', { type: 'color-group' }),
      createToken('#/tokens/library/color/primary', { type: 'color' }),
    ];

    expect(() => collapseTokensToPointerTree(tokens, (token) => token.value)).toThrow(
      'Cannot assign token at pointer segment "color" because a conflicting value already exists.',
    );
  });
});

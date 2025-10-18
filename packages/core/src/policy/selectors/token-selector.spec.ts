import { describe, expect, it } from 'vitest';

import {
  extractTokenTags,
  matchesTokenSelector,
  type TokenSelector,
  type TokenSelectorSnapshot,
} from './token-selector.js';

describe('matchesTokenSelector', () => {
  const baseSnapshot: TokenSelectorSnapshot<
    { readonly type?: string; readonly raw?: { readonly $tags?: readonly string[] } },
    { readonly extensions?: Readonly<Record<string, unknown>>; readonly tags?: readonly string[] }
  > = {
    pointer: '#/tokens/color.primary',
    token: {
      type: 'color',
      raw: { $tags: ['raw-tag'] },
    },
    metadata: {
      extensions: {
        'org.test.tags': ['ext-tag'],
        ignored: 42,
      },
      tags: ['meta-tag'],
    },
  };

  it('returns true when the snapshot satisfies all selector criteria', () => {
    const selector: TokenSelector<typeof baseSnapshot, 'color'> = {
      types: ['color'],
      pointers: [/color\.primary$/],
      tags: ['ext-tag', 'meta-tag'],
      metadata: (metadata) => metadata.extensions?.['org.test.tags'] !== undefined,
      where: (snapshot) => snapshot.token.raw?.$tags?.includes('raw-tag') ?? false,
    };

    expect(matchesTokenSelector(baseSnapshot, selector)).toBe(true);
  });

  it('returns false when the token type is missing or does not match', () => {
    const selector: TokenSelector<typeof baseSnapshot, 'dimension'> = {
      types: ['dimension'],
    };

    expect(matchesTokenSelector(baseSnapshot, selector)).toBe(false);
    expect(
      matchesTokenSelector({ ...baseSnapshot, token: { raw: { $tags: ['raw-tag'] } } }, selector),
    ).toBe(false);
  });

  it('returns false when metadata predicates fail', () => {
    const selector: TokenSelector<typeof baseSnapshot, 'color'> = {
      metadata: (metadata) => metadata.tags?.includes('meta-tag') ?? false,
    };

    expect(matchesTokenSelector(baseSnapshot, selector)).toBe(true);
    expect(matchesTokenSelector({ ...baseSnapshot, metadata: undefined }, selector)).toBe(false);
  });

  it('supports functional pointer matchers', () => {
    const selector: TokenSelector<typeof baseSnapshot, 'color'> = {
      pointers: (pointer) => pointer.startsWith('#/tokens/'),
    };

    expect(matchesTokenSelector(baseSnapshot, selector)).toBe(true);
    const mismatched = matchesTokenSelector(
      { ...baseSnapshot, pointer: '#/other/token' },
      selector,
    );
    expect(mismatched).toBe(false);
  });
});

describe('extractTokenTags', () => {
  it('aggregates tags from metadata extensions and raw token values', () => {
    const snapshot: TokenSelectorSnapshot<
      { readonly raw?: { readonly $tags?: readonly string[] } },
      { readonly extensions?: Readonly<Record<string, unknown>>; readonly tags?: readonly string[] }
    > = {
      pointer: '#/tokens/example',
      token: { raw: { $tags: ['raw-tag', 'raw-tag'] } },
      metadata: {
        extensions: {
          'org.example.tags': ['ext-one', 'ext-two'],
          nonArray: 'ignored',
        },
        tags: ['meta-tag'],
      },
    };

    expect(extractTokenTags(snapshot)).toEqual(
      new Set(['meta-tag', 'ext-one', 'ext-two', 'raw-tag']),
    );
  });
});

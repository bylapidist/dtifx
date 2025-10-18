import type { TokenSelector as CoreTokenSelector } from '@dtifx/core/policy/selectors';

import type { PolicyTokenSnapshot } from '../tokens/token-snapshot.js';
import type { TokenTypeIdentifier } from '../tokens/token-types.js';

type SelectorTypeUnion<TTypes extends readonly TokenTypeIdentifier[] | undefined> =
  TTypes extends readonly (infer TType)[]
    ? TType extends TokenTypeIdentifier
      ? TType
      : never
    : TokenTypeIdentifier;

declare const TOKEN_SELECTOR_TYPES: unique symbol;

export interface TokenSelector<
  TTypes extends readonly TokenTypeIdentifier[] | undefined =
    | readonly TokenTypeIdentifier[]
    | undefined,
> extends CoreTokenSelector<PolicyTokenSnapshot, SelectorTypeUnion<TTypes>> {
  readonly [TOKEN_SELECTOR_TYPES]?: TTypes;
}

export {
  extractTokenTags,
  matchesTokenSelector,
  type PointerPattern,
  type TokenSelectorSnapshot,
} from '@dtifx/core/policy/selectors';

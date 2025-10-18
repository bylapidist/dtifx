import type { TokenSet } from '../domain/tokens.js';
import {
  createTokenSetFromTree,
  type RawTokenTree,
  type TokenParserHooks,
} from '../adapters/dtif-parser/token-set-builder.js';

export interface CreateInlineTokenSetOptions extends TokenParserHooks {
  readonly source?: string;
  readonly prefix?: readonly string[];
}

/**
 * Constructs an in-memory token set from a raw DTIF tree representation.
 *
 * @param tree - The DTIF token tree to convert.
 * @param options - Optional metadata and diagnostics hooks for the token set.
 * @throws {Error} When the DTIF payload violates the schema.
 * @returns The hydrated token set ready for diffing.
 */
export function createInlineTokenSet(
  tree: RawTokenTree,
  options: CreateInlineTokenSetOptions = {},
): TokenSet {
  return createTokenSetFromTree(tree, options);
}

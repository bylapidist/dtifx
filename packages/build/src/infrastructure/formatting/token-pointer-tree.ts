import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { getDecodedPointerSegments } from './token-pointer.js';

const TOKEN_POINTER_TREE_MARKER = Symbol('TokenPointerTree');

export interface TokenPointerTree<TValue> {
  [segment: string]: TokenPointerTreeValue<TValue>;
}

export type TokenPointerTreeValue<TValue> = TValue | TokenPointerTree<TValue>;

/**
 * Collapses formatter tokens into a nested object keyed by decoded JSON pointer segments.
 *
 * @template TValue
 * @param {readonly FormatterToken[]} tokens - Tokens to collapse into a tree structure.
 * @param {(token: FormatterToken) => TValue} project - Selector that converts each token into a
 * value stored at the corresponding pointer path.
 * @returns {TokenPointerTree<TValue>} Nested token tree indexed by pointer segment hierarchy.
 */
export function collapseTokensToPointerTree<TValue>(
  tokens: readonly FormatterToken[],
  project: (token: FormatterToken) => TValue,
): TokenPointerTree<TValue> {
  const sortedTokens = [...tokens].toSorted((left, right) =>
    left.pointer.localeCompare(right.pointer),
  );
  const root = createPointerTree<TValue>();

  for (const token of sortedTokens) {
    const segments = getDecodedPointerSegments(token.pointer);
    if (segments.length === 0) {
      continue;
    }
    assignValue(root, segments, project(token));
  }

  return root;
}

function assignValue<TValue>(
  root: TokenPointerTree<TValue>,
  segments: readonly string[],
  value: TValue,
): void {
  let current: TokenPointerTree<TValue> = root;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (index === segments.length - 1) {
      current[segment] = value as TokenPointerTreeValue<TValue>;
      return;
    }

    const existing = current[segment];
    if (isPointerTree(existing)) {
      current = existing;
      continue;
    }
    if (existing === undefined) {
      const next = createPointerTree<TValue>();
      current[segment] = next as TokenPointerTreeValue<TValue>;
      current = next;
      continue;
    }

    throw new TypeError(
      `Cannot assign token at pointer segment "${segment}" because a conflicting value already exists.`,
    );
  }
}

function isPointerTree<TValue>(
  value: TokenPointerTreeValue<TValue> | undefined,
): value is TokenPointerTree<TValue> {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === 'object' &&
    TOKEN_POINTER_TREE_MARKER in value
  );
}

function createPointerTree<TValue>(): TokenPointerTree<TValue> {
  return Object.defineProperty(Object.create(null), TOKEN_POINTER_TREE_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  }) as TokenPointerTree<TValue>;
}

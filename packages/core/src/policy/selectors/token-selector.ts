import type { JsonPointer } from '@lapidist/dtif-parser';

export type PointerPattern = RegExp | ((pointer: JsonPointer) => boolean);

export interface TokenSelectorSnapshot<
  TToken extends { readonly type?: unknown; readonly raw?: unknown } = {
    readonly type?: unknown;
    readonly raw?: unknown;
  },
  TMetadata extends
    | {
        readonly extensions?: Readonly<Record<string, unknown>>;
        readonly tags?: readonly string[];
      }
    | undefined =
    | {
        readonly extensions?: Readonly<Record<string, unknown>>;
        readonly tags?: readonly string[];
      }
    | undefined,
> {
  readonly pointer: JsonPointer;
  readonly token: TToken;
  readonly metadata?: TMetadata;
}

export interface TokenSelector<
  TSnapshot extends TokenSelectorSnapshot = TokenSelectorSnapshot,
  TType extends string = string,
> {
  readonly types?: readonly TType[];
  readonly pointers?: readonly PointerPattern[] | PointerPattern;
  readonly tags?: readonly string[];
  readonly metadata?: (metadata: NonNullable<TSnapshot['metadata']>) => boolean;
  readonly where?: (snapshot: TSnapshot) => boolean;
}

/**
 * Determines whether a token snapshot satisfies the provided selector criteria.
 * @param snapshot - The token snapshot under evaluation.
 * @param selector - The selector describing the required characteristics.
 * @returns `true` when the snapshot matches all selector clauses.
 */
export function matchesTokenSelector<TSnapshot extends TokenSelectorSnapshot, TType extends string>(
  snapshot: TSnapshot,
  selector: TokenSelector<TSnapshot, TType>,
): boolean {
  if (selector.types) {
    const type = (snapshot.token as { readonly type?: unknown } | undefined)?.type;
    if (typeof type !== 'string') {
      return false;
    }
    if (!selector.types.includes(type as TType)) {
      return false;
    }
  }

  if (selector.pointers) {
    const pointerMatchers = Array.isArray(selector.pointers)
      ? selector.pointers
      : [selector.pointers];
    if (!pointerMatchers.some((pattern) => matchPointer(snapshot.pointer, pattern))) {
      return false;
    }
  }

  if (selector.tags) {
    const tokenTags = extractTokenTags(snapshot);
    for (const tag of selector.tags) {
      if (!tokenTags.has(tag)) {
        return false;
      }
    }
  }

  if (selector.metadata) {
    const metadata = snapshot.metadata;
    if (!metadata) {
      return false;
    }
    if (!selector.metadata(metadata as NonNullable<TSnapshot['metadata']>)) {
      return false;
    }
  }

  if (selector.where && !selector.where(snapshot)) {
    return false;
  }

  return true;
}

/**
 * Aggregates tags declared across metadata, extensions, and raw token definitions.
 * @param snapshot - The token snapshot from which to collect tags.
 * @returns A set containing all discovered tag values.
 */
export function extractTokenTags(snapshot: TokenSelectorSnapshot): Set<string> {
  const tags = new Set<string>();
  const metadata = snapshot.metadata;

  if (metadata) {
    const metadataTags = metadata.tags;
    if (metadataTags) {
      for (const tag of metadataTags) {
        tags.add(tag);
      }
    }

    const extensions = metadata.extensions;
    if (extensions && typeof extensions === 'object') {
      for (const value of Object.values(extensions as Record<string, unknown>)) {
        if (isStringArray(value)) {
          for (const entry of value) {
            tags.add(entry);
          }
        }
      }
    }
  }

  const tokenRaw = snapshot.token.raw as { readonly $tags?: unknown } | undefined;
  if (tokenRaw && isStringArray(tokenRaw.$tags)) {
    for (const tag of tokenRaw.$tags) {
      tags.add(tag);
    }
  }

  return tags;
}

function matchPointer(pointer: JsonPointer, pattern: PointerPattern): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(pointer);
  }

  return pattern(pointer);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

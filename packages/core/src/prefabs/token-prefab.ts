import { INLINE_SOURCE_URI } from '../tokens/types.js';
import {
  cloneTokenValue,
  createDefaultSourceLocation,
  createTokenId,
  resolveSourceUri,
  type TokenDeprecation,
  type TokenPath,
  type TokenPointer,
  type TokenSnapshot,
  type TokenSourceLocation,
} from '../tokens/index.js';

export type TokenPathInput = TokenPath | readonly string[] | string;

export interface PrefabMetadata {
  readonly description?: string;
  readonly extensions?: Readonly<Record<string, unknown>>;
  readonly tags?: readonly string[];
  readonly author?: string;
  readonly lastModified?: string;
  readonly lastUsed?: string;
  readonly usageCount?: number;
  readonly hash?: string;
}

export interface PrefabDeprecation {
  readonly supersededBy?: string;
  readonly since?: string;
  readonly reason?: string;
}

export interface PrefabSnapshotOptions {
  readonly source?: TokenSourceLocation;
  readonly sourceUri?: URL | string;
}

interface PrefabState<TValue> {
  readonly value: TValue;
  readonly raw?: unknown;
  readonly ref?: string;
  readonly metadata: PrefabMetadata;
  readonly deprecation?: PrefabDeprecation | undefined;
}

const EMPTY_POINTERS = Object.freeze([]) as readonly TokenPointer[];

export abstract class TokenPrefab<TValue, TSelf extends TokenPrefab<TValue, TSelf>> {
  protected constructor(
    public readonly type: string,
    public readonly path: TokenPath,
    protected readonly state: PrefabState<TValue>,
  ) {}

  abstract get value(): TValue;

  protected abstract create(path: TokenPath, state: PrefabState<TValue>): TSelf;

  protected cloneWith(updates: Partial<PrefabState<TValue>>): TSelf {
    const metadata =
      'metadata' in updates ? normaliseMetadata(updates.metadata ?? {}) : this.state.metadata;
    const deprecation = resolveDeprecationUpdate(updates, this.state.deprecation);

    const value = 'value' in updates ? (updates.value as TValue) : this.state.value;
    const raw = 'raw' in updates ? updates.raw : this.state.raw;
    const ref = 'ref' in updates ? updates.ref : this.state.ref;

    const nextState: PrefabState<TValue> = {
      value,
      metadata,
      ...(raw === undefined ? {} : { raw }),
      ...(ref === undefined ? {} : { ref }),
      ...(deprecation ? { deprecation } : {}),
    } satisfies PrefabState<TValue>;

    return this.create(this.path, nextState);
  }

  protected updateValue(mapper: (value: TValue) => TValue, raw?: unknown): TSelf {
    const nextValue = mapper(this.state.value);
    const updates: Partial<PrefabState<TValue>> =
      raw === undefined
        ? { value: nextValue }
        : {
            value: nextValue,
            raw,
          };

    return this.cloneWith(updates);
  }

  withDescription(description: string | undefined): TSelf {
    const { description: _description, ...rest } = this.state.metadata;
    const metadata =
      description === undefined
        ? (rest as PrefabMetadata)
        : ({ ...rest, description: description.trim() } as PrefabMetadata);

    return this.cloneWith({ metadata });
  }

  withExtensions(extensions: Record<string, unknown>): TSelf {
    const metadata: PrefabMetadata = {
      ...this.state.metadata,
      extensions: cloneExtensions(extensions),
    };

    return this.cloneWith({ metadata });
  }

  mergeExtensions(extensions: Record<string, unknown>): TSelf {
    const current = this.state.metadata.extensions ?? {};
    const metadata: PrefabMetadata = {
      ...this.state.metadata,
      extensions: {
        ...cloneExtensions(current),
        ...cloneExtensions(extensions),
      },
    };

    return this.cloneWith({ metadata });
  }

  withTags(tags: Iterable<string>): TSelf {
    const metadata: PrefabMetadata = {
      ...this.state.metadata,
      tags: normaliseTags(tags),
    };

    return this.cloneWith({ metadata });
  }

  addTags(...tags: readonly string[]): TSelf {
    const existing = this.state.metadata.tags ?? [];
    return this.withTags([...existing, ...tags]);
  }

  withAuthor(author: string | undefined): TSelf {
    const { author: _author, ...rest } = this.state.metadata;
    const metadata =
      author === undefined
        ? (rest as PrefabMetadata)
        : ({ ...rest, author: author.trim() } as PrefabMetadata);

    return this.cloneWith({ metadata });
  }

  withLastModified(lastModified: string | undefined): TSelf {
    const { lastModified: _lastModified, ...rest } = this.state.metadata;
    const metadata =
      lastModified === undefined
        ? (rest as PrefabMetadata)
        : ({ ...rest, lastModified: lastModified.trim() } as PrefabMetadata);

    return this.cloneWith({ metadata });
  }

  withLastUsed(lastUsed: string | undefined): TSelf {
    const { lastUsed: _lastUsed, ...rest } = this.state.metadata;
    const metadata =
      lastUsed === undefined
        ? (rest as PrefabMetadata)
        : ({ ...rest, lastUsed: lastUsed.trim() } as PrefabMetadata);

    return this.cloneWith({ metadata });
  }

  withUsageCount(usageCount: number | undefined): TSelf {
    const { usageCount: _usageCount, ...rest } = this.state.metadata;
    const metadata =
      usageCount === undefined
        ? (rest as PrefabMetadata)
        : ({ ...rest, usageCount: Math.max(0, usageCount) } as PrefabMetadata);

    return this.cloneWith({ metadata });
  }

  withHash(hash: string | undefined): TSelf {
    const { hash: _hash, ...rest } = this.state.metadata;
    const metadata =
      hash === undefined
        ? (rest as PrefabMetadata)
        : ({ ...rest, hash: hash.trim() } as PrefabMetadata);

    return this.cloneWith({ metadata });
  }

  withDeprecation(deprecation: PrefabDeprecation | undefined): TSelf {
    if (deprecation === undefined) {
      return this.cloneWith({ deprecation: undefined });
    }

    return this.cloneWith({
      deprecation,
    });
  }

  withRaw(raw: unknown): TSelf {
    return this.cloneWith({ raw });
  }

  asAlias(ref: string): TSelf {
    return this.cloneWith({ ref: ref.trim() });
  }

  toJSON(): Record<string, unknown> {
    const metadata = this.state.metadata;
    return {
      $type: this.type,
      ...(this.state.ref
        ? { $value: { $ref: this.state.ref } }
        : {
            $value:
              this.state.raw === undefined
                ? cloneTokenValue(this.state.value)
                : cloneTokenValue(this.state.raw),
          }),
      ...(metadata.description ? { $description: metadata.description } : {}),
      ...(metadata.extensions && Object.keys(metadata.extensions).length > 0
        ? { $extensions: cloneExtensions(metadata.extensions) }
        : {}),
      ...(metadata.tags && metadata.tags.length > 0 ? { $tags: [...metadata.tags] } : {}),
      ...(metadata.author ? { $author: metadata.author } : {}),
      ...(metadata.lastModified ? { $lastModified: metadata.lastModified } : {}),
      ...(metadata.lastUsed ? { $lastUsed: metadata.lastUsed } : {}),
      ...(typeof metadata.usageCount === 'number' ? { $usageCount: metadata.usageCount } : {}),
      ...(metadata.hash ? { $hash: metadata.hash } : {}),
      ...(this.state.deprecation
        ? { $deprecated: createJsonDeprecation(this.state.deprecation) }
        : {}),
    };
  }

  toSnapshot(options: PrefabSnapshotOptions = {}): TokenSnapshot {
    const path = [...this.path];
    const id = createTokenId(path);
    const source = resolveSource(options);

    const metadata = this.state.metadata;
    const deprecated =
      this.state.deprecation === undefined
        ? undefined
        : createSnapshotDeprecation(this.state.deprecation, source);
    return {
      id,
      path,
      type: this.type,
      extensions: cloneExtensions(metadata.extensions ?? {}),
      source,
      references: EMPTY_POINTERS,
      resolutionPath: EMPTY_POINTERS,
      appliedAliases: EMPTY_POINTERS,
      ...(this.state.ref
        ? {
            ref: this.state.ref,
            raw:
              this.state.raw === undefined
                ? { $ref: this.state.ref }
                : cloneTokenValue(this.state.raw),
          }
        : {
            value: cloneTokenValue(this.state.value),
            raw:
              this.state.raw === undefined
                ? cloneTokenValue(this.state.value)
                : cloneTokenValue(this.state.raw),
          }),
      ...(metadata.description ? { description: metadata.description } : {}),
      ...(metadata.lastModified ? { $lastModified: metadata.lastModified } : {}),
      ...(metadata.lastUsed ? { $lastUsed: metadata.lastUsed } : {}),
      ...(typeof metadata.usageCount === 'number' ? { $usageCount: metadata.usageCount } : {}),
      ...(metadata.author ? { $author: metadata.author } : {}),
      ...(metadata.tags && metadata.tags.length > 0 ? { $tags: [...metadata.tags] } : {}),
      ...(metadata.hash ? { $hash: metadata.hash } : {}),
      ...(deprecated === undefined ? {} : { deprecated }),
    };
  }
}

/**
 * Normalises a token path into its canonical array representation.
 *
 * @param input - Path segments or a string path value.
 * @returns A trimmed token path array suitable for DTIF snapshots.
 * @throws {TypeError} When the provided path is empty.
 */
export function normaliseTokenPath(input: TokenPathInput): TokenPath {
  if (Array.isArray(input)) {
    const segments = input.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      throw new TypeError('Token path cannot be empty.');
    }
    return segments as TokenPath;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new TypeError('Token path cannot be empty.');
    }

    const normalised = trimmed.startsWith('#/') ? trimmed.slice(2) : trimmed.replace(/^\/+/, '');
    const delimiter = normalised.includes('/') ? '/' : '.';
    const segments = normalised
      .split(delimiter)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      throw new TypeError(`Token path "${input}" did not contain any segments.`);
    }
    return segments as TokenPath;
  }

  return input as TokenPath;
}

function resolveSource(options: PrefabSnapshotOptions): TokenSourceLocation {
  if (options.source) {
    return options.source;
  }

  if (options.sourceUri) {
    if (options.sourceUri instanceof URL) {
      return createDefaultSourceLocation(options.sourceUri);
    }

    try {
      const resolved = resolveSourceUri(options.sourceUri);
      return createDefaultSourceLocation(resolved);
    } catch {
      return createDefaultSourceLocation(INLINE_SOURCE_URI);
    }
  }

  return createDefaultSourceLocation(INLINE_SOURCE_URI);
}

function resolveDeprecationUpdate<TValue>(
  updates: Partial<PrefabState<TValue>>,
  current: PrefabDeprecation | undefined,
): PrefabDeprecation | undefined {
  if ('deprecation' in updates) {
    return updates.deprecation ? normaliseDeprecation(updates.deprecation) : undefined;
  }

  return current;
}

function cloneExtensions(extensions: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(extensions).map(([key, value]) => [key, cloneTokenValue(value)]),
  );
}

function normaliseMetadata(metadata: PrefabMetadata): PrefabMetadata {
  return {
    ...(metadata.description ? { description: metadata.description.trim() } : {}),
    ...(metadata.extensions ? { extensions: cloneExtensions(metadata.extensions) } : {}),
    ...(metadata.tags ? { tags: normaliseTags(metadata.tags) } : {}),
    ...(metadata.author ? { author: metadata.author.trim() } : {}),
    ...(metadata.lastModified ? { lastModified: metadata.lastModified.trim() } : {}),
    ...(metadata.lastUsed ? { lastUsed: metadata.lastUsed.trim() } : {}),
    ...(typeof metadata.usageCount === 'number'
      ? { usageCount: Math.max(0, metadata.usageCount) }
      : {}),
    ...(metadata.hash ? { hash: metadata.hash.trim() } : {}),
  };
}

function normaliseTags(tags: Iterable<string>): readonly string[] {
  const unique = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  }
  return [...unique].toSorted();
}

function normaliseDeprecation(deprecation: PrefabDeprecation): PrefabDeprecation | undefined {
  const supersededBy = deprecation.supersededBy?.trim();
  const since = deprecation.since?.trim();
  const reason = deprecation.reason?.trim();

  const hasSupersededBy = Boolean(supersededBy);
  const hasSince = Boolean(since);
  const hasReason = Boolean(reason);

  if (hasSupersededBy || hasSince || hasReason) {
    return {
      ...(hasSupersededBy ? { supersededBy } : {}),
      ...(hasSince ? { since } : {}),
      ...(hasReason ? { reason } : {}),
    } as PrefabDeprecation;
  }

  return {};
}

function createJsonDeprecation(deprecation: PrefabDeprecation): unknown {
  const hasSupersededBy = Boolean(deprecation.supersededBy);
  const hasSince = Boolean(deprecation.since);
  const hasReason = Boolean(deprecation.reason);

  if (hasSupersededBy || hasSince || hasReason) {
    const value: Record<string, unknown> = {};
    if (hasSupersededBy) {
      value['replacement'] = deprecation.supersededBy;
    }
    if (hasSince) {
      value['since'] = deprecation.since;
    }
    if (hasReason) {
      value['reason'] = deprecation.reason;
    }

    return value;
  }

  return true;
}

function createSnapshotDeprecation(
  deprecation: PrefabDeprecation,
  source: TokenSourceLocation,
): TokenDeprecation | undefined {
  const hasSupersededBy = Boolean(deprecation.supersededBy);
  const hasSince = Boolean(deprecation.since);
  const hasReason = Boolean(deprecation.reason);

  if (hasSupersededBy || hasSince || hasReason) {
    return {
      ...(hasSupersededBy && deprecation.supersededBy
        ? {
            supersededBy: {
              pointer: deprecation.supersededBy,
              uri: source.uri,
            },
          }
        : {}),
      ...(hasSince && deprecation.since ? { since: deprecation.since } : {}),
      ...(hasReason && deprecation.reason ? { reason: deprecation.reason } : {}),
    } as TokenDeprecation;
  }

  return {};
}

/**
 * Creates the default prefab state for a token value.
 *
 * @param value - The initial token value to wrap in prefab state.
 * @returns A prefab state container ready for cloning.
 */
export function createInitialState<TValue>(value: TValue): PrefabState<TValue> {
  return {
    value,
    metadata: {},
  } satisfies PrefabState<TValue>;
}

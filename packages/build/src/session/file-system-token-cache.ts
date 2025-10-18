import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import Keyv from 'keyv';
import { KeyvFile } from '@keyv/file';

import type {
  DtifFlattenedToken,
  ResolvedTokenView,
  TokenCache,
  TokenCacheKey,
  TokenCacheSnapshot,
  TokenId,
} from '@lapidist/dtif-parser';
import type { domain as dtifDomain } from '@lapidist/dtif-parser';
import type { TokenMetadataSnapshot } from '@dtifx/core';

const FILE_VERSION = 1;

type DiagnosticEvent = dtifDomain.DiagnosticEvent;
type SerializedMap<TKey extends string, TValue> = readonly [TKey, TValue][];

interface SerializableSnapshot {
  readonly documentHash: string;
  readonly timestamp: number;
  readonly flattened?: readonly DtifFlattenedToken[];
  readonly metadataIndex?: SerializedMap<TokenId, TokenMetadataSnapshot>;
  readonly resolutionIndex?: SerializedMap<TokenId, ResolvedTokenView>;
  readonly diagnostics?: readonly DiagnosticEvent[];
}

interface CachePayload {
  readonly version: number;
  readonly snapshot: SerializableSnapshot;
}

interface KeyValueStore<TValue> {
  get(key: string): Promise<TValue | undefined>;
  set(key: string, value: TValue): Promise<unknown>;
}

/**
 * Persists token cache entries to disk, enabling reuse across build executions.
 */
export class FileSystemTokenCache implements TokenCache {
  private readonly keyv: KeyValueStore<CachePayload>;
  private directoryInitialisation?: Promise<void>;

  /**
   * @param {string} rootDirectory - Directory where cache files should be stored.
   * @param {KeyValueStore<CachePayload>} [store] - Optional Keyv-compatible store for testing.
   */
  constructor(
    private readonly rootDirectory: string,
    store?: KeyValueStore<CachePayload>,
  ) {
    this.keyv =
      store ??
      new Keyv<CachePayload>({
        store: new KeyvFile({ filename: path.join(rootDirectory, 'token-cache.json') }),
      });
  }

  /**
   * Attempts to read a cached token snapshot for the provided key.
   * @param {TokenCacheKey} key - Cache key describing the document and optional variant.
   * @returns {Promise<TokenCacheSnapshot | undefined>} The cached snapshot when present.
   */
  async get(key: TokenCacheKey): Promise<TokenCacheSnapshot | undefined> {
    const payload = await this.keyv.get(this.serialiseKey(key));
    if (!payload || payload.version !== FILE_VERSION) {
      return undefined;
    }
    return deserialiseSnapshot(payload.snapshot);
  }

  /**
   * Writes a token snapshot to disk so subsequent builds can reuse the results.
   * @param {TokenCacheKey} key - Cache key describing the document and optional variant.
   * @param {TokenCacheSnapshot} value - Snapshot payload to persist.
   * @returns {Promise<void>} Resolves once the snapshot has been written.
   */
  async set(key: TokenCacheKey, value: TokenCacheSnapshot): Promise<void> {
    await this.ensureDirectory();
    const payload: CachePayload = {
      version: FILE_VERSION,
      snapshot: serialiseSnapshot(value),
    };
    await this.keyv.set(this.serialiseKey(key), payload);
  }

  private serialiseKey(key: TokenCacheKey): string {
    return JSON.stringify({
      document: {
        uri: key.document.uri.href,
        contentType: key.document.contentType,
        ...(key.document.description ? { description: key.document.description } : {}),
      },
      variant: key.variant ?? 'default',
    });
  }

  private ensureDirectory(): Promise<void> {
    this.directoryInitialisation ??= mkdir(this.rootDirectory, { recursive: true }).then(() => {});
    return this.directoryInitialisation;
  }
}

function serialiseSnapshot(snapshot: TokenCacheSnapshot): SerializableSnapshot {
  return {
    documentHash: snapshot.documentHash,
    timestamp: snapshot.timestamp,
    ...(snapshot.flattened ? { flattened: structuredClone(snapshot.flattened) } : {}),
    ...(snapshot.metadataIndex ? { metadataIndex: serialiseMap(snapshot.metadataIndex) } : {}),
    ...(snapshot.resolutionIndex
      ? { resolutionIndex: serialiseMap(snapshot.resolutionIndex) }
      : {}),
    ...(snapshot.diagnostics ? { diagnostics: structuredClone(snapshot.diagnostics) } : {}),
  } satisfies SerializableSnapshot;
}

function deserialiseSnapshot(snapshot: SerializableSnapshot): TokenCacheSnapshot {
  return {
    documentHash: snapshot.documentHash,
    timestamp: snapshot.timestamp,
    ...(snapshot.flattened ? { flattened: structuredClone(snapshot.flattened) } : {}),
    ...(snapshot.metadataIndex ? { metadataIndex: new Map(snapshot.metadataIndex) } : {}),
    ...(snapshot.resolutionIndex ? { resolutionIndex: new Map(snapshot.resolutionIndex) } : {}),
    ...(snapshot.diagnostics ? { diagnostics: structuredClone(snapshot.diagnostics) } : {}),
  } satisfies TokenCacheSnapshot;
}

function cloneJson<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

function serialiseMap<TKey extends string, TValue>(
  map: ReadonlyMap<TKey, TValue>,
): SerializedMap<TKey, TValue> {
  return Array.from(map.entries(), ([tokenId, value]) => [tokenId, cloneJson(value)]);
}

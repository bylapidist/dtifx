import { createHash } from 'node:crypto';

import cacache from 'cacache';

/**
 * Unique identifier for a cached transform result. The hash is derived from
 * the transform configuration so cached entries can be reused safely across
 * runs.
 */
export interface TransformCacheKey {
  readonly pointer: string;
  readonly transform: string;
  readonly group: string;
  readonly optionsHash: string;
}

/** Describes a single entry stored in a transform cache. */
export interface TransformCacheEntry<TValue = unknown> {
  readonly key: TransformCacheKey;
  readonly value: TValue;
}

export type TransformCacheStatus = 'hit' | 'miss' | 'skip';

/**
 * Contract implemented by transform caches that can retrieve and persist
 * values associated with a {@link TransformCacheKey}.
 */
export interface TransformCache {
  get<TValue = unknown>(
    key: TransformCacheKey,
  ): Promise<TransformCacheEntry<TValue> | undefined> | TransformCacheEntry<TValue> | undefined;
  set<TValue = unknown>(entry: TransformCacheEntry<TValue>): Promise<boolean> | boolean;
}

/**
 * In-memory transform cache backed by a map keyed with a serialised
 * representation of the {@link TransformCacheKey}. Useful for unit tests and
 * short-lived processes.
 */
export class InMemoryTransformCache implements TransformCache {
  private readonly entries = new Map<string, TransformCacheEntry>();

  get<TValue>(key: TransformCacheKey): Promise<TransformCacheEntry<TValue> | undefined> {
    const entry = this.entries.get(this.serialiseKey(key));
    return Promise.resolve(entry as TransformCacheEntry<TValue> | undefined);
  }

  set<TValue>(entry: TransformCacheEntry<TValue>): Promise<boolean> {
    this.entries.set(this.serialiseKey(entry.key), entry);
    return Promise.resolve(true);
  }

  private serialiseKey(key: TransformCacheKey): string {
    return `${key.pointer}::${key.transform}::${key.group}::${key.optionsHash}`;
  }
}

interface FilePayload<TValue> {
  readonly value: TValue;
  readonly expiresAt?: number;
}

/**
 * File system backed transform cache that persists entries to disk using
 * {@link cacache}. Entries are keyed by a deterministic digest derived from
 * the {@link TransformCacheKey}.
 */
export interface FileSystemTransformCacheOptions {
  readonly ttl?: number;
}

export class FileSystemTransformCache implements TransformCache {
  constructor(
    private readonly rootDirectory: string,
    private readonly options: FileSystemTransformCacheOptions = {},
  ) {}

  async get<TValue>(key: TransformCacheKey): Promise<TransformCacheEntry<TValue> | undefined> {
    const cacheKey = this.digestKey(key);
    try {
      const info = await cacache.get.info(this.rootDirectory, cacheKey);
      if (!info) {
        return undefined;
      }
      const result = await cacache.get(this.rootDirectory, cacheKey);
      const payload = JSON.parse(result.data.toString('utf8')) as FilePayload<TValue>;
      if (payload.expiresAt !== undefined && payload.expiresAt <= Date.now()) {
        try {
          await cacache.rm.entry(this.rootDirectory, cacheKey);
        } catch (removalError) {
          throw new Error('Failed to purge expired transform cache entry', { cause: removalError });
        }
        return undefined;
      }
      return {
        key,
        value: payload.value,
      } satisfies TransformCacheEntry<TValue>;
    } catch (error) {
      throw new Error('Failed to read transform cache entry', { cause: error });
    }
  }

  async set<TValue>(entry: TransformCacheEntry<TValue>): Promise<boolean> {
    const cacheKey = this.digestKey(entry.key);
    try {
      const payload: FilePayload<TValue> = {
        value: entry.value,
        ...(this.options.ttl === undefined
          ? {}
          : { expiresAt: Date.now() + Math.max(0, this.options.ttl) }),
      };
      const serialised = JSON.stringify(payload);
      await cacache.put(this.rootDirectory, cacheKey, serialised);
      return true;
    } catch (error) {
      throw new Error('Failed to write transform cache entry', { cause: error });
    }
  }

  private digestKey(key: TransformCacheKey): string {
    const hash = createHash('sha256');
    hash.update(key.pointer);
    hash.update('\0');
    hash.update(key.transform);
    hash.update('\0');
    hash.update(key.group);
    hash.update('\0');
    hash.update(key.optionsHash);
    return hash.digest('hex');
  }
}

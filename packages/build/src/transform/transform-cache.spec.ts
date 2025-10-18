import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

import cacache from 'cacache';
import { describe, expect, it, vi } from 'vitest';

import {
  FileSystemTransformCache,
  type FileSystemTransformCacheOptions,
  type TransformCacheEntry,
  type TransformCacheKey,
} from './transform-cache.js';

const baseKey: TransformCacheKey = {
  pointer: '/cache/pointer',
  transform: 'test.transform',
  group: 'default',
  optionsHash: 'options-hash',
};

describe('FileSystemTransformCache', () => {
  it('returns undefined when no entry is cached', async () => {
    await withCacheDir(async (cacheDir) => {
      const cache = new FileSystemTransformCache(cacheDir);
      const entry = await cache.get(baseKey);
      expect(entry).toBeUndefined();
    });
  });

  it('stores and retrieves entries using cacache', async () => {
    const value = { message: 'cached' } as const;

    await withCacheDir(async (cacheDir) => {
      const cache = new FileSystemTransformCache(cacheDir);
      const setResult = await cache.set({ key: baseKey, value });
      expect(setResult).toBe(true);

      const entry = await cache.get<typeof value>(baseKey);
      expect(entry).toEqual({ key: baseKey, value } satisfies TransformCacheEntry<typeof value>);

      const info = await cacache.get.info(cacheDir, digestKey(baseKey));
      expect(info).toBeTruthy();
    });
  });

  it('records expiry metadata when ttl is provided', async () => {
    const ttlOptions: FileSystemTransformCacheOptions = { ttl: 5000 };

    await withCacheDir(async (cacheDir) => {
      const cache = new FileSystemTransformCache(cacheDir, ttlOptions);
      await cache.set({ key: baseKey, value: 'value' });

      const result = await cacache.get(cacheDir, digestKey(baseKey));
      const payload = JSON.parse(result.data.toString('utf8')) as { expiresAt?: number };
      expect(payload.expiresAt).toBeDefined();
      expect(payload.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  it('wraps read failures in a descriptive error', async () => {
    const error = new Error('boom');
    const infoSpy = vi.spyOn(cacache.get, 'info').mockRejectedValueOnce(error);

    try {
      await withCacheDir(async (cacheDir) => {
        const cache = new FileSystemTransformCache(cacheDir);
        await expect(cache.get(baseKey)).rejects.toThrowError(
          /Failed to read transform cache entry/,
        );
      });
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('evicts expired entries during lookup', async () => {
    await withCacheDir(async (cacheDir) => {
      const cache = new FileSystemTransformCache(cacheDir, { ttl: 10 });
      await cache.set({ key: baseKey, value: 'value' });

      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      const entry = await cache.get(baseKey);
      expect(entry).toBeUndefined();

      const info = (await cacache.get.info(cacheDir, digestKey(baseKey))) as unknown;
      expect(info).toBeNull();
    });
  });
});

function digestKey(key: TransformCacheKey): string {
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

async function withCacheDir(run: (cacheDir: string) => Promise<void>): Promise<void> {
  const cacheDir = await cacache.tmp.mkdir(tmpdir(), { tmpPrefix: 'dtifx-build-transform-cache-' });
  try {
    await run(cacheDir);
  } finally {
    await cacache.rm.all(cacheDir).catch(() => {});
  }
}

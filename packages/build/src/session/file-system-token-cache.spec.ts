import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { TokenCacheKey, TokenCacheSnapshot, TokenId } from '@lapidist/dtif-parser';
import type { domain as dtifDomain } from '@lapidist/dtif-parser';
import type { TokenMetadataSnapshot } from '@dtifx/core';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { FileSystemTokenCache } from './file-system-token-cache.js';

interface CachePayload {
  readonly version: number;
  readonly snapshot: unknown;
}

class InMemoryStore {
  readonly values = new Map<string, CachePayload>();

  async get(key: string): Promise<CachePayload | undefined> {
    return this.values.get(key);
  }

  async set(key: string, value: CachePayload): Promise<void> {
    this.values.set(key, value);
  }
}

function createKey(): TokenCacheKey {
  return {
    document: {
      uri: new URL('file:///tokens.json'),
      contentType: 'application/json',
      description: 'test document',
    },
    variant: 'preview',
  } satisfies TokenCacheKey;
}

function createSnapshot(): TokenCacheSnapshot {
  const metadata: TokenMetadataSnapshot = {
    description: 'Test token',
    extensions: {},
    source: { uri: 'virtual:memory', line: 1, column: 1 },
  } satisfies TokenMetadataSnapshot;
  const metadataIndex = new Map<TokenId, TokenMetadataSnapshot>([['button.primary', metadata]]);
  const resolutionIndex = new Map<TokenId, unknown>([
    ['button.primary', { pointer: '/button/primary', value: '#fff' }],
  ]) as TokenCacheSnapshot['resolutionIndex'];
  return {
    documentHash: 'hash-123',
    timestamp: Date.now(),
    metadataIndex,
    resolutionIndex,
    diagnostics: [createDiagnostic()],
  } satisfies TokenCacheSnapshot;
}

type DiagnosticEvent = dtifDomain.DiagnosticEvent;

function createDiagnostic(): DiagnosticEvent {
  return {
    severity: 'info',
    code: 'test',
    message: 'diagnostic',
  } satisfies DiagnosticEvent;
}

describe('FileSystemTokenCache', () => {
  let tempDir: string;
  let store: InMemoryStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'token-cache-'));
    store = new InMemoryStore();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns undefined when the snapshot is not present', async () => {
    const cache = new FileSystemTokenCache(tempDir, store);
    const key = createKey();

    await expect(cache.get(key)).resolves.toBeUndefined();
  });

  it('persists and restores snapshots through the Keyv store', async () => {
    const cache = new FileSystemTokenCache(tempDir, store);
    const key = createKey();
    const snapshot = createSnapshot();

    await cache.set(key, snapshot);

    const restored = await cache.get(key);
    expect(restored).toEqual(snapshot);
    expect(restored?.metadataIndex).toBeInstanceOf(Map);
    expect(restored?.metadataIndex?.get('button.primary')).toEqual(
      snapshot.metadataIndex?.get('button.primary'),
    );
    expect(restored?.resolutionIndex?.get('button.primary')).toEqual(
      snapshot.resolutionIndex?.get('button.primary'),
    );
  });

  it('ignores snapshots written with an incompatible version', async () => {
    const cache = new FileSystemTokenCache(tempDir, store);
    const key = createKey();
    const snapshot = createSnapshot();

    await cache.set(key, snapshot);

    const [storedKey, storedValue] = store.values.entries().next().value as [string, CachePayload];
    store.values.set(storedKey, { ...storedValue, version: 0 });

    await expect(cache.get(key)).resolves.toBeUndefined();
  });
});

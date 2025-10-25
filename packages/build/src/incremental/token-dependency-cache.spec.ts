import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BuildResolvedPlan, BuildTokenSnapshot } from '../domain/models/tokens.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => {}),
  readFile: vi.fn(),
  writeFile: vi.fn(async () => {}),
}));

const fs = await import('node:fs/promises');
const mkdir = vi.mocked(fs.mkdir);
const readFile = vi.mocked(fs.readFile);
const writeFile = vi.mocked(fs.writeFile);

const { createTokenDependencySnapshot, FileSystemTokenDependencyCache } = await import(
  './token-dependency-cache.js'
);

describe('token dependency cache hashing', () => {
  it('produces a stable hash regardless of object key ordering', () => {
    const firstSnapshot = createSnapshot({
      resolutionValue: {
        alpha: 1,
        nested: { foo: 'bar', baz: 'qux' },
        array: [{ index: 0 }, { index: 1 }],
      },
      metadata: { lastUsed: '2024-01-01T00:00:00.000Z', tags: ['primary', 'button'] },
      context: { layer: 'delivery', theme: 'light' },
    });

    const secondSnapshot = createSnapshot({
      resolutionValue: {
        array: [{ index: 0 }, { index: 1 }],
        nested: { baz: 'qux', foo: 'bar' },
        alpha: 1,
      },
      metadata: { tags: ['primary', 'button'], lastUsed: '2024-01-01T00:00:00.000Z' },
      context: { theme: 'light', layer: 'delivery' },
    });

    const firstPlan = createPlan(firstSnapshot);
    const secondPlan = createPlan(secondSnapshot);

    const firstEntry = createTokenDependencySnapshot(firstPlan).entries[0];
    const secondEntry = createTokenDependencySnapshot(secondPlan).entries[0];

    expect(firstEntry.hash).toBe(secondEntry.hash);
  });

  it('falls back to token values and raw data when resolution values are absent', () => {
    const valueSnapshot = createSnapshot({
      resolutionValue: undefined,
      pointer: '#/fallback/value',
    });
    const rawSnapshot = createSnapshot({ resolutionValue: undefined, pointer: '#/fallback/raw' });
    (rawSnapshot as Record<string, unknown>).token = {
      ...((rawSnapshot as Record<string, unknown>).token as Record<string, unknown>),
      value: undefined,
    };

    const valueHash = createTokenDependencySnapshot(createPlan(valueSnapshot)).entries[0]?.hash;
    const rawHash = createTokenDependencySnapshot(createPlan(rawSnapshot)).entries[0]?.hash;

    expect(valueHash).toBeDefined();
    expect(rawHash).toBeDefined();
    expect(valueHash).not.toBe(rawHash);
  });

  it('normalises pointer formatting and sorts snapshot entries', () => {
    const first = createSnapshot({ pointer: ['#', 'tokens', 'a'] as never });
    const second = createSnapshot({ pointer: '#/tokens/b' });
    const plan = createPlan(first, second);

    const snapshot = createTokenDependencySnapshot(plan);

    expect(snapshot.entries.map((entry) => entry.pointer)).toEqual(['#,tokens,a', '#/tokens/b']);
    expect(snapshot.entries[0]?.dependencies).toContain('file:///tokens.json##/aliases/example');
  });
});

describe('FileSystemTokenDependencyCache', () => {
  beforeEach(() => {
    mkdir.mockClear();
    readFile.mockReset();
    writeFile.mockClear();
  });

  it('evaluates snapshots treating missing caches as all changes', async () => {
    const snapshot = createTokenDependencySnapshot(
      createPlan(createSnapshot({ pointer: '#/tokens/a' })),
    );
    const cache = new FileSystemTokenDependencyCache('/tmp/cache.json');
    const notFoundError = Object.assign(new Error('missing'), { code: 'ENOENT' });
    readFile.mockRejectedValueOnce(notFoundError);

    const diff = await cache.evaluate(snapshot);

    expect([...diff.changed]).toEqual(['#/tokens/a']);
    expect([...diff.removed]).toEqual([]);
  });

  it('persists committed snapshots and reuses the cached state', async () => {
    const first = createTokenDependencySnapshot(
      createPlan(createSnapshot({ pointer: '#/tokens/a' })),
    );
    const second = createTokenDependencySnapshot(
      createPlan(createSnapshot({ pointer: '#/tokens/a', resolutionValue: { updated: true } })),
    );
    const cache = new FileSystemTokenDependencyCache('/tmp/cache.json');
    readFile.mockResolvedValueOnce(JSON.stringify(first));

    const initialDiff = await cache.evaluate(first);
    expect(initialDiff.changed.size).toBe(0);

    await cache.commit(first);
    expect(mkdir).toHaveBeenCalledWith('/tmp', { recursive: true });
    expect(writeFile).toHaveBeenCalledWith('/tmp/cache.json', `${JSON.stringify(first)}\n`, 'utf8');

    const secondDiff = await cache.evaluate(second);
    expect([...secondDiff.changed]).toEqual(['#/tokens/a']);
    expect([...secondDiff.removed]).toEqual([]);
  });

  it('rejects invalid snapshot payloads encountered during load', async () => {
    const cache = new FileSystemTokenDependencyCache('/tmp/cache.json');
    readFile.mockResolvedValueOnce('{"version":1,"entries":{}}');
    const snapshot = createTokenDependencySnapshot(
      createPlan(createSnapshot({ pointer: '#/tokens/a' })),
    );

    await expect(cache.evaluate(snapshot)).rejects.toThrow('Invalid dependency snapshot entries');
  });

  it('ignores snapshots with incompatible versions', async () => {
    const cache = new FileSystemTokenDependencyCache('/tmp/cache.json');
    readFile.mockResolvedValueOnce('{"version":0,"entries":[]}');
    const snapshot = createTokenDependencySnapshot(
      createPlan(createSnapshot({ pointer: '#/tokens/a' })),
    );

    const diff = await cache.evaluate(snapshot);

    expect([...diff.changed]).toEqual(['#/tokens/a']);
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('propagates filesystem errors other than missing files', async () => {
    const cache = new FileSystemTokenDependencyCache('/tmp/cache.json');
    readFile.mockRejectedValueOnce(new Error('boom'));
    const snapshot = createTokenDependencySnapshot(
      createPlan(createSnapshot({ pointer: '#/tokens/a' })),
    );

    await expect(cache.evaluate(snapshot)).rejects.toThrow('boom');
  });
});

function createPlan(...snapshots: BuildTokenSnapshot[]): BuildResolvedPlan {
  return {
    entries: [
      {
        tokens: snapshots,
      },
    ],
    diagnostics: [],
    resolvedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as unknown as BuildResolvedPlan;
}

interface SnapshotOverrides {
  readonly resolutionValue?: unknown;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly context?: Record<string, unknown>;
  readonly pointer?: JsonPointerLike;
}

function createSnapshot(overrides: SnapshotOverrides): BuildTokenSnapshot {
  const pointer = overrides.pointer ?? '#/delivery/example';
  const resolutionValue = Object.hasOwn(overrides, 'resolutionValue')
    ? overrides.resolutionValue
    : { value: 'example' };
  const metadata = Object.hasOwn(overrides, 'metadata') ? overrides.metadata : undefined;
  const context = overrides.context ?? { layer: 'delivery', theme: 'light' };
  return {
    pointer,
    sourcePointer: pointer,
    token: {
      id: 'delivery.example',
      value: { $type: 'dimension', $value: 16 },
      raw: { $type: 'dimension', $value: 16 },
    },
    metadata: metadata as Record<string, unknown> | undefined,
    resolution: {
      value: resolutionValue,
      references: [
        { uri: 'file:///tokens.json', pointer: '#/foundation/reference' },
        { uri: 'file:///tokens.json', pointer: '#/product/reference' },
      ],
      resolutionPath: [
        { uri: 'file:///tokens.json', pointer: '#/foundation/reference' },
        { uri: 'file:///tokens.json', pointer: '#/delivery/example' },
      ],
      appliedAliases: [{ uri: 'file:///tokens.json', pointer: '#/aliases/example' }],
    },
    provenance: {
      sourceId: 'virtual-doc',
      layer: 'delivery',
      layerIndex: 2,
      uri: 'file:///tokens.json',
      pointerPrefix: '#/delivery',
    },
    context,
  } as unknown as BuildTokenSnapshot;
}

type JsonPointerLike = string | readonly unknown[];

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import stringify from 'safe-stable-stringify';

import type { JsonPointer } from '@lapidist/dtif-parser';

import type { BuildResolvedPlan, BuildTokenSnapshot } from '../domain/models/tokens.js';

const SNAPSHOT_VERSION = 1;

/**
 * Represents the cached dependency metadata for a single token pointer.
 */
export interface TokenDependencyEntry {
  readonly pointer: string;
  readonly hash: string;
  readonly dependencies: readonly string[];
}

/**
 * Persisted snapshot of dependency hashes calculated for every token in a
 * resolved build plan.
 */
export interface TokenDependencySnapshot {
  readonly version: number;
  readonly resolvedAt: string;
  readonly entries: readonly TokenDependencyEntry[];
}

/**
 * Summary of how a new snapshot compares to the previously cached state.
 */
export interface TokenDependencyDiff {
  readonly snapshot: TokenDependencySnapshot;
  readonly changed: ReadonlySet<string>;
  readonly removed: ReadonlySet<string>;
}

/**
 * Abstraction for loading and storing dependency snapshots.
 */
export interface TokenDependencyCache {
  evaluate(snapshot: TokenDependencySnapshot): Promise<TokenDependencyDiff>;
  commit(snapshot: TokenDependencySnapshot): Promise<void>;
}

/**
 * File-system backed cache that stores dependency snapshots between runs of the
 * build pipeline.
 */
export class FileSystemTokenDependencyCache implements TokenDependencyCache {
  private loaded = false;
  private previous: TokenDependencySnapshot | undefined;

  constructor(private readonly filePath: string) {}

  async evaluate(snapshot: TokenDependencySnapshot): Promise<TokenDependencyDiff> {
    await this.ensureLoaded();
    const previous = this.previous;
    const diff = diffSnapshots(previous, snapshot);
    return diff;
  }

  async commit(snapshot: TokenDependencySnapshot): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const json = JSON.stringify(snapshot);
    await writeFile(this.filePath, `${json}\n`, 'utf8');
    this.previous = snapshot;
    this.loaded = true;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    try {
      const file = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(file);
      this.previous = assertSnapshot(parsed);
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
      this.previous = undefined;
    }
    this.loaded = true;
  }
}

/**
 * Generates a deterministic dependency snapshot from a resolved build plan.
 * @param {BuildResolvedPlan} resolved - Plan resolved by the build process.
 * @returns {TokenDependencySnapshot} Immutable dependency snapshot capturing token hashes and edges.
 */
export function createTokenDependencySnapshot(
  resolved: BuildResolvedPlan,
): TokenDependencySnapshot {
  const entries: TokenDependencyEntry[] = [];
  for (const source of resolved.entries) {
    for (const token of source.tokens) {
      const entry = createDependencyEntry(token);
      entries.push(entry);
    }
  }
  const sortedEntries = entries.toSorted((left, right) =>
    left.pointer.localeCompare(right.pointer),
  );
  return {
    version: SNAPSHOT_VERSION,
    resolvedAt: resolved.resolvedAt.toISOString(),
    entries: sortedEntries,
  } satisfies TokenDependencySnapshot;
}

/**
 * Creates a dependency entry capturing the token pointer, hash, and edges.
 * @param {BuildTokenSnapshot} snapshot - Snapshot representing a resolved token.
 * @returns {TokenDependencyEntry} Immutable dependency entry for the token.
 */
function createDependencyEntry(snapshot: BuildTokenSnapshot): TokenDependencyEntry {
  const pointer = toPointer(snapshot.pointer);
  const hash = createHash('sha256');
  hash.update(pointer);
  hash.update('\u0000');
  const resolution = snapshot.resolution;
  if (resolution?.value !== undefined) {
    hash.update(stringify(resolution.value));
  } else if (snapshot.token.value !== undefined) {
    hash.update(stringify(snapshot.token.value));
  } else if (snapshot.token.raw !== undefined) {
    hash.update(stringify(snapshot.token.raw));
  }
  hash.update('\u0000');
  if (snapshot.metadata) {
    hash.update(stringify(snapshot.metadata));
  }
  hash.update('\u0000');
  hash.update(stringify(snapshot.context));

  const dependencies = new Set<string>();
  if (resolution) {
    for (const reference of resolution.references) {
      dependencies.add(serializePointer(reference.uri, reference.pointer));
    }
    for (const pathEntry of resolution.resolutionPath) {
      dependencies.add(serializePointer(pathEntry.uri, pathEntry.pointer));
    }
    for (const alias of resolution.appliedAliases) {
      dependencies.add(serializePointer(alias.uri, alias.pointer));
    }
  }

  const dependencyList = [...dependencies].toSorted();
  for (const dependency of dependencyList) {
    hash.update('\u0000');
    hash.update(dependency);
  }

  return {
    pointer,
    hash: hash.digest('hex'),
    dependencies: dependencyList,
  } satisfies TokenDependencyEntry;
}

/**
 * Computes the diff between the previous and next dependency snapshots.
 * @param {TokenDependencySnapshot | undefined} previous - Previously cached snapshot, if available.
 * @param {TokenDependencySnapshot} next - Newly generated snapshot.
 * @returns {TokenDependencyDiff} Diff summary including changed and removed pointers.
 */
function diffSnapshots(
  previous: TokenDependencySnapshot | undefined,
  next: TokenDependencySnapshot,
): TokenDependencyDiff {
  const previousMap = new Map<string, TokenDependencyEntry>();
  if (previous && previous.version === SNAPSHOT_VERSION) {
    for (const entry of previous.entries) {
      previousMap.set(entry.pointer, entry);
    }
  }

  const changed = new Set<string>();
  const removed = new Set<string>();
  const nextMap = new Map<string, TokenDependencyEntry>();
  for (const entry of next.entries) {
    nextMap.set(entry.pointer, entry);
    const existing = previousMap.get(entry.pointer);
    if (!existing || existing.hash !== entry.hash) {
      changed.add(entry.pointer);
    }
  }

  for (const pointer of previousMap.keys()) {
    if (!nextMap.has(pointer)) {
      removed.add(pointer);
      changed.add(pointer);
    }
  }

  return {
    snapshot: next,
    changed,
    removed,
  } satisfies TokenDependencyDiff;
}

/**
 * Serialises a URI and JSON pointer pair into a stable string key.
 * @param {string} uri - Document URI associated with the pointer.
 * @param {JsonPointer} pointer - JSON pointer referencing a token within the document.
 * @returns {string} Combined pointer reference string.
 */
function serializePointer(uri: string, pointer: JsonPointer): string {
  return `${uri}#${toPointer(pointer)}`;
}

/**
 * Normalises a JSON pointer into string form.
 * @param {JsonPointer} pointer - Pointer to normalise.
 * @returns {string} Pointer as a string.
 */
function toPointer(pointer: JsonPointer): string {
  return typeof pointer === 'string' ? pointer : String(pointer);
}

/**
 * Validates and coerces raw JSON content into a dependency snapshot object.
 * @param {unknown} value - Raw value read from disk.
 * @returns {TokenDependencySnapshot | undefined} Parsed snapshot when compatible with the expected version.
 */
function assertSnapshot(value: unknown): TokenDependencySnapshot | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object') {
    throw new TypeError('Invalid dependency snapshot payload');
  }
  const record = value as Record<string, unknown>;
  const version = record['version'];
  if (version !== SNAPSHOT_VERSION) {
    return undefined;
  }
  const entriesRaw = record['entries'];
  if (!Array.isArray(entriesRaw)) {
    throw new TypeError('Invalid dependency snapshot entries');
  }
  const entries: TokenDependencyEntry[] = [];
  for (const rawEntry of entriesRaw) {
    if (typeof rawEntry !== 'object' || rawEntry === null) {
      throw new TypeError('Invalid dependency entry');
    }
    const entryRecord = rawEntry as Record<string, unknown>;
    const pointer = entryRecord['pointer'];
    const hash = entryRecord['hash'];
    const dependenciesRaw = entryRecord['dependencies'];
    if (typeof pointer !== 'string' || typeof hash !== 'string') {
      throw new TypeError('Invalid dependency entry fields');
    }
    const dependencies = Array.isArray(dependenciesRaw)
      ? dependenciesRaw.filter((dep): dep is string => typeof dep === 'string')
      : [];
    entries.push({ pointer, hash, dependencies });
  }
  const resolvedAtRaw = record['resolvedAt'];
  const resolvedAt = typeof resolvedAtRaw === 'string' ? resolvedAtRaw : new Date().toISOString();
  return {
    version: SNAPSHOT_VERSION,
    resolvedAt,
    entries,
  } satisfies TokenDependencySnapshot;
}

/**
 * Type guard that identifies Node.js ENOENT filesystem errors.
 * @param {unknown} error - Unknown error to inspect.
 * @returns {boolean} True when the error corresponds to a missing file.
 */
function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

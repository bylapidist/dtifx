import { JSON_POINTER_ROOT, appendJsonPointer, splitJsonPointer } from '@lapidist/dtif-parser';
import type { JsonPointer } from '@lapidist/dtif-parser';

export interface TokenMetricsSnapshot {
  readonly pointer: JsonPointer;
  readonly sourcePointer?: JsonPointer;
  readonly token: {
    readonly type?: string;
  };
  readonly provenance: {
    readonly uri: string;
  };
  readonly resolution?: {
    readonly type?: string;
    readonly references?: readonly {
      readonly pointer: JsonPointer;
      readonly uri: string;
    }[];
    readonly appliedAliases: readonly {
      readonly pointer: JsonPointer;
      readonly uri: string;
    }[];
  };
}

/**
 * Histogram statistics describing the alias depth of resolved tokens.
 */
export interface AliasDepthMetrics {
  readonly average: number;
  readonly max: number;
  readonly histogram: Readonly<Record<number, number>>;
}

/**
 * Summary information about token reference reachability.
 */
export interface TokenReferenceMetrics {
  readonly referencedCount: number;
  readonly unreferencedCount: number;
  readonly unreferencedSamples: readonly JsonPointer[];
}

/**
 * Aggregate metrics describing a snapshot of resolved tokens.
 */
export interface TokenMetrics {
  readonly totalCount: number;
  readonly typedCount: number;
  readonly untypedCount: number;
  readonly typeCounts: Readonly<Record<string, number>>;
  readonly aliasDepth: AliasDepthMetrics;
  readonly references: TokenReferenceMetrics;
}

/**
 * Computes telemetry metrics for a collection of resolved token snapshots.
 *
 * @param tokens - Snapshots sourced from the resolution session.
 * @returns Aggregated metrics describing the provided tokens.
 */
export function collectTokenMetrics(tokens: readonly TokenMetricsSnapshot[]): TokenMetrics {
  const totalCount = tokens.length;
  const typeCounts = new Map<string, number>();
  let typedCount = 0;

  const aliasHistogram = new Map<number, number>();
  let aliasTotal = 0;
  let aliasMax = 0;

  const tokenIndex = new Map<string, TokenMetricsSnapshot>();
  const inboundCounts = new Map<string, number>();

  for (const token of tokens) {
    const sourcePointer = token.sourcePointer ?? token.pointer;
    const key = createTokenKey(token.provenance.uri, sourcePointer);
    tokenIndex.set(key, token);
    inboundCounts.set(key, 0);

    const type = token.token.type ?? token.resolution?.type;
    if (type) {
      typedCount += 1;
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    }

    const aliasDepth = token.resolution ? token.resolution.appliedAliases.length : 0;
    aliasHistogram.set(aliasDepth, (aliasHistogram.get(aliasDepth) ?? 0) + 1);
    aliasTotal += aliasDepth;
    if (aliasDepth > aliasMax) {
      aliasMax = aliasDepth;
    }
  }

  for (const token of tokens) {
    const references = token.resolution?.references;
    if (!references || references.length === 0) {
      continue;
    }
    const sourcePointer = token.sourcePointer ?? token.pointer;
    const ownKey = createTokenKey(token.provenance.uri, sourcePointer);
    const seen = new Set<string>();

    for (const reference of references) {
      const pointer = normaliseReferencePointer(reference.pointer);
      const key = createTokenKey(reference.uri, pointer);
      if (key === ownKey) {
        continue;
      }
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (!inboundCounts.has(key)) {
        continue;
      }
      inboundCounts.set(key, (inboundCounts.get(key) ?? 0) + 1);
    }
  }

  let referencedCount = 0;
  const unreferencedSamples: JsonPointer[] = [];
  for (const [key, count] of inboundCounts) {
    if (count > 0) {
      referencedCount += 1;
      continue;
    }
    const snapshot = tokenIndex.get(key);
    if (snapshot && unreferencedSamples.length < 10) {
      unreferencedSamples.push(snapshot.pointer);
    }
  }

  const aliasAverage = totalCount === 0 ? 0 : aliasTotal / totalCount;

  return {
    totalCount,
    typedCount,
    untypedCount: totalCount - typedCount,
    typeCounts: Object.fromEntries(typeCounts),
    aliasDepth: {
      average: aliasAverage,
      max: aliasMax,
      histogram: Object.fromEntries(aliasHistogram),
    },
    references: {
      referencedCount,
      unreferencedCount: totalCount - referencedCount,
      unreferencedSamples,
    },
  } satisfies TokenMetrics;
}

function createTokenKey(uri: string, pointer: JsonPointer): string {
  return `${uri}::${pointer}`;
}

function normaliseReferencePointer(pointer: JsonPointer): JsonPointer {
  const segments = splitJsonPointer(pointer);
  if (segments.length === 0) {
    return pointer;
  }
  let end = segments.length;
  while (end > 0 && segments[end - 1] === '$value') {
    end -= 1;
  }
  if (end === segments.length) {
    return pointer;
  }
  if (end === 0) {
    return JSON_POINTER_ROOT;
  }
  return appendJsonPointer(JSON_POINTER_ROOT, ...segments.slice(0, end));
}

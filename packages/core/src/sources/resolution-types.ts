import type {
  DocumentGraph,
  DocumentResolver,
  DtifFlattenedToken,
  JsonPointer,
  RawDocument,
  ResolvedTokenView,
  TokenId,
  TokenMetadataSnapshot as DtifTokenMetadataSnapshot,
} from '@lapidist/dtif-parser';

import type { DiagnosticEvent } from '../instrumentation/diagnostics.js';
import type { TokenSet, TokenSnapshot } from '../tokens/index.js';

export type TokenResolutionCacheStatus = 'hit' | 'miss' | 'skip';

export interface TokenMetadataSnapshot extends DtifTokenMetadataSnapshot {
  readonly lastModified?: string;
  readonly lastUsed?: string;
  readonly usageCount?: number;
  readonly author?: string;
  readonly tags?: readonly string[];
  readonly hash?: string;
}

export interface TokenResolutionSnapshot extends TokenSnapshot {
  readonly pointer: JsonPointer;
  readonly sourcePointer: JsonPointer;
  readonly token: DtifFlattenedToken;
  readonly metadata?: TokenMetadataSnapshot;
  readonly resolution?: ResolvedTokenView;
  readonly provenance: {
    readonly sourceId: string;
    readonly layer: string;
    readonly layerIndex: number;
    readonly uri: string;
    readonly pointerPrefix: JsonPointer;
  };
  readonly context: Readonly<Record<string, unknown>>;
}

export interface TokenResolvedSource {
  readonly sourceId: string;
  readonly pointerPrefix: JsonPointer;
  readonly layer: string;
  readonly layerIndex: number;
  readonly uri: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly tokens: readonly TokenResolutionSnapshot[];
  readonly tokenSet: TokenSet;
  readonly diagnostics: readonly DiagnosticEvent[];
  readonly metadataIndex: ReadonlyMap<TokenId, TokenMetadataSnapshot>;
  readonly resolutionIndex: ReadonlyMap<TokenId, ResolvedTokenView>;
  readonly document?: RawDocument;
  readonly graph?: DocumentGraph;
  readonly resolver?: DocumentResolver;
  readonly cacheStatus: TokenResolutionCacheStatus;
}

export interface TokenResolvedPlan {
  readonly entries: readonly TokenResolvedSource[];
  readonly diagnostics: readonly DiagnosticEvent[];
  readonly snapshots: readonly TokenResolutionSnapshot[];
  readonly metadata: ReadonlyMap<TokenId, TokenMetadataSnapshot>;
  readonly resolutions: ReadonlyMap<TokenId, ResolvedTokenView>;
  readonly resolvedAt: Date;
}

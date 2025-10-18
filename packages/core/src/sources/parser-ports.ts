import type {
  DocumentCache,
  ParseSessionOptions,
  TokenCache,
  TokenId,
  ResolvedTokenView,
} from '@lapidist/dtif-parser';
import type { DiagnosticEvent, DiagnosticsPort } from '../instrumentation/diagnostics.js';
import type { TokenSourcePlan } from './config.js';
import type {
  TokenMetadataSnapshot,
  TokenResolutionSnapshot,
  TokenResolvedSource,
} from './resolution-types.js';

export type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';

export interface SessionTokenParserOptions {
  readonly documentCache?: DocumentCache;
  readonly tokenCache?: TokenCache;
  readonly sessionOptions?: ParseSessionOptions;
  readonly includeGraphs?: boolean;
  readonly flatten?: boolean;
}

export interface ParserMetrics {
  readonly entryCount: number;
  readonly totalMs: number;
  readonly parseMs: number;
  readonly cache: {
    readonly hits: number;
    readonly misses: number;
    readonly skipped: number;
  };
}

export interface ParserExecutionOptions {
  readonly flatten?: boolean;
  readonly includeGraphs?: boolean;
  readonly sessionOptions?: ParseSessionOptions;
  readonly documentCache?: DocumentCache;
  readonly tokenCache?: TokenCache;
  readonly diagnostics?: DiagnosticsPort;
}

export interface ParserResult {
  readonly sources: readonly TokenResolvedSource[];
  readonly snapshots: readonly TokenResolutionSnapshot[];
  readonly diagnostics: readonly DiagnosticEvent[];
  readonly metadata: ReadonlyMap<TokenId, TokenMetadataSnapshot>;
  readonly resolutions: ReadonlyMap<TokenId, ResolvedTokenView>;
}

export interface ParserPort {
  parse(plan: TokenSourcePlan, options: ParserExecutionOptions): Promise<ParserResult>;
}

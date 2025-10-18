import type { TransformCache } from '../../transform/transform-cache.js';
import type { TransformDefinition, TransformResult } from '../../transform/transform-registry.js';
import type { BuildTokenSnapshot } from '../models/tokens.js';

export interface TransformRegistryPort {
  list(): readonly TransformDefinition[];
  get(name: string): TransformDefinition | undefined;
}

export type TransformCachePort = TransformCache;

export interface TransformationRequest {
  readonly snapshots: readonly BuildTokenSnapshot[];
  readonly changedPointers?: ReadonlySet<string>;
  readonly group?: string;
}

export interface TransformationResponse {
  readonly results: readonly TransformResult[];
  readonly durationMs: number;
}

export interface TransformationPort {
  run(request: TransformationRequest): Promise<TransformationResponse>;
}

export interface TransformExecutorRunOptions {
  readonly changedPointers?: ReadonlySet<string>;
  readonly group?: string;
}

export interface TransformExecutorPort {
  run(
    snapshots: readonly BuildTokenSnapshot[],
    options?: TransformExecutorRunOptions,
  ): Promise<readonly TransformResult[]>;
}

export type {
  TransformCacheEntry,
  TransformCacheKey,
  TransformCacheStatus,
} from '../../transform/transform-cache.js';

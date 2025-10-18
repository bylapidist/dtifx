import type {
  TokenDependencyCache,
  TokenDependencyDiff,
  TokenDependencySnapshot,
} from '../../incremental/token-dependency-cache.js';
import type { BuildResolvedPlan } from '../models/tokens.js';

export type DependencyStorePort = TokenDependencyCache;

export interface DependencySnapshotBuilderPort {
  create(resolved: BuildResolvedPlan): TokenDependencySnapshot | Promise<TokenDependencySnapshot>;
}

export interface DependencyDiffStrategyPort {
  diff(
    resolved: BuildResolvedPlan,
    snapshot: TokenDependencySnapshot,
    context: { store?: DependencyStorePort },
  ): Promise<TokenDependencyDiff>;
}

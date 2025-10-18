export type {
  TokenSetLike,
  TokenChangeKind,
  TokenChangeImpact,
  TokenDiffFilter,
  TokenFieldChange,
  TokenAddition,
  TokenRemoval,
  TokenModification,
  TokenRename,
  TokenDiffSummary,
  TokenDiffResult,
  TokenDiffTypeSummary,
  TokenDiffGroupSummary,
  VersionBump,
} from './domain/diff-types.js';

export {
  diffTokenSets,
  filterTokenDiff,
  collectTokenChanges,
  detectTokenRenames,
  summarizeTokenDiff,
  recommendVersionBump,
} from './domain/diff-engine.js';
export type { DiffEngineOptions, TokenChangeCollections } from './domain/diff-engine.js';
export type {
  TokenImpactStrategy,
  FieldImpactStrategyOptions,
} from './domain/strategies/impact.js';
export {
  DefaultTokenImpactStrategy,
  createFieldImpactStrategy,
} from './domain/strategies/impact.js';
export type {
  TokenRenameStrategy,
  RenameMatchPredicate,
  StructuralRenameStrategyOptions,
} from './domain/strategies/rename.js';
export {
  DefaultTokenRenameStrategy,
  createTokenRenameStrategy,
  createStructuralRenameStrategy,
} from './domain/strategies/rename.js';
export type { TokenSummaryStrategy } from './domain/strategies/summary.js';
export { DefaultTokenSummaryStrategy } from './domain/strategies/summary.js';

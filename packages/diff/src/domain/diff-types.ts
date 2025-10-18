import type { TokenSet, TokenSnapshot } from './tokens.js';

export type TokenSetLike = TokenSet | ReadonlyMap<string, TokenSnapshot>;

export type TokenChangeKind = 'added' | 'removed' | 'changed' | 'renamed';

export type TokenChangeImpact = 'breaking' | 'non-breaking';

export type VersionBump = 'none' | 'patch' | 'minor' | 'major';

export interface TokenDiffFilter {
  readonly types?: readonly string[];
  readonly paths?: readonly string[];
  readonly impacts?: readonly TokenChangeImpact[];
  readonly impact?: TokenChangeImpact | readonly TokenChangeImpact[];
  readonly kinds?: readonly TokenChangeKind[];
  readonly kind?: TokenChangeKind | readonly TokenChangeKind[];
  readonly groups?: readonly string[];
}

export type TokenFieldChange =
  | 'value'
  | 'raw'
  | 'ref'
  | 'type'
  | 'description'
  | 'extensions'
  | 'deprecated'
  | 'references'
  | 'resolutionPath'
  | 'appliedAliases';

export interface BaseTokenChange {
  readonly kind: TokenChangeKind;
  readonly id: string;
  readonly impact: TokenChangeImpact;
}

export interface TokenAddition extends BaseTokenChange {
  readonly kind: 'added';
  readonly next: TokenSnapshot;
}

export interface TokenRemoval extends BaseTokenChange {
  readonly kind: 'removed';
  readonly previous: TokenSnapshot;
}

export interface TokenModification extends BaseTokenChange {
  readonly kind: 'changed';
  readonly previous: TokenSnapshot;
  readonly next: TokenSnapshot;
  readonly changes: readonly TokenFieldChange[];
}

export interface TokenRename {
  readonly kind: 'renamed';
  readonly impact: TokenChangeImpact;
  readonly previousId: string;
  readonly nextId: string;
  readonly previous: TokenSnapshot;
  readonly next: TokenSnapshot;
}

export interface TokenDiffSummary {
  readonly totalPrevious: number;
  readonly totalNext: number;
  readonly added: number;
  readonly removed: number;
  readonly renamed: number;
  readonly changed: number;
  readonly unchanged: number;
  readonly breaking: number;
  readonly nonBreaking: number;
  readonly valueChanged: number;
  readonly metadataChanged: number;
  readonly recommendedBump: VersionBump;
  readonly types: readonly TokenDiffTypeSummary[];
  readonly groups: readonly TokenDiffGroupSummary[];
}

export interface TokenDiffResult {
  readonly added: readonly TokenAddition[];
  readonly removed: readonly TokenRemoval[];
  readonly changed: readonly TokenModification[];
  readonly renamed: readonly TokenRename[];
  readonly summary: TokenDiffSummary;
}

export interface TokenDiffTypeSummary {
  readonly type: string;
  readonly totalPrevious: number;
  readonly totalNext: number;
  readonly added: number;
  readonly removed: number;
  readonly renamed: number;
  readonly changed: number;
  readonly unchanged: number;
  readonly breaking: number;
  readonly nonBreaking: number;
  readonly valueChanged: number;
  readonly metadataChanged: number;
}

export interface TokenDiffGroupSummary {
  readonly group: string;
  readonly totalPrevious: number;
  readonly totalNext: number;
  readonly added: number;
  readonly removed: number;
  readonly renamed: number;
  readonly changed: number;
  readonly unchanged: number;
  readonly breaking: number;
  readonly nonBreaking: number;
  readonly valueChanged: number;
  readonly metadataChanged: number;
}

export interface SummaryScope {
  readonly previousIds?: ReadonlySet<string>;
  readonly nextIds?: ReadonlySet<string>;
}

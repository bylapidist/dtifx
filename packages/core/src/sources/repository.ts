import type { DesignTokenInterchangeFormat } from '@lapidist/dtif-schema';
import type { JsonPointer } from '@lapidist/dtif-parser';

import type { TokenSourceRepositoryIssue } from '../token-sources/issues.js';
import type { TokenLayerConfig, TokenSourceConfig } from './config.js';

export interface TokenSourceDiscoveryContext {
  readonly layer: TokenLayerConfig;
  readonly source: TokenSourceConfig;
}

export interface TokenSourceDocument {
  readonly uri: string;
  readonly document: DesignTokenInterchangeFormat;
  readonly pointerPrefix: JsonPointer;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface TokenSourceDiscoveryOutcome {
  readonly documents: readonly TokenSourceDocument[];
  readonly issues: readonly TokenSourceRepositoryIssue[];
}

export interface TokenSourceRepositoryPort {
  discover(context: TokenSourceDiscoveryContext): Promise<TokenSourceDiscoveryOutcome>;
}

import type {
  TokenSourceRepositoryIssue as CoreTokenSourceRepositoryIssue,
  TokenSourceValidationIssue as CoreTokenSourceValidationIssue,
} from '@dtifx/core';
import type {
  TokenSourceDiscoveryContext as CoreTokenSourceDiscoveryContext,
  TokenSourceDiscoveryOutcome as CoreTokenSourceDiscoveryOutcome,
  TokenSourceDocument as CoreTokenSourceDocument,
  TokenSourceRepositoryPort as CoreTokenSourceRepositoryPort,
} from '@dtifx/core/sources';
import type { JsonPointer } from '@lapidist/dtif-parser';

import type { LayerConfig, SourceConfig } from '../../config/index.js';

export type SourceDiscoveryContext = CoreTokenSourceDiscoveryContext & {
  readonly layer: LayerConfig;
  readonly source: SourceConfig;
};

export type SourceDocument = CoreTokenSourceDocument;

export type SourceDiscoveryOutcome = Omit<CoreTokenSourceDiscoveryOutcome, 'issues'> & {
  readonly issues: readonly SourceRepositoryIssue[];
};

export interface SourceRepositoryPort extends CoreTokenSourceRepositoryPort {
  discover(context: SourceDiscoveryContext): Promise<SourceDiscoveryOutcome>;
}

export type SourceRepositoryIssue = CoreTokenSourceRepositoryIssue;

export type SchemaValidationIssue = CoreTokenSourceValidationIssue & {
  readonly pointerPrefix: JsonPointer;
  readonly pointer: JsonPointer;
  readonly instancePath: JsonPointer;
};

export type SourceIssue = SchemaValidationIssue | SourceRepositoryIssue;

export interface SchemaValidationPort {
  validate(
    document: SourceDocument,
    context: SourceDiscoveryContext,
  ): Promise<readonly SchemaValidationIssue[] | undefined>;
}

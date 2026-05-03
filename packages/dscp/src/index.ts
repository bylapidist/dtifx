export { buildDocument, generate } from './generator.js';
export { renderMarkdown, DSCP_SCHEMA_URI, DSCP_SPEC_VERSION } from '@lapidist/dscp';
export type {
  DSCPDocument,
  DSCPTokenEntry,
  DSCPTokenGraph,
  DSCPComponentEntry,
  DSCPComponentSummary,
  DSCPDeprecationEntry,
  DSCPViolationPattern,
  DSCPRuleSummary,
  DSCPRuleSeverity,
  DSCPSectionTag,
  GenerateOptions,
} from './types.js';

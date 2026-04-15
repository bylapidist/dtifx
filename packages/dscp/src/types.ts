/**
 * Re-exports the canonical DSCP types from `@lapidist/dscp`.
 *
 * `@dtifx/dscp` is the dtifx authoring path for DSCP document generation.
 * It uses the same envelope shape as the canonical spec so that DSCP
 * documents produced from dtifx build outputs are interoperable with those
 * produced by the design-lint kernel.
 */
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
} from '@lapidist/dscp';

/**
 * Input options for the dtifx DSCP document generator.
 */
export interface GenerateOptions {
  /** Path to the dtifx build output directory containing resolved token files. */
  from: string;
  /** Path to write the generated DESIGN_SYSTEM.md document. */
  out: string;
}

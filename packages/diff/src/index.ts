export type {
  LoadTokenFileOptions,
  RawTokenTree,
  TokenDeprecation,
  TokenPath,
  TokenSet,
  TokenSnapshot,
  TokenSourceLocation,
} from './token-set.js';
export { createTokenId, createTokenSetFromTree, loadTokenFile } from './token-set.js';

export type {
  DiffSessionDependencies,
  DiffSessionRequest,
  DiffSessionResult,
} from './application/diff-session.js';
export { runDiffSession, TokenSourceLoadError } from './application/diff-session.js';

export type {
  TokenSourcePort,
  TokenSourceLabel,
  TokenSourceContext,
} from './application/ports/token-source.js';
export type { TokenSourceLoadFailure } from './application/token-loader.js';

export type { DiffFilterOptions, DiffFilterResolution } from './application/filters.js';
export { resolveDiffFilter } from './application/filters.js';

export type {
  FileTokenSource,
  SessionTokenSource,
  SessionTokenSources,
  SessionTokenSourcePortOptions,
} from './adapters/token-source/session-token-source.js';
export {
  createSessionTokenSourcePort,
  describeTokenSource,
  formatTokenSourceLabel,
} from './adapters/token-source/session-token-source.js';
export {
  createTokenParserDiagnosticEvent,
  type TokenParserDiagnosticEventOptions,
  emitTokenParserDiagnostic,
  emitTokenSourceDiagnostic,
} from './adapters/token-source/diagnostics.js';

export { createRunContext, type CreateRunContextOptions } from './reporting/index.js';

export type {
  TokenAddition,
  TokenChangeImpact,
  TokenChangeKind,
  TokenDiffFilter,
  TokenDiffResult,
  TokenDiffSummary,
  TokenDiffTypeSummary,
  TokenFieldChange,
  TokenModification,
  TokenRename,
  TokenRemoval,
  TokenSetLike,
  VersionBump,
  DiffEngineOptions,
  TokenImpactStrategy,
  FieldImpactStrategyOptions,
  TokenRenameStrategy,
  RenameMatchPredicate,
  StructuralRenameStrategyOptions,
  TokenSummaryStrategy,
} from './diff.js';
export {
  collectTokenChanges,
  detectTokenRenames,
  diffTokenSets,
  filterTokenDiff,
  recommendVersionBump,
  summarizeTokenDiff,
  createFieldImpactStrategy,
  createTokenRenameStrategy,
  createStructuralRenameStrategy,
} from './diff.js';

export type {
  DiffFailurePolicy,
  DiffFailureReason,
  DiffFailureResult,
} from './domain/failure-policy.js';
export { evaluateDiffFailure } from './domain/failure-policy.js';

export {
  createReportDescriptor,
  type CreateReportDescriptorOptions,
  type ReportDescriptor,
  type ReportGroupSection,
  type ReportHotspot,
  type ReportRiskItem,
  type ReportSummaryView,
  type ReportTypeOperations,
  type ReportTypeSection,
  createOperationSummaryDescriptor,
  type OperationSummaryDescriptor,
  getStandardFooterSections,
  type ReportFooterSection,
  createReportRendererRegistry,
  type ReportRendererRegistry,
  type ReportRendererPort,
  type ReportRendererContext,
  renderReport,
  type RenderReportOptions,
  type ReportRenderFormat,
  type DiagnosticsPort,
  type DiagnosticEvent,
  type DiagnosticLevel,
  type DiagnosticCategory,
  createNullDiagnosticsPort,
  DiagnosticCategories,
  DiagnosticScopes,
  formatTokenSourceScope,
  formatReportingScope,
  emitRendererDiagnostic,
  formatDiffAsCli,
  type CliFormatterOptions,
  formatDiffAsHtml,
  type HtmlFormatterOptions,
  formatDiffAsMarkdown,
  type MarkdownFormatterOptions,
  createJsonPayload,
  formatDiffAsJson,
  type JsonFormatterOptions,
  formatDiffAsYaml,
  type YamlFormatterOptions,
  formatDiffAsSarif,
  type SarifFormatterOptions,
  formatDiffWithTemplate,
  type TemplateFormatterOptions,
  supportsCliHyperlinks,
  describeAddition,
  describeModification,
  describeRemoval,
  describeRename,
  type EntryGuidance,
  describeRunComparison,
  formatRunDuration,
  formatRunTimestamp,
  type ReportRunContext,
} from './reporting/index.js';

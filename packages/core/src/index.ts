export type PackageName = `@dtifx/${string}`;

export interface PackageManifest {
  readonly name: PackageName;
  readonly summary: string;
}

export type FrozenManifest<T extends PackageManifest = PackageManifest> = Readonly<T>;

export const createPlaceholderManifest = <T extends PackageManifest>(
  manifest: T,
): FrozenManifest<T> => Object.freeze({ ...manifest });

export {
  JsonLineLogger,
  noopLogger,
  type LogLevel,
  type StructuredLogEvent,
  type StructuredLogger,
} from './logging/index.js';

export { detectParallelism } from './concurrency/detect.js';
export {
  normaliseConcurrency,
  runTaskQueue,
  type TaskDefinition,
  type TaskQueueMetrics,
  type TaskQueueOptions,
  type TaskQueueOutcome,
  type TaskResult,
} from './concurrency/queue.js';

export { append } from './collections/append.js';

export {
  escapeHtml,
  escapeMarkdown,
  formatDurationMs,
  formatUnknownError,
  serialiseError,
  writeJson,
  writeLine,
  type WritableTarget,
} from './reporting/index.js';

export {
  INLINE_SOURCE_URI,
  cloneTokenExtensions,
  cloneTokenValue,
  createDefaultSourceLocation,
  createInlineResolver,
  createTokenId,
  createTokenPointer,
  createTokenPointerFromTarget,
  createTokenSetFromParseResult,
  createSourceLocation,
  resolveDocumentUri,
  resolveSourceUri,
  type DesignTokenInterchangeFormat,
  type CreateTokenSetFromParseResultOptions,
  type TokenSnapshotContext,
  type TokenSnapshotDraft,
  type TokenDeprecation,
  type TokenPath,
  type TokenPointer,
  type TokenResolution,
  type TokenResolutionToken,
  type TokenResolutionTraceStep,
  type TokenSet,
  type TokenSetResolver,
  type TokenSnapshot,
  type TokenSourceLocation,
} from './tokens/index.js';

export {
  createNullDiagnosticsPort,
  DiagnosticCategories,
  DiagnosticScopes,
  formatReportingScope,
  type DiagnosticCategory,
  type DiagnosticEvent,
  type DiagnosticLevel,
  type DiagnosticRelatedInformation,
  type DiagnosticSpan,
  type DiagnosticsPort,
} from './instrumentation/diagnostics.js';

export {
  createRunContext,
  describeRunComparison,
  formatRunDuration,
  formatRunTimestamp,
  type CreateRunContextOptions,
  type RunContext,
} from './instrumentation/run-context.js';

export {
  convertParserDiagnostic,
  convertParserDiagnosticRelatedInformation,
  convertParserDiagnosticSpan,
  mapParserDiagnosticSeverity,
  type ParserDiagnosticPosition,
  type ParserDiagnostic,
  type ParserDiagnosticRelatedInformation,
  type ParserDiagnosticSpan,
  type ParserDiagnosticSeverity,
} from './instrumentation/parser-diagnostics.js';

export {
  createDiagnosticsAwareParserHooks,
  createTokenParserDiagnosticEvent,
  emitTokenParserDiagnostic,
  emitTokenSourceDiagnostic,
  formatParserDiagnosticMessage,
  sanitizeDiagnosticMessage,
  type DiagnosticsAwareParserHooksOptions,
  type ParserHooks,
  type TokenParserDiagnosticEventOptions,
} from './instrumentation/parser-hooks.js';

export {
  convertTokenSourceIssueToDiagnostic,
  convertTokenSourceIssues,
  formatTokenSourceScope,
  type TokenSourceContext,
  type TokenSourceDiagnosticsPort,
  type TokenSourceIssue,
  type TokenSourceIssueDiagnosticOptions,
  type TokenSourceIssueSeverity,
  type TokenSourceLabel,
  type TokenSourcePort,
  type TokenSourceRepositoryIssue,
  type TokenSourceValidationIssue,
} from './token-sources/index.js';

export {
  createPolicyViolationSummary,
  POLICY_SEVERITIES,
  summarisePolicyViolations,
  type PolicySeverity,
  type PolicyViolationLike,
  type PolicyViolationSummary,
} from './policy/index.js';

export {
  createTelemetryTracer,
  createTelemetryRuntime,
  noopTelemetryTracer,
} from './telemetry/index.js';
export type {
  TelemetryAttributeValue,
  TelemetryAttributes,
  TelemetryMode,
  TelemetryRuntime,
  TelemetrySpan,
  TelemetrySpanEndOptions,
  TelemetrySpanOptions,
  TelemetrySpanStatus,
  TelemetryTracer,
  TelemetryTracerOptions,
} from './telemetry/index.js';

export * from './sources/index.js';
export * from './runtime/index.js';

export {
  DEFAULT_DTIFX_CONFIG_FILES,
  loadConfigModule,
  resolveConfigPath,
  type LoadConfigModuleOptions,
  type LoadedConfigModule,
  type ResolveConfigPathOptions,
} from './config/index.js';

export * from './prefabs/index.js';

const manifestDefinition = {
  name: '@dtifx/core',
  summary: 'Foundational runtime, logging, and manifest utilities that power DTIFx automation.',
} as const satisfies PackageManifest;

export const manifest = createPlaceholderManifest(manifestDefinition);

export const describe = (): PackageManifest => ({ ...manifest });

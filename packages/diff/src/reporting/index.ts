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
} from './report-descriptor.js';
export {
  type ReportRunContext,
  type CreateRunContextOptions,
  describeRunComparison,
  formatRunDuration,
  formatRunTimestamp,
  createRunContext,
} from './run-context.js';
export {
  type EntryGuidance,
  describeAddition,
  describeModification,
  describeRemoval,
  describeRename,
} from './change-guidance.js';
export { getStandardFooterSections, type ReportFooterSection } from './layout/footers.js';
export {
  createOperationSummaryDescriptor,
  type OperationSummaryDescriptor,
} from './layout/operations.js';
export {
  createReportRendererRegistry,
  type ReportRendererRegistry,
  type ReportRendererPort,
  renderReport,
  type RenderReportOptions,
  type ReportRenderFormat,
  supportsCliHyperlinks,
  createJsonPayload,
} from './registry.js';
export type { ReportRendererContext } from '../application/ports/reporting.js';
export {
  type DiagnosticEvent,
  type DiagnosticLevel,
  type DiagnosticCategory,
  type DiagnosticsPort,
  createNullDiagnosticsPort,
  DiagnosticCategories,
  DiagnosticScopes,
  formatReportingScope,
  formatTokenSourceScope,
} from '../application/ports/diagnostics.js';
export { emitRendererDiagnostic } from './diagnostics.js';
export { formatDiffAsCli, type CliFormatterOptions } from './renderers/cli.js';
export { formatDiffAsHtml, type HtmlFormatterOptions } from './renderers/html.js';
export { formatDiffAsMarkdown, type MarkdownFormatterOptions } from './renderers/markdown.js';
export { formatDiffAsJson, type JsonFormatterOptions } from './renderers/json.js';
export { formatDiffAsYaml, type YamlFormatterOptions } from './renderers/yaml.js';
export { formatDiffAsSarif, type SarifFormatterOptions } from './renderers/sarif.js';
export { formatDiffWithTemplate, type TemplateFormatterOptions } from './renderers/template.js';

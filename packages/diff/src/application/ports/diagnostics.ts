import { formatTokenSourceScope as formatCoreTokenSourceScope } from '@dtifx/core';
import type { TokenSourceLabel } from './token-source.js';

export {
  createNullDiagnosticsPort,
  convertParserDiagnostic,
  convertParserDiagnosticRelatedInformation,
  convertParserDiagnosticSpan,
  DiagnosticCategories,
  DiagnosticScopes,
  formatReportingScope,
  mapParserDiagnosticSeverity,
} from '@dtifx/core';

export type {
  DiagnosticCategory,
  DiagnosticEvent,
  ParserDiagnosticPosition,
  ParserDiagnostic,
  ParserDiagnosticRelatedInformation,
  ParserDiagnosticSpan,
  ParserDiagnosticSeverity,
  DiagnosticLevel,
  DiagnosticRelatedInformation,
  DiagnosticSpan,
  DiagnosticsPort,
} from '@dtifx/core';

export const formatTokenSourceScope: (label: TokenSourceLabel) => string =
  formatCoreTokenSourceScope;

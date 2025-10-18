import type {
  DiagnosticEvent,
  DiagnosticLevel,
  DiagnosticRelatedInformation,
  DiagnosticSpan,
} from './diagnostics.js';

export type ParserDiagnosticSeverity = 'info' | 'warning' | 'error' | (string & {});

export interface ParserDiagnosticPosition {
  readonly line: number;
  readonly column: number;
}

export interface ParserDiagnosticSpan {
  readonly start: ParserDiagnosticPosition;
  readonly end?: ParserDiagnosticPosition;
}

export interface ParserDiagnosticRelatedInformation {
  readonly message: string;
  readonly pointer?: string;
  readonly span?: ParserDiagnosticSpan;
}

export interface ParserDiagnostic {
  readonly severity: ParserDiagnosticSeverity;
  readonly message: string;
  readonly code?: string;
  readonly pointer?: string;
  readonly span?: ParserDiagnosticSpan;
  readonly related?: readonly ParserDiagnosticRelatedInformation[];
}

/**
 * Maps a parser diagnostic severity into the shared diagnostic level taxonomy.
 *
 * @param severity - Diagnostic severity reported by a parser.
 * @returns Diagnostic level understood by downstream collectors.
 */
export function mapParserDiagnosticSeverity(
  severity: ParserDiagnostic['severity'],
): DiagnosticLevel {
  switch (severity) {
    case 'info': {
      return 'info';
    }
    case 'warning': {
      return 'warn';
    }
    case 'error': {
      return 'error';
    }
    default: {
      return 'error';
    }
  }
}

/**
 * Converts a parser source span into the shared diagnostic span structure.
 *
 * @param span - Source span reported by the parser, if any.
 * @returns Shared diagnostic span describing the same region, or `undefined` when unavailable.
 */
export function convertParserDiagnosticSpan(
  span: ParserDiagnosticSpan | undefined,
): DiagnosticSpan | undefined {
  if (!span) {
    return undefined;
  }

  const { start, end } = span;

  return {
    start: { line: start.line, column: start.column },
    ...(end ? { end: { line: end.line, column: end.column } } : {}),
  } satisfies DiagnosticSpan;
}

/**
 * Converts diagnostic related information emitted by the parser into the shared structure.
 *
 * @param related - Related information array reported by the parser.
 * @returns Shared related information records, or `undefined` when none are provided.
 */
export function convertParserDiagnosticRelatedInformation(
  related: readonly ParserDiagnosticRelatedInformation[] | undefined,
): readonly DiagnosticRelatedInformation[] | undefined {
  if (!related || related.length === 0) {
    return undefined;
  }

  return related.map((entry): DiagnosticRelatedInformation => {
    const span = entry.span ? convertParserDiagnosticSpan(entry.span) : undefined;

    return {
      message: entry.message,
      ...(entry.pointer ? { pointer: entry.pointer } : {}),
      ...(span ? { span } : {}),
    } satisfies DiagnosticRelatedInformation;
  });
}

/**
 * Normalises a parser diagnostic into the shared diagnostic event shape.
 *
 * @param diagnostic - Parser diagnostic to convert.
 * @returns Diagnostic event compatible with shared instrumentation consumers.
 */
export function convertParserDiagnostic(diagnostic: ParserDiagnostic): DiagnosticEvent {
  const span = convertParserDiagnosticSpan(diagnostic.span);
  const related = convertParserDiagnosticRelatedInformation(diagnostic.related);

  return {
    level: mapParserDiagnosticSeverity(diagnostic.severity),
    message: diagnostic.message,
    ...(diagnostic.code ? { code: diagnostic.code } : {}),
    ...(diagnostic.pointer ? { pointer: diagnostic.pointer } : {}),
    ...(span ? { span } : {}),
    ...(related ? { related } : {}),
  } satisfies DiagnosticEvent;
}

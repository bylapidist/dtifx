import type { Diagnostic } from '@lapidist/dtif-parser';
import type { DiagnosticEvent, DiagnosticLevel, DiagnosticsPort } from '@dtifx/diff';

import type { CliIo } from '../../io/cli-io.js';
import type { CompareCommandOptions } from './compare-options.js';

export type DiagnosticSink = (diagnostic: Diagnostic) => void;

export const createDiagnosticSink = (options: CompareCommandOptions, io: CliIo): DiagnosticSink => {
  if (options.quiet) {
    return () => {
      // diagnostics suppressed
    };
  }

  const seen = new Set<string>();

  return (diagnostic) => {
    if (diagnostic.severity === 'error') {
      return;
    }

    const message = formatParserDiagnostic(diagnostic);

    if (seen.has(message)) {
      return;
    }

    seen.add(message);
    const decorate = selectDiagnosticDecorator(options.color);
    const decorated = decorate(message, diagnostic.severity);
    io.writeErr(`${decorated}\n`);
  };
};

export const createReportingDiagnosticsPort = (
  options: CompareCommandOptions,
  io: CliIo,
): DiagnosticsPort => {
  if (options.quiet) {
    return {
      emit() {
        // reporting diagnostics suppressed
      },
    } satisfies DiagnosticsPort;
  }

  return {
    emit(event: DiagnosticEvent) {
      const message = formatReportingDiagnostic(event);
      const decorated = options.color ? colorizeReportingMessage(message, event.level) : message;
      io.writeErr(`${decorated}\n`);
    },
  } satisfies DiagnosticsPort;
};

export type DiagnosticDecorator = (message: string, severity: Diagnostic['severity']) => string;

export const selectDiagnosticDecorator = (color: boolean): DiagnosticDecorator => {
  return color ? colorizeDiagnosticMessage : passthroughDiagnosticMessage;
};

const formatParserDiagnostic = (diagnostic: Diagnostic): string => {
  const severity = diagnostic.severity.toUpperCase();
  const parts: string[] = [severity, diagnostic.code, '-', diagnostic.message];

  if (diagnostic.pointer) {
    parts.push(`(${diagnostic.pointer})`);
  }

  if (diagnostic.span) {
    parts.push(
      `(${diagnostic.span.start.line.toString()}:${diagnostic.span.start.column.toString()})`,
    );
  }

  return parts.join(' ');
};

const colorizeDiagnosticMessage = (message: string, severity: Diagnostic['severity']): string => {
  const level = severity.toUpperCase();
  const color = level === 'ERROR' ? '\u001B[31m' : '\u001B[33m';
  const reset = '\u001B[0m';
  return `${color}${message}${reset}`;
};

const passthroughDiagnosticMessage: DiagnosticDecorator = (message) => message;

const formatReportingDiagnostic = (event: DiagnosticEvent): string => {
  const level = event.level.toUpperCase();
  const scope = event.scope ? `${event.scope}: ` : '';
  const code = event.code ? `${event.code} ` : '';
  const category = event.category ? `[${event.category}] ` : '';
  return `[${level}] ${category}${scope}${code}${event.message}`;
};

const colorizeReportingMessage = (message: string, level: DiagnosticLevel): string => {
  const color = REPORTING_COLORS[level];

  if (!color) {
    return message;
  }

  return `${color}${message}${REPORTING_COLOR_RESET}`;
};

const REPORTING_COLOR_RESET = '\u001B[0m';
const REPORTING_COLORS: Record<DiagnosticLevel, string> = {
  info: '\u001B[36m',
  warn: '\u001B[33m',
  error: '\u001B[31m',
};

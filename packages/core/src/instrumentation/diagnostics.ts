export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticSpanPosition {
  readonly line: number;
  readonly column: number;
}

export interface DiagnosticSpan {
  readonly start: DiagnosticSpanPosition;
  readonly end?: DiagnosticSpanPosition;
}

export interface DiagnosticRelatedInformation {
  readonly message: string;
  readonly pointer?: string;
  readonly span?: DiagnosticSpan;
}

/**
 * Canonical diagnostic namespaces exposed as constants so emitters and tests stay consistent.
 */
export const DiagnosticCategories = {
  reporting: 'reporting',
  reportingCli: 'reporting.cli',
  reportingRegistry: 'reporting.registry',
  tokenSource: 'token-source',
  tokenSourceSession: 'token-source.session',
  tokenSourceParser: 'token-source.parser',
} as const;

/**
 * Canonical diagnostic scopes exposed as constants and helpers so emitters do not
 * need to duplicate string construction logic across adapters.
 */
export const DiagnosticScopes = {
  reportingCli: 'reporting:cli',
  tokenSourceFile: 'token-source.file',
  tokenSourceGit: 'token-source.git',
  tokenSourceSession: 'token-source.session',
} as const;

/**
 * Formats a renderer format string into a reporting diagnostic scope.
 *
 * @param format - The renderer format identifier.
 * @returns The scoped diagnostic label.
 */
export function formatReportingScope(format: string): string {
  return `reporting:${format}`;
}

/**
 * Discrete namespaces that downstream telemetry collectors can use to filter diagnostics.
 *
 * - `reporting` – General-purpose diagnostics emitted by renderers that do not require a
 *   dedicated namespace.
 * - `reporting.cli` – Events that originate from the terminal renderer while normalising
 *   options or writing to stdout/stderr.
 * - `reporting.registry` – Lifecycle events from the renderer registry (`REPORT_RENDER_*`).
 * - `token-source` – Diagnostics from low-level token loading utilities (filesystem, Git, etc.).
 * - `token-source.session` – High-level session orchestration diagnostics when combining loaders.
 * - `token-source.parser` – Forwarded diagnostics from the DTIF parser during token materialisation.
 */
export type DiagnosticCategory =
  | (typeof DiagnosticCategories)[keyof typeof DiagnosticCategories]
  | (string & {});

export interface DiagnosticEvent {
  readonly level: DiagnosticLevel;
  readonly message: string;
  readonly scope?: string;
  readonly code?: string;
  readonly category?: DiagnosticCategory;
  readonly pointer?: string;
  readonly span?: DiagnosticSpan;
  readonly related?: readonly DiagnosticRelatedInformation[];
}

export interface DiagnosticsPort<Event = DiagnosticEvent> {
  emit(event: Event): void | Promise<void>;
}

/**
 * Creates a diagnostics port that ignores all emitted events.
 *
 * @returns A diagnostics port implementation that performs no I/O.
 */
export function createNullDiagnosticsPort<Event = DiagnosticEvent>(): DiagnosticsPort<Event> {
  return {
    emit() {
      // Intentionally empty: default no-op diagnostics implementation.
    },
  };
}

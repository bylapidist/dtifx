import type { DiagnosticsPort } from '../instrumentation/diagnostics.js';
import type { TokenSet } from '../tokens/index.js';

export type TokenSourceLabel = 'previous' | 'next';

export type TokenSourceDiagnosticsPort<Event = unknown> = DiagnosticsPort<Event>;

export interface TokenSourceContext<
  Event = unknown,
  Port extends TokenSourceDiagnosticsPort<Event> = TokenSourceDiagnosticsPort<Event>,
> {
  readonly diagnostics?: Port;
}

export interface TokenSourcePort<
  Label extends string = TokenSourceLabel,
  Output = TokenSet,
  Event = unknown,
  Port extends TokenSourceDiagnosticsPort<Event> = TokenSourceDiagnosticsPort<Event>,
  Context extends TokenSourceContext<Event, Port> = TokenSourceContext<Event, Port>,
> {
  load(label: Label, context?: Context): Promise<Output>;
  describe(label: Label): string;
}

/**
 * Formats a token source label into a diagnostics scope identifier.
 *
 * @param label - The token source label to normalise.
 * @returns The scoped diagnostics identifier for the token source.
 */
export function formatTokenSourceScope(label: string): string {
  return `token-source:${label}`;
}

export {
  convertTokenSourceIssueToDiagnostic,
  convertTokenSourceIssues,
  type TokenSourceIssue,
  type TokenSourceIssueDiagnosticOptions,
  type TokenSourceIssueSeverity,
  type TokenSourceRepositoryIssue,
  type TokenSourceValidationIssue,
} from './issues.js';

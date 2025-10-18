import {
  DiagnosticCategories,
  type DiagnosticCategory,
  type DiagnosticEvent,
  type DiagnosticRelatedInformation,
} from '../instrumentation/diagnostics.js';
import { formatTokenSourceScope } from './index.js';

export type TokenSourceIssueSeverity = 'error' | 'warning' | (string & {});

interface TokenSourceIssueBase {
  readonly sourceId: string;
  readonly uri: string;
  readonly pointerPrefix: string;
  readonly severity?: TokenSourceIssueSeverity;
}

export interface TokenSourceRepositoryIssue extends TokenSourceIssueBase {
  readonly kind: 'repository';
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface TokenSourceValidationIssue extends TokenSourceIssueBase {
  readonly kind: 'validation';
  readonly pointer: string;
  readonly instancePath: string;
  readonly keyword: string;
  readonly message?: string;
  readonly schemaPath?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

export type TokenSourceIssue = TokenSourceRepositoryIssue | TokenSourceValidationIssue;

export interface TokenSourceIssueDiagnosticOptions {
  readonly label?: string;
  readonly scope?: string;
  readonly category?: DiagnosticCategory;
}

/**
 * Converts a token source issue into a diagnostics event suitable for shared instrumentation.
 *
 * @param issue - The token source issue to normalise.
 * @param options - Optional overrides for scope and diagnostic category metadata.
 * @returns Diagnostic event representing the token source issue.
 */
export function convertTokenSourceIssueToDiagnostic(
  issue: TokenSourceIssue,
  options: TokenSourceIssueDiagnosticOptions = {},
): DiagnosticEvent {
  const scope = resolveScope(options);
  const category = options.category ?? DiagnosticCategories.tokenSource;
  const pointer = resolvePointer(issue);
  const level = normaliseSeverity(issue.severity);
  const code = issue.kind === 'validation' ? issue.keyword : issue.code;
  const message = resolveMessage(issue);
  const related = createRelatedInformation(issue);

  return {
    level,
    message,
    ...(scope ? { scope } : {}),
    ...(category ? { category } : {}),
    ...(code ? { code } : {}),
    ...(pointer ? { pointer } : {}),
    ...(related.length > 0 ? { related } : {}),
  } satisfies DiagnosticEvent;
}

/**
 * Converts a collection of token source issues into diagnostics events.
 *
 * @param issues - Issues reported during token source discovery or validation.
 * @param options - Optional overrides applied to every diagnostic event.
 * @returns Normalised diagnostics events for the supplied issues.
 */
export function convertTokenSourceIssues(
  issues: readonly TokenSourceIssue[],
  options: TokenSourceIssueDiagnosticOptions = {},
): DiagnosticEvent[] {
  return issues.map((issue) => convertTokenSourceIssueToDiagnostic(issue, options));
}

function resolveScope(options: TokenSourceIssueDiagnosticOptions): string | undefined {
  if (options.scope) {
    return options.scope;
  }
  if (options.label) {
    return formatTokenSourceScope(options.label);
  }
  return undefined;
}

function resolvePointer(issue: TokenSourceIssue): string | undefined {
  if (issue.kind === 'validation') {
    return issue.pointer || issue.instancePath || issue.pointerPrefix;
  }
  return issue.pointerPrefix;
}

function resolveMessage(issue: TokenSourceIssue): string {
  if (issue.kind === 'validation') {
    return issue.message ?? 'Token source failed schema validation.';
  }
  return issue.message;
}

function normaliseSeverity(severity?: TokenSourceIssueSeverity): DiagnosticEvent['level'] {
  if (severity === 'warning') {
    return 'warn';
  }
  if (severity === 'error' || severity === undefined) {
    return 'error';
  }
  return 'info';
}

function createRelatedInformation(
  issue: TokenSourceIssue,
): readonly DiagnosticRelatedInformation[] {
  const related: DiagnosticRelatedInformation[] = [
    {
      message: `Source ${issue.sourceId}`,
      pointer: issue.pointerPrefix,
    },
    {
      message: `Source URI (${issue.uri})`,
    },
  ];

  if (issue.kind === 'validation') {
    if (issue.instancePath) {
      related.push({
        message: 'Instance path',
        pointer: issue.instancePath,
      });
    }
    if (issue.schemaPath) {
      related.push({
        message: 'Schema path',
        pointer: issue.schemaPath,
      });
    }
    if (issue.params && Object.keys(issue.params).length > 0) {
      related.push({
        message: 'Validation parameters',
      });
    }
  } else if (issue.details && Object.keys(issue.details).length > 0) {
    related.push({
      message: 'Repository details',
    });
  }

  return related;
}

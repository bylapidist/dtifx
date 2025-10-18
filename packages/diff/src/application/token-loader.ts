import type { TokenSet } from '../domain/tokens.js';
import type {
  TokenSourcePort,
  TokenSourceLabel,
  TokenSourceContext,
} from './ports/token-source.js';
import {
  DiagnosticCategories,
  formatTokenSourceScope,
  type DiagnosticsPort,
} from './ports/diagnostics.js';
import { sanitizeDiagnosticMessage } from '../utils/diagnostics.js';

export interface TokenSourceLoadFailure {
  readonly label: TokenSourceLabel;
  readonly description: string;
  readonly cause: unknown;
}

export class TokenSourceLoadError extends Error {
  override readonly name = 'TokenSourceLoadError';
  readonly failures: readonly TokenSourceLoadFailure[];

  constructor(failures: readonly TokenSourceLoadFailure[]) {
    super(formatLoadFailureSummary(failures));
    Object.setPrototypeOf(this, new.target.prototype);
    this.failures = failures;
  }
}

export interface LoadTokenSnapshotsResult {
  readonly previous: TokenSet;
  readonly next: TokenSet;
}

export interface LoadTokenSnapshotsOptions {
  readonly diagnostics?: DiagnosticsPort;
}

/**
 * Loads the previous and next token sets using the provided token source port.
 *
 * @param sources - The token source port responsible for loading snapshots.
 * @param options - Optional diagnostics configuration.
 * @returns The loaded previous and next token sets.
 */
export async function loadTokenSnapshots(
  sources: TokenSourcePort,
  options: LoadTokenSnapshotsOptions = {},
): Promise<LoadTokenSnapshotsResult> {
  const failures: TokenSourceLoadFailure[] = [];
  const context = createTokenSourceContext(options);

  const previous = await loadWithHandling(
    'previous',
    sources,
    failures,
    context,
    options.diagnostics,
  );
  const next = await loadWithHandling('next', sources, failures, context, options.diagnostics);

  if (!previous || !next) {
    throw new TokenSourceLoadError(failures);
  }

  return { previous, next };
}

async function loadWithHandling(
  label: TokenSourceLabel,
  sources: TokenSourcePort,
  failures: TokenSourceLoadFailure[],
  context: TokenSourceContext | undefined,
  diagnostics: DiagnosticsPort | undefined,
): Promise<TokenSet | undefined> {
  try {
    return await sources.load(label, context);
  } catch (error) {
    const description = safeDescribe(sources, label);
    failures.push({
      label,
      description,
      cause: error,
    });
    emitLoadFailureDiagnostic(diagnostics, label, description, error);
    return undefined;
  }
}

function createTokenSourceContext(
  options: LoadTokenSnapshotsOptions,
): TokenSourceContext | undefined {
  if (!options.diagnostics) {
    return undefined;
  }

  return { diagnostics: options.diagnostics } satisfies TokenSourceContext;
}

function safeDescribe(sources: TokenSourcePort, label: TokenSourceLabel): string {
  try {
    return sources.describe(label);
  } catch (error) {
    const fallback = error instanceof Error ? error.message : String(error);
    return `(unavailable: ${fallback})`;
  }
}

function formatLoadFailureSummary(failures: readonly TokenSourceLoadFailure[]): string {
  if (failures.length === 0) {
    return 'Failed to load token sources.';
  }

  const details = failures.map((failure) => formatSingleFailure(failure)).join('\n');
  return `Failed to load token sources:\n${details}`;
}

function formatSingleFailure(failure: TokenSourceLoadFailure): string {
  const reason = formatFailureCause(failure.cause);
  return `- ${failure.label} (${failure.description}): ${reason}`;
}

function emitLoadFailureDiagnostic(
  diagnostics: DiagnosticsPort | undefined,
  label: TokenSourceLabel,
  description: string,
  cause: unknown,
): void {
  if (!diagnostics) {
    return;
  }

  const scope = formatTokenSourceScope(label);
  const message = `Failed to load ${label} snapshot from ${description}: ${sanitizeDiagnosticMessage(formatFailureCause(cause))}`;

  void diagnostics.emit({
    level: 'error',
    scope,
    code: 'TOKEN_LOAD_AGGREGATE_FAILURE',
    message,
    category: DiagnosticCategories.tokenSource,
  });
}

function formatFailureCause(cause: unknown): string {
  if (cause instanceof Error) {
    return indentMultiline(cause.message);
  }

  if (typeof cause === 'string') {
    return indentMultiline(cause);
  }

  return indentMultiline(String(cause));
}

function indentMultiline(message: string): string {
  const normalized = message.replaceAll(/\r?\n/g, '\n');
  const [firstLineRaw, ...rest] = normalized.split('\n');
  const firstLine = firstLineRaw ?? '';

  if (rest.length === 0) {
    return firstLine;
  }

  const indentedTail = rest.map((line) => `  ${line}`).join('\n');
  return `${firstLine}\n${indentedTail}`;
}

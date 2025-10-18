import { DiagnosticCategories, type DiagnosticEvent, type DiagnosticsPort } from './diagnostics.js';
import { convertParserDiagnostic, type ParserDiagnostic } from './parser-diagnostics.js';
import { formatTokenSourceScope } from '../token-sources/index.js';

/**
 * Hooks exposed by DTIF parsers for forwarding diagnostics.
 */
export interface ParserHooks<TDiagnostic extends ParserDiagnostic = ParserDiagnostic> {
  readonly onDiagnostic?: (diagnostic: TDiagnostic) => void;
  readonly warn?: (diagnostic: TDiagnostic) => void;
}

export interface TokenParserDiagnosticEventOptions {
  readonly scope: string;
  readonly category?: DiagnosticEvent['category'];
  readonly sourceLabel?: string;
  readonly includeSourceLabelInMessage?: boolean;
}

export interface DiagnosticsAwareParserHooksOptions<
  TDiagnostic extends ParserDiagnostic = ParserDiagnostic,
> {
  readonly diagnostics?: DiagnosticsPort;
  readonly scope: string;
  readonly sourceLabel: string;
  readonly includeSourceLabelInMessage?: boolean;
  readonly hooks?: ParserHooks<TDiagnostic>;
}

/**
 * Normalises diagnostic messages by stripping duplicated severity prefixes
 * introduced by some parsers.
 *
 * @param value - The raw diagnostic message to clean up.
 * @returns The sanitised diagnostic text.
 */
export function sanitizeDiagnosticMessage(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/^(\s*)ERROR ([A-Z0-9_-]+:)/u, '$1$2'))
    .join('\n');
}

/**
 * Formats a parser diagnostic into a human-readable string for diagnostics events.
 *
 * @param diagnostic - The parser diagnostic to format.
 * @returns The formatted diagnostic message.
 */
export function formatParserDiagnosticMessage(diagnostic: ParserDiagnostic): string {
  const baseMessage = sanitizeDiagnosticMessage(diagnostic.message);
  const parts = [baseMessage];

  if (diagnostic.pointer) {
    parts.push(`(${diagnostic.pointer})`);
  }

  const spanDescription = describeSpan(diagnostic.span);

  if (spanDescription) {
    parts.push(spanDescription);
  }

  return parts.filter(Boolean).join(' ');
}

/**
 * Converts a parser diagnostic into an emitted diagnostics event.
 *
 * @param diagnostic - The parser diagnostic to convert.
 * @param options - Options controlling scope, category, and source labelling.
 * @returns The diagnostics event describing the parser diagnostic.
 */
export function createTokenParserDiagnosticEvent<
  TDiagnostic extends ParserDiagnostic = ParserDiagnostic,
>(diagnostic: TDiagnostic, options: TokenParserDiagnosticEventOptions): DiagnosticEvent {
  const baseEvent = convertParserDiagnostic(diagnostic);
  const baseMessage = formatParserDiagnosticMessage(diagnostic);
  const messageWithSource =
    options.includeSourceLabelInMessage === false || !options.sourceLabel
      ? baseMessage
      : `${baseMessage} (source: ${sanitizeDiagnosticMessage(options.sourceLabel)})`;

  return {
    ...baseEvent,
    message: messageWithSource,
    scope: options.scope,
    category: options.category ?? DiagnosticCategories.tokenSourceParser,
  } satisfies DiagnosticEvent;
}

/**
 * Emits a diagnostic event from a token source context if diagnostics are enabled.
 *
 * @param context - The token source context providing a diagnostics port.
 * @param event - The diagnostic event to emit.
 * @param label - The token source label used to derive the scope.
 */
export function emitTokenSourceDiagnostic(
  context: { readonly diagnostics?: DiagnosticsPort } | undefined,
  event: DiagnosticEvent,
  label: string,
): void {
  const diagnostics = context?.diagnostics;

  if (!diagnostics) {
    return;
  }

  const payload: DiagnosticEvent = {
    ...event,
    scope: event.scope ?? formatTokenSourceScope(label),
    category: event.category ?? DiagnosticCategories.tokenSource,
  } satisfies DiagnosticEvent;

  void diagnostics.emit(payload);
}

/**
 * Emits a parser diagnostic from a token source context using default scope and category.
 *
 * @param context - The token source context providing diagnostics.
 * @param diagnostic - The parser diagnostic to emit.
 * @param label - The token source label associated with the diagnostic.
 */
export function emitTokenParserDiagnostic(
  context: { readonly diagnostics?: DiagnosticsPort } | undefined,
  diagnostic: ParserDiagnostic,
  label: string,
): void {
  const diagnostics = context?.diagnostics;

  if (!diagnostics) {
    return;
  }

  const payload = createTokenParserDiagnosticEvent(diagnostic, {
    scope: formatTokenSourceScope(label),
    category: DiagnosticCategories.tokenSourceParser,
    includeSourceLabelInMessage: false,
  });

  void diagnostics.emit({
    ...payload,
    message: formatParserDiagnosticMessage(diagnostic),
  });
}

/**
 * Wraps parser hooks with diagnostics emission capabilities.
 *
 * @param options - Hook options including diagnostics port and metadata.
 * @returns Parser hooks that forward diagnostics to the diagnostics port.
 */
export function createDiagnosticsAwareParserHooks<
  TDiagnostic extends ParserDiagnostic = ParserDiagnostic,
>(options: DiagnosticsAwareParserHooksOptions<TDiagnostic>): ParserHooks<TDiagnostic> {
  const { diagnostics, scope, sourceLabel, hooks, includeSourceLabelInMessage } = options;
  const { onDiagnostic, warn } = hooks ?? {};

  if (!diagnostics) {
    return hooks ?? ({} as ParserHooks<TDiagnostic>);
  }

  return {
    onDiagnostic(diagnostic) {
      onDiagnostic?.(diagnostic);
      void diagnostics.emit(
        createTokenParserDiagnosticEvent(diagnostic, {
          scope,
          sourceLabel,
          ...(includeSourceLabelInMessage === undefined ? {} : { includeSourceLabelInMessage }),
        }),
      );
    },
    warn(diagnostic) {
      warn?.(diagnostic);
    },
  } satisfies ParserHooks<TDiagnostic>;
}

function describeSpan(span: ParserDiagnostic['span']): string | undefined {
  if (!span) {
    return undefined;
  }

  const startLine = span.start?.line;
  const startColumn = span.start?.column;

  if (typeof startLine === 'number' && typeof startColumn === 'number') {
    return `(line ${startLine}, column ${startColumn})`;
  }

  return undefined;
}

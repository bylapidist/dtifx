/**
 * Minimal interface describing a writable target suitable for reporter output streams.
 */
export interface WritableTarget {
  write(line: string): void;
}

const LINE_TERMINATOR = '\n';

/**
 * Escapes HTML control characters to prevent markup injection in reporter output.
 *
 * @param value - Raw text requiring HTML escaping.
 * @returns Escaped HTML-safe string.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Escapes characters that carry special meaning in Markdown documents.
 *
 * @param value - Raw text requiring Markdown escaping.
 * @returns Escaped Markdown-safe string.
 */
export function escapeMarkdown(value: string): string {
  return value.replaceAll(/([\\`*_{}\[\]()#+.!|-])/g, String.raw`\\$1`);
}

/**
 * Formats a millisecond duration with a single decimal place suffix.
 *
 * @param value - Duration in milliseconds to format.
 * @returns String representation with a millisecond suffix.
 */
export function formatDurationMs(value: number): string {
  return `${value.toFixed(1)}ms`;
}

/**
 * Converts arbitrary error inputs into a stable string description.
 *
 * @param error - Error-like value to format.
 * @returns Human readable error summary.
 */
export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

/**
 * Serialises an unknown error into a structured payload for logging.
 *
 * @param error - Error-like value to serialise.
 * @returns Structured error payload describing the value.
 */
export function serialiseError(error: unknown): {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

/**
 * Writes a JSON payload to the provided target followed by a newline terminator.
 *
 * @param target - Writable destination for the encoded payload.
 * @param payload - Arbitrary value to serialise as JSON.
 */
export function writeJson(target: WritableTarget, payload: unknown): void {
  target.write(`${JSON.stringify(payload)}${LINE_TERMINATOR}`);
}

/**
 * Writes a plain-text line to the provided target followed by a newline terminator.
 *
 * @param target - Writable destination for the text content.
 * @param line - Text content to emit.
 */
export function writeLine(target: WritableTarget, line: string): void {
  target.write(`${line}${LINE_TERMINATOR}`);
}

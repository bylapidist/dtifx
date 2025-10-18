export interface RunContext {
  readonly previous?: string;
  readonly next?: string;
  readonly startedAt?: string;
  readonly durationMs?: number;
}

export interface CreateRunContextOptions {
  readonly previous?: string;
  readonly next?: string;
  readonly startedAt?: Date | string;
  readonly durationMs?: number;
}

/**
 * Normalises runtime metadata about an execution into a stable run context payload.
 *
 * @param options - Run metadata captured during execution.
 * @returns A run context with ISO timestamp normalisation applied.
 */
export function createRunContext(options: CreateRunContextOptions): RunContext {
  const { previous, next, startedAt, durationMs } = options;

  return {
    ...(previous ? { previous } : {}),
    ...(next ? { next } : {}),
    ...(startedAt ? { startedAt: normaliseTimestamp(startedAt) } : {}),
    ...(durationMs === undefined ? {} : { durationMs }),
  } satisfies RunContext;
}

/**
 * Produces a human-readable comparison string for the run context.
 *
 * @param context - The run context to describe.
 * @returns The comparison label or undefined when insufficient information is available.
 */
export function describeRunComparison(context: RunContext | undefined): string | undefined {
  if (context === undefined) {
    return undefined;
  }

  const { previous, next } = context;

  if (previous && next) {
    return `${previous} → ${next}`;
  }

  if (next) {
    return next;
  }

  if (previous) {
    return previous;
  }

  return undefined;
}

/**
 * Formats the run start timestamp as a compact UTC string.
 *
 * @param context - The run context containing the start timestamp.
 * @returns A formatted timestamp or undefined when the timestamp is missing or invalid.
 */
export function formatRunTimestamp(context: RunContext | undefined): string | undefined {
  if (!context?.startedAt) {
    return undefined;
  }

  const timestamp = Date.parse(context.startedAt);

  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

/**
 * Formats the run duration in milliseconds or seconds depending on magnitude.
 *
 * @param context - The run context containing the duration.
 * @returns A formatted duration string or undefined when the duration is missing or invalid.
 */
export function formatRunDuration(context: RunContext | undefined): string | undefined {
  if (context?.durationMs === undefined || !Number.isFinite(context.durationMs)) {
    return undefined;
  }

  const duration = context.durationMs;

  if (duration < 0) {
    return undefined;
  }

  if (duration >= 1000) {
    const seconds = duration / 1000;
    const formattedSeconds = seconds.toFixed(seconds >= 10 ? 0 : 1);
    return `${formattedSeconds}s`;
  }

  const roundedMilliseconds = Math.round(duration);
  return `${roundedMilliseconds}ms`;
}

function normaliseTimestamp(value: Date | string): string {
  if (typeof value === 'string') {
    return value;
  }

  return value.toISOString();
}

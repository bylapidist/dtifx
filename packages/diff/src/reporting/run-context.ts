import { createRunContext as createSharedRunContext, type RunContext } from '@dtifx/core';

import {
  formatTokenSourceLabel,
  type SessionTokenSources,
} from '../adapters/token-source/session-token-source.js';

export type ReportRunContext = RunContext;

export interface CreateRunContextOptions {
  readonly sources: SessionTokenSources;
  readonly startedAt: Date;
  readonly durationMs: number;
  readonly cwd?: string;
}

export { describeRunComparison, formatRunDuration, formatRunTimestamp } from '@dtifx/core';

/**
 * Creates a report run context summarising the compared sources and runtime metadata.
 *
 * @param options - Runtime information captured during diff execution.
 * @returns A run context suitable for attaching to reports.
 */
export function createRunContext(options: CreateRunContextOptions): ReportRunContext {
  const labelOptions = options.cwd === undefined ? undefined : { cwd: options.cwd };
  const previous = formatTokenSourceLabel(options.sources.previous, labelOptions);
  const next = formatTokenSourceLabel(options.sources.next, labelOptions);

  return createSharedRunContext({
    previous,
    next,
    startedAt: options.startedAt,
    durationMs: options.durationMs,
  });
}

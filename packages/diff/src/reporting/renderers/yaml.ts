import { stringify } from 'yaml';

import type { TokenDiffResult } from '../../diff.js';
import type { ReportRendererContext } from '../../application/ports/reporting.js';
import { createJsonPayload } from './json.js';
import type { ReportRunContext } from '../run-context.js';

export interface YamlFormatterOptions {
  readonly mode?: 'full' | 'summary' | 'condensed' | 'detailed';
  readonly runContext?: ReportRunContext;
  readonly topRisks?: number;
}

/**
 * Renders a diff as YAML by serialising the JSON payload produced by the JSON renderer.
 *
 * @param diff - The diff result to render.
 * @param options - Formatter options controlling verbosity and metadata.
 * @param _context - Unused renderer context placeholder for API parity.
 * @returns The YAML representation of the diff.
 */
export function formatDiffAsYaml(
  diff: TokenDiffResult,
  options: YamlFormatterOptions = {},
  _context?: ReportRendererContext,
): string {
  const requestedMode = options.mode ?? 'full';
  const mode = requestedMode === 'condensed' ? 'full' : requestedMode;
  const payload = createJsonPayload(diff, mode, {
    ...(options.runContext === undefined ? {} : { runContext: options.runContext }),
    ...(options.topRisks === undefined ? {} : { topRisks: options.topRisks }),
  });
  const output = stringify(payload);
  return output.endsWith('\n') ? output.slice(0, -1) : output;
}

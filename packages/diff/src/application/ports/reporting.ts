import type { TokenDiffResult } from '../../domain/diff-types.js';
import type { RenderReportOptions, ReportRenderFormat } from '../../reporting/options.js';
import type { DiagnosticsPort } from './diagnostics.js';

export interface ReportRendererContext {
  readonly diagnostics?: DiagnosticsPort;
}

export interface ReportRendererPort {
  readonly format: ReportRenderFormat;
  render(
    diff: TokenDiffResult,
    options: RenderReportOptions,
    context?: ReportRendererContext,
  ): Promise<string> | string;
}

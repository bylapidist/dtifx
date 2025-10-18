import type {
  TokenAddition,
  TokenDiffResult,
  TokenDiffSummary,
  TokenModification,
  TokenRemoval,
  TokenRename,
} from '../../diff.js';
import type { ReportRendererContext } from '../../application/ports/reporting.js';
import {
  createReportDescriptor,
  type ReportHotspot,
  type ReportRiskItem,
  type ReportSummaryView,
} from '../report-descriptor.js';
import type { ReportRunContext } from '../run-context.js';

export interface JsonFormatterOptions {
  readonly mode?: 'full' | 'summary' | 'condensed' | 'detailed';
  readonly runContext?: ReportRunContext;
  readonly topRisks?: number;
}

interface CreateJsonPayloadOptions {
  readonly runContext?: ReportRunContext;
  readonly topRisks?: number;
}

export type TokenDiffJson = TokenDiffJsonSummary | TokenDiffJsonWithChanges;

export type TokenDiffJsonSummary = TokenDiffSummary;

export interface TokenDiffJsonWithChanges {
  readonly reportSchemaVersion: number;
  readonly generatedAt: string;
  readonly run?: TokenDiffJsonRunContext;
  readonly summary: TokenDiffSummary;
  readonly insights: TokenDiffJsonInsights;
  readonly changes: readonly TokenDiffJsonChange[];
}

export interface TokenDiffJsonRunContext {
  readonly previous?: string;
  readonly next?: string;
  readonly startedAt?: string;
  readonly durationMs?: number;
}

export interface TokenDiffJsonInsights {
  readonly impact: ReportSummaryView['impact'];
  readonly operations: ReportSummaryView['operations'];
  readonly totals: ReportSummaryView['totals'];
  readonly changeMix: ReportSummaryView['changeMix'];
  readonly typeHotspots: readonly TokenDiffJsonHotspot[];
  readonly groupHotspots: readonly TokenDiffJsonHotspot[];
  readonly topRisks: readonly TokenDiffJsonRisk[];
}

export type TokenDiffJsonHotspot = ReportHotspot;

export interface TokenDiffJsonRisk {
  readonly kind: TokenDiffJsonChange['kind'];
  readonly impact: TokenAddition['impact'];
  readonly labelPath: string;
  readonly typeLabel: string;
  readonly title: string;
  readonly why: string;
  readonly impactSummary: string;
  readonly nextStep: string;
  readonly score: number;
  readonly tokens: ReportRiskItem['tokens'];
  readonly changedFields?: readonly TokenModification['changes'][number][];
}

export type TokenDiffJsonChange =
  | TokenDiffJsonAddition
  | TokenDiffJsonRemoval
  | TokenDiffJsonModification
  | TokenDiffJsonRename;

export interface TokenDiffJsonAddition {
  readonly kind: 'added';
  readonly token: string;
  readonly next: TokenAddition['next'];
  readonly impact: TokenAddition['impact'];
}

export interface TokenDiffJsonRemoval {
  readonly kind: 'removed';
  readonly token: string;
  readonly previous: TokenRemoval['previous'];
  readonly impact: TokenRemoval['impact'];
}

export interface TokenDiffJsonModification {
  readonly kind: 'changed';
  readonly token: string;
  readonly changes: TokenModification['changes'];
  readonly previous: TokenModification['previous'];
  readonly next: TokenModification['next'];
  readonly impact: TokenModification['impact'];
}

export interface TokenDiffJsonRename {
  readonly kind: 'renamed';
  readonly previousToken: string;
  readonly nextToken: string;
  readonly previous: TokenRename['previous'];
  readonly next: TokenRename['next'];
  readonly impact: TokenRename['impact'];
}

/**
 * Serialises a diff result to formatted JSON, optionally including run context
 * and risk insights.
 *
 * @param diff - The diff result to render.
 * @param options - Formatter options influencing verbosity and metadata.
 * @param _context - Unused renderer context placeholder for API parity.
 * @returns The JSON document representing the diff.
 */
export function formatDiffAsJson(
  diff: TokenDiffResult,
  options: JsonFormatterOptions = {},
  _context?: ReportRendererContext,
): string {
  const requestedMode = options.mode ?? 'full';
  const mode = requestedMode === 'condensed' ? 'full' : requestedMode;
  const payloadOptions: CreateJsonPayloadOptions = {
    ...(options.runContext ? { runContext: options.runContext } : {}),
    ...(options.topRisks === undefined ? {} : { topRisks: options.topRisks }),
  } satisfies CreateJsonPayloadOptions;
  const payload = createJsonPayload(diff, mode, payloadOptions);
  return JSON.stringify(payload, undefined, 2);
}

/**
 * Builds the structured JSON payload for the JSON renderer.
 *
 * @param diff - The diff result backing the payload.
 * @param mode - The level of detail to include in the payload.
 * @param options - Additional options controlling risk and run metadata.
 * @returns The serialisable payload consumed by the JSON renderer.
 */
export function createJsonPayload(
  diff: TokenDiffResult,
  mode: 'full' | 'summary' | 'detailed' = 'full',
  options: CreateJsonPayloadOptions = {},
): TokenDiffJson {
  if (mode === 'summary') {
    return { ...diff.summary };
  }

  const report = createReportDescriptor(
    diff,
    options.topRisks === undefined ? {} : { topRiskLimit: options.topRisks },
  );
  const run = serializeRunContext(options.runContext);
  return {
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    ...(run ? { run } : {}),
    summary: { ...diff.summary },
    insights: serializeInsights(report.summary, report.topRisks),
    changes: collectJsonChanges(diff),
  };
}

const REPORT_SCHEMA_VERSION = 3;

function collectJsonChanges(diff: TokenDiffResult): TokenDiffJsonChange[] {
  const changes: TokenDiffJsonChange[] = [];

  for (const entry of diff.added) {
    changes.push({
      kind: 'added',
      token: entry.id,
      next: entry.next,
      impact: entry.impact,
    });
  }

  for (const entry of diff.removed) {
    changes.push({
      kind: 'removed',
      token: entry.id,
      previous: entry.previous,
      impact: entry.impact,
    });
  }

  for (const entry of diff.renamed) {
    changes.push({
      kind: 'renamed',
      previousToken: entry.previousId,
      nextToken: entry.nextId,
      previous: entry.previous,
      next: entry.next,
      impact: entry.impact,
    });
  }

  for (const entry of diff.changed) {
    changes.push({
      kind: 'changed',
      token: entry.id,
      changes: [...entry.changes],
      previous: entry.previous,
      next: entry.next,
      impact: entry.impact,
    });
  }

  return changes;
}

function serializeInsights(
  summary: ReportSummaryView,
  risks: readonly ReportRiskItem[],
): TokenDiffJsonInsights {
  return {
    impact: { ...summary.impact },
    operations: { ...summary.operations },
    totals: { ...summary.totals },
    changeMix: { ...summary.changeMix },
    typeHotspots: summary.typeHotspots.map((hotspot) => serializeHotspot(hotspot)),
    groupHotspots: summary.groupHotspots.map((hotspot) => serializeHotspot(hotspot)),
    topRisks: risks.map((risk) => serializeRisk(risk)),
  };
}

function serializeHotspot(hotspot: ReportHotspot): TokenDiffJsonHotspot {
  return { ...hotspot };
}

function serializeRisk(risk: ReportRiskItem): TokenDiffJsonRisk {
  return {
    kind: risk.kind,
    impact: risk.impact,
    labelPath: risk.labelPath,
    typeLabel: risk.typeLabel,
    title: risk.title,
    why: risk.why,
    impactSummary: risk.impactSummary,
    nextStep: risk.nextStep,
    score: risk.score,
    tokens: { ...risk.tokens },
    ...(risk.changedFields === undefined
      ? {}
      : {
          changedFields: [...risk.changedFields] as readonly TokenModification['changes'][number][],
        }),
  };
}

function serializeRunContext(
  context: ReportRunContext | undefined,
): TokenDiffJsonRunContext | undefined {
  if (!context) {
    return undefined;
  }

  const durationValid =
    context.durationMs !== undefined &&
    Number.isFinite(context.durationMs) &&
    context.durationMs >= 0;

  const run: TokenDiffJsonRunContext = {
    ...(context.previous ? { previous: context.previous } : {}),
    ...(context.next ? { next: context.next } : {}),
    ...(context.startedAt ? { startedAt: context.startedAt } : {}),
    ...(durationValid ? { durationMs: context.durationMs } : {}),
  };

  if (Object.keys(run).length === 0) {
    return undefined;
  }

  return run;
}

import { createRequire } from 'node:module';

import type {
  TokenAddition,
  TokenDiffResult,
  TokenModification,
  TokenRemoval,
  TokenRename,
} from '../../diff.js';
import type { ReportRendererContext } from '../../application/ports/reporting.js';
import type { TokenSnapshot } from '../../token-set.js';
import type { ReportRunContext } from '../run-context.js';

const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require('../../../package.json') as {
  readonly version?: string;
};

const TOOL_VERSION = PACKAGE_VERSION ?? '0.0.0';

interface SarifLog {
  readonly $schema: string;
  readonly version: '2.1.0';
  readonly runs: readonly SarifRun[];
}

interface SarifRun {
  readonly tool: {
    readonly driver: {
      readonly name: string;
      readonly version: string;
      readonly informationUri: string;
      readonly rules: readonly SarifRule[];
    };
  };
  readonly results: readonly SarifResult[];
  readonly properties?: Record<string, unknown>;
}

interface SarifRule {
  readonly id: string;
  readonly name: string;
  readonly shortDescription: { readonly text: string };
  readonly fullDescription: { readonly text: string };
  readonly defaultConfiguration: { readonly level: SarifLevel };
}

type SarifLevel = 'error' | 'warning' | 'note';

interface SarifResult {
  readonly ruleId: string;
  readonly ruleIndex: number;
  readonly level: SarifLevel;
  readonly message: { readonly text: string };
  readonly locations?: readonly SarifLocation[];
  readonly properties?: Record<string, unknown>;
}

interface SarifLocation {
  readonly physicalLocation: {
    readonly artifactLocation: { readonly uri: string };
    readonly region: {
      readonly startLine: number;
      readonly startColumn: number;
    };
  };
}

const SARIF_RULES: readonly SarifRule[] = [
  createSarifRule('token-added', 'Token added'),
  createSarifRule('token-removed', 'Token removed'),
  createSarifRule('token-renamed', 'Token renamed'),
  createSarifRule('token-changed', 'Token changed'),
];

const SARIF_RULE_INDEX = new Map<string, number>(
  SARIF_RULES.map((rule, index) => [rule.id, index]),
);

export interface SarifFormatterOptions {
  readonly runContext?: ReportRunContext;
}

/**
 * Serialises a diff to the SARIF 2.1.0 format for ingestion by code analysis tools.
 *
 * @param diff - The diff result to render.
 * @param options - Formatter options providing run metadata.
 * @param _context - Unused renderer context placeholder for API parity.
 * @returns The SARIF report as a formatted JSON string.
 */
export function formatDiffAsSarif(
  diff: TokenDiffResult,
  options: SarifFormatterOptions = {},
  _context?: ReportRendererContext,
): string {
  const results = collectSarifResults(diff);
  const runContext = serializeRunContext(options.runContext);

  const sarif: SarifLog = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: '@dtifx/diff',
            version: TOOL_VERSION,
            informationUri: 'https://github.com/byalpidist/dtifx',
            rules: SARIF_RULES,
          },
        },
        results,
        properties: {
          summary: {
            breaking: diff.summary.breaking,
            nonBreaking: diff.summary.nonBreaking,
            added: diff.summary.added,
            removed: diff.summary.removed,
            changed: diff.summary.changed,
            renamed: diff.summary.renamed,
            recommendedBump: diff.summary.recommendedBump,
          },
          ...(runContext ? { runContext } : {}),
        },
      },
    ],
  };

  return JSON.stringify(sarif, undefined, 2);
}

function collectSarifResults(diff: TokenDiffResult): readonly SarifResult[] {
  const results: SarifResult[] = [];

  for (const addition of diff.added) {
    results.push(createAdditionResult(addition));
  }

  for (const removal of diff.removed) {
    results.push(createRemovalResult(removal));
  }

  for (const rename of diff.renamed) {
    results.push(createRenameResult(rename));
  }

  for (const modification of diff.changed) {
    results.push(createModificationResult(modification));
  }

  return results;
}

function createAdditionResult(entry: TokenAddition): SarifResult {
  const rule = resolveRule('token-added');
  const message = `Token added: ${entry.id} (${entry.next.type ?? 'unknown type'}) — impact ${entry.impact}`;
  const location = createLocation(entry.next);
  const locations: readonly SarifLocation[] | undefined = location ? [location] : undefined;

  return {
    ruleId: rule.id,
    ruleIndex: rule.index,
    level: mapImpactToLevel(entry.impact),
    message: { text: message },
    ...(locations ? { locations } : {}),
    properties: {
      kind: 'added',
      tokenId: entry.id,
      tokenType: entry.next.type,
      impact: entry.impact,
    },
  };
}

function createRemovalResult(entry: TokenRemoval): SarifResult {
  const rule = resolveRule('token-removed');
  const message = `Token removed: ${entry.id} — impact ${entry.impact}`;
  const location = createLocation(entry.previous);
  const locations: readonly SarifLocation[] | undefined = location ? [location] : undefined;

  return {
    ruleId: rule.id,
    ruleIndex: rule.index,
    level: mapImpactToLevel(entry.impact),
    message: { text: message },
    ...(locations ? { locations } : {}),
    properties: {
      kind: 'removed',
      tokenId: entry.id,
      tokenType: entry.previous.type,
      impact: entry.impact,
    },
  };
}

function createRenameResult(entry: TokenRename): SarifResult {
  const rule = resolveRule('token-renamed');
  const message = `Token renamed: ${entry.previousId} → ${entry.nextId} — impact ${entry.impact}`;
  const previousLocation = createLocation(entry.previous);
  const nextLocation = createLocation(entry.next);
  const locations: SarifLocation[] = [];

  if (previousLocation) {
    locations.push(previousLocation);
  }

  if (nextLocation) {
    locations.push(nextLocation);
  }

  return {
    ruleId: rule.id,
    ruleIndex: rule.index,
    level: mapImpactToLevel(entry.impact),
    message: { text: message },
    ...(locations.length > 0 ? { locations: locations as readonly SarifLocation[] } : {}),
    properties: {
      kind: 'renamed',
      previousId: entry.previousId,
      nextId: entry.nextId,
      tokenType: entry.next.type ?? entry.previous.type,
      impact: entry.impact,
    },
  };
}

function createModificationResult(entry: TokenModification): SarifResult {
  const rule = resolveRule('token-changed');
  const changedFields = entry.changes.join(', ');
  const message = `Token changed: ${entry.id} — fields updated: ${changedFields || 'none'} — impact ${entry.impact}`;
  const location = createLocation(entry.next);
  const locations: readonly SarifLocation[] | undefined = location ? [location] : undefined;

  return {
    ruleId: rule.id,
    ruleIndex: rule.index,
    level: mapImpactToLevel(entry.impact),
    message: { text: message },
    ...(locations ? { locations } : {}),
    properties: {
      kind: 'changed',
      tokenId: entry.id,
      tokenType: entry.next.type ?? entry.previous.type,
      impact: entry.impact,
      changedFields: entry.changes,
    },
  };
}

function createLocation(token: TokenSnapshot): SarifLocation | undefined {
  const { uri } = token.source;

  if (!uri || uri.trim().length === 0) {
    return undefined;
  }

  return {
    physicalLocation: {
      artifactLocation: { uri },
      region: {
        startLine: token.source.line,
        startColumn: token.source.column,
      },
    },
  };
}

function serializeRunContext(
  context: ReportRunContext | undefined,
): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  const run: Record<string, unknown> = {};

  if (context.previous) {
    run['previous'] = context.previous;
  }

  if (context.next) {
    run['next'] = context.next;
  }

  if (context.startedAt) {
    run['startedAt'] = context.startedAt;
  }

  if (
    context.durationMs !== undefined &&
    Number.isFinite(context.durationMs) &&
    context.durationMs >= 0
  ) {
    run['durationMs'] = context.durationMs;
  }

  if (Object.keys(run).length === 0) {
    return undefined;
  }

  return run;
}

function mapImpactToLevel(impact: TokenAddition['impact']): SarifLevel {
  return impact === 'breaking' ? 'error' : 'warning';
}

function resolveRule(ruleId: string): { id: string; index: number } {
  const index = SARIF_RULE_INDEX.get(ruleId);

  if (index === undefined) {
    throw new Error(`Unknown SARIF rule: ${ruleId}`);
  }

  return { id: ruleId, index };
}

function createSarifRule(id: string, description: string): SarifRule {
  return {
    id,
    name: id,
    shortDescription: { text: description },
    fullDescription: { text: description },
    defaultConfiguration: { level: 'warning' },
  };
}

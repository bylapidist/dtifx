import { performance } from 'node:perf_hooks';

import type { TokenSourceIssue } from '../token-sources/issues.js';
import type {
  TokenLayerConfig,
  TokenSourceConfig,
  PlannedTokenSource,
  TokenSourcePlan,
} from './config.js';
import type {
  TokenSourceDiscoveryContext,
  TokenSourceDocument,
  TokenSourceRepositoryPort,
} from './repository.js';

export interface TokenSourcePlanningConfig {
  readonly layers: readonly TokenLayerConfig[];
  readonly sources: readonly TokenSourceConfig[];
}

export interface TokenSourceValidatorPort {
  validate(
    document: TokenSourceDocument,
    context: TokenSourceDiscoveryContext,
  ): Promise<readonly TokenSourceIssue[] | undefined>;
}

export interface TokenSourcePlanningTimer {
  now(): number;
}

export interface TokenSourcePlanningClock {
  now(): Date;
}

export interface TokenSourcePlanningOptions {
  readonly repository: TokenSourceRepositoryPort;
  readonly validator?: TokenSourceValidatorPort;
  readonly timer?: TokenSourcePlanningTimer;
  readonly clock?: TokenSourcePlanningClock;
}

export interface TokenSourcePlanningResult {
  readonly plan: TokenSourcePlan;
  readonly issues: readonly TokenSourceIssue[];
  readonly durationMs: number;
}

export class UnknownLayerError extends Error {
  constructor(
    readonly layer: string,
    readonly sourceId: string,
  ) {
    super(`Unknown layer "${layer}" referenced by source "${sourceId}"`);
    this.name = 'UnknownLayerError';
  }
}

/**
 * Plans token source discovery and validation for audit and build workflows.
 *
 * @param config - Layer and source configuration to evaluate.
 * @param options - Repository, validation, and timing dependencies.
 * @returns Planned sources, accumulated issues, and execution timings.
 */
export async function planTokenSources(
  config: TokenSourcePlanningConfig,
  options: TokenSourcePlanningOptions,
): Promise<TokenSourcePlanningResult> {
  const timer = options.timer ?? { now: () => performance.now() };
  const clock = options.clock ?? { now: () => new Date() };
  const start = timer.now();
  const createdAt = clock.now();

  const issues: TokenSourceIssue[] = [];
  const entries: PlannedTokenSource[] = [];

  for (const source of config.sources) {
    const layer = findLayer(config.layers, source.layer);
    if (!layer) {
      throw new UnknownLayerError(source.layer, source.id);
    }

    const discoveryContext: TokenSourceDiscoveryContext = { layer, source };
    const layerIndex = config.layers.findIndex((candidate) => candidate.name === layer.name);
    const outcome = await options.repository.discover(discoveryContext);

    if (outcome.issues.length > 0) {
      issues.push(...outcome.issues);
    }

    for (const document of outcome.documents) {
      if (options.validator) {
        const validationIssues = await options.validator.validate(document, discoveryContext);
        if (validationIssues?.length) {
          issues.push(...validationIssues);
        }
      }

      const planned = createPlannedSource(document, layer, layerIndex, source.id, source.context);
      entries.push(planned);
    }
  }

  entries.sort((left, right) => {
    if (left.layerIndex !== right.layerIndex) {
      return left.layerIndex - right.layerIndex;
    }
    if (left.pointerPrefix !== right.pointerPrefix) {
      return left.pointerPrefix.localeCompare(right.pointerPrefix);
    }
    return left.uri.localeCompare(right.uri);
  });

  const durationMs = timer.now() - start;
  const plan: TokenSourcePlan = { entries, createdAt } satisfies TokenSourcePlan;

  return { plan, issues, durationMs } satisfies TokenSourcePlanningResult;
}

function findLayer(
  layers: readonly TokenLayerConfig[],
  name: string,
): TokenLayerConfig | undefined {
  return layers.find((layer) => layer.name === name);
}

function createPlannedSource(
  document: TokenSourceDocument,
  layer: TokenLayerConfig,
  layerIndex: number,
  sourceId: string,
  sourceContext: TokenSourceConfig['context'] | undefined,
): PlannedTokenSource {
  return {
    id: sourceId,
    pointerPrefix: document.pointerPrefix,
    layer: layer.name,
    layerIndex,
    uri: document.uri,
    context: mergeContexts(layer.context, sourceContext, document.context),
    document: document.document,
  } satisfies PlannedTokenSource;
}

function mergeContexts(
  ...contexts: Array<Readonly<Record<string, unknown>> | undefined>
): Readonly<Record<string, unknown>> {
  const merged: Record<string, unknown> = {};
  for (const context of contexts) {
    if (!context) {
      continue;
    }
    Object.assign(merged, context);
  }
  return merged;
}

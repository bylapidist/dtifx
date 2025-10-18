import { performance } from 'node:perf_hooks';

import type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';

import type { RunContext } from '@dtifx/core';
import { createRunContext } from '@dtifx/core';

import type {
  BuildConfig,
  FormatterInstanceConfig,
  FormatterOutputConfig,
  SourcePlan,
} from '../config/index.js';
import type {
  ArtifactWriterPort,
  DependencyDiffStrategyPort,
  DependencySnapshotBuilderPort,
  DomainEventBusPort,
  FormatterExecutorPort,
  FormatterPlannerPort,
  FormatterPlan,
  TransformExecutorPort,
  BuildLifecycleObserverPort,
} from '../domain/ports/index.js';
import { SourcePlanner, type PlannerOptions } from '../application/planner/source-planner.js';
import {
  ResolutionSession,
  type ResolvedPlan,
  type TokenSnapshot,
} from '../session/resolution-session.js';
import { TransformationService } from '../domain/services/transformation-service.js';
import { FormattingService } from '../domain/services/formatting-service.js';
import {
  DependencyTrackingService,
  type DependencyTrackingResult,
} from '../domain/services/dependency-tracking-service.js';
import { attachLifecycleObservers, InMemoryDomainEventBus } from '../domain/events/index.js';
import {
  createFormatterConfiguration,
  getFormatterConfigEntries,
} from './configuration/formatters.js';
import type { TransformDefinition, TransformRegistry } from '../transform/transform-registry.js';
import type { TransformCache } from '../transform/transform-cache.js';
import type {
  TokenDependencyCache,
  TokenDependencyDiff,
} from '../incremental/token-dependency-cache.js';
import {
  collectTokenMetrics,
  type TokenMetricsSnapshot,
  type TokenMetrics,
} from '@dtifx/core/sources';
import type { TelemetrySpan, TelemetryTracer } from '@dtifx/core/telemetry';
import type { FileArtifact, FormatterDefinition } from '../formatter/formatter-registry.js';
import { noopLogger, type StructuredLogger } from '@dtifx/core/logging';
import { createTransformConfiguration } from './configuration/transforms.js';
import { createDependencyConfiguration } from './configuration/dependencies.js';
import type { DependencyConfigurationOverrides } from './configuration/dependencies.js';
import type {
  FormatterDefinitionFactoryContext,
  FormatterDefinitionFactoryRegistry,
} from '../formatter/formatter-factory.js';

/**
 * Overrides and adapters used when constructing the build runtime services.
 */
export interface BuildRuntimeOptions {
  /**
   * Logger instance used for planner and runtime diagnostics.
   */
  readonly logger?: StructuredLogger;
  /**
   * Additional configuration for the source planner.
   */
  readonly planner?: PlannerOptions;
  /**
   * Cache used to memoise documents fetched during resolution.
   */
  readonly documentCache?: DocumentCache;
  /**
   * Cache providing previously resolved token snapshots.
   */
  readonly tokenCache?: TokenCache;
  /**
   * When true, includes graph relationships in the resolution output.
   */
  readonly includeGraphs?: boolean;
  /**
   * When true, flattens nested token collections during resolution.
   */
  readonly flatten?: boolean;
  /**
   * Cache used by transform executors to avoid recomputation.
   */
  readonly transformCache?: TransformCache;
  /**
   * Additional transform definitions to register with the runtime.
   */
  readonly transformDefinitions?: readonly TransformDefinition[];
  /**
   * Registry used to look up transform implementations.
   */
  readonly transformRegistry?: TransformRegistry;
  /**
   * Executor that performs transform operations.
   */
  readonly transformExecutor?: TransformExecutorPort;
  /**
   * Cache storing dependency information for incremental builds.
   */
  readonly dependencyCache?: TokenDependencyCache;
  /**
   * Observers that receive lifecycle events during build execution.
   */
  readonly observers?: readonly BuildLifecycleObserverPort[];
  /**
   * Writer used by formatters to persist artifacts.
   */
  readonly artifactWriter?: ArtifactWriterPort;
  /**
   * Planner responsible for determining which formatters should run.
   */
  readonly formatterPlanner?: FormatterPlannerPort;
  /**
   * Executor that runs formatter implementations.
   */
  readonly formatterExecutor?: FormatterExecutorPort;
  /**
   * Registry used to look up formatter definition factories.
   */
  readonly formatterDefinitionRegistry?: FormatterDefinitionFactoryRegistry;
  /**
   * Context forwarded to formatter definition factories registered via the registry.
   */
  readonly formatterDefinitionContext?: FormatterDefinitionFactoryContext;
  /**
   * Additional formatter definitions to seed the planner registry with.
   */
  readonly formatterDefinitions?: readonly FormatterDefinition[];
  /**
   * Overrides the formatter entries resolved from configuration.
   */
  readonly formatterEntries?: readonly FormatterInstanceConfig[];
  /**
   * Provides precomputed formatter plans.
   */
  readonly formatterPlans?: readonly FormatterPlan[];
  /**
   * Event bus shared across runtime services.
   */
  readonly eventBus?: DomainEventBusPort;
  /**
   * Builder used to capture dependency snapshots.
   */
  readonly dependencyBuilder?: DependencySnapshotBuilderPort;
  /**
   * Strategy that compares dependency snapshots between runs.
   */
  readonly dependencyDiffStrategy?: DependencyDiffStrategyPort;
  /**
   * Overrides the dependency strategy key resolved from configuration.
   */
  readonly dependencyStrategy?: DependencyConfigurationOverrides['strategy'];
  /**
   * Overrides the dependency registry identifier resolved from configuration.
   */
  readonly dependencyRegistry?: DependencyConfigurationOverrides['registry'];
}

/**
 * Collection of services created by {@link createBuildRuntime} that orchestrate build execution.
 */
export interface BuildRuntimeServices {
  readonly planner: SourcePlanner;
  readonly resolution: ResolutionSession;
  readonly transformation: TransformationService;
  readonly formatting: FormattingService;
  readonly dependencyTracking: DependencyTrackingService;
  readonly eventBus: DomainEventBusPort;
  readonly formatterPlans: readonly FormatterPlan[];
  readonly transformDefinitions: readonly TransformDefinition[];
}

/**
 * Duration metrics for each stage of the build pipeline.
 */
export interface BuildTimings {
  readonly planMs: number;
  readonly parseMs: number;
  readonly resolveMs: number;
  readonly transformMs: number;
  readonly formatMs: number;
  readonly dependencyMs: number;
  readonly totalMs: number;
}

/**
 * Summary of cache performance recorded during transform execution.
 */
export interface TransformCacheSummary {
  readonly hits: number;
  readonly misses: number;
  readonly skipped: number;
}

/**
 * Describes the output generated by a formatter invocation.
 */
export interface FormatterExecutionResult {
  readonly id: string;
  readonly name: string;
  readonly artifacts: readonly FileArtifact[];
  readonly output: FormatterOutputConfig;
  readonly writtenPaths?: readonly string[];
}

/**
 * Pointers whose dependency relationships changed or were removed between builds.
 */
export interface DependencyChangeSummary {
  readonly changedPointers: readonly string[];
  readonly removedPointers: readonly string[];
}

/**
 * Flags controlling which stages of the pipeline should execute.
 */
export interface BuildRunOptions {
  readonly includeTransforms?: boolean;
  readonly includeFormatters?: boolean;
  readonly parentSpan?: TelemetrySpan;
}

/**
 * Aggregate output returned after the build pipeline completes.
 */
export interface BuildRunResult {
  readonly plan: SourcePlan;
  readonly resolved: ResolvedPlan;
  readonly tokens: readonly TokenSnapshot[];
  readonly transforms: Awaited<ReturnType<TransformationService['run']>>['results'];
  readonly formatters: readonly FormatterExecutionResult[];
  readonly timings: BuildTimings;
  readonly metrics: TokenMetrics;
  readonly transformCache: TransformCacheSummary;
  readonly dependencyChanges?: DependencyChangeSummary;
  readonly writtenArtifacts: ReadonlyMap<string, readonly string[]>;
  readonly runContext?: RunContext;
}

/**
 * Creates the set of runtime services that orchestrate planning, resolution, transformation, and
 * formatting for a build.
 * @param {BuildConfig} config - Build configuration describing sources, transforms, and formatters.
 * @param {BuildRuntimeOptions} [options] - Optional overrides and adapters for runtime behaviour.
 * @returns {BuildRuntimeServices} Constructed build runtime services.
 */
export function createBuildRuntime(
  config: BuildConfig,
  options: BuildRuntimeOptions = {},
): BuildRuntimeServices {
  const logger = options.logger ?? options.planner?.logger ?? noopLogger;
  const eventBus = options.eventBus ?? new InMemoryDomainEventBus();
  if (options.observers?.length) {
    attachLifecycleObservers(eventBus, options.observers);
  }
  const plannerOptions: PlannerOptions = { logger, eventBus, ...options.planner };
  const planner = new SourcePlanner(config, plannerOptions);

  const resolution = new ResolutionSession({
    eventBus,
    ...(options.includeGraphs === undefined ? {} : { includeGraphs: options.includeGraphs }),
    ...(options.flatten === undefined ? {} : { flatten: options.flatten }),
    ...(options.documentCache === undefined ? {} : { documentCache: options.documentCache }),
    ...(options.tokenCache === undefined ? {} : { tokenCache: options.tokenCache }),
  });

  const transformConfiguration = createTransformConfiguration(config, {
    ...(options.transformDefinitions === undefined
      ? {}
      : { definitions: options.transformDefinitions }),
    ...(options.transformRegistry === undefined ? {} : { registry: options.transformRegistry }),
    ...(options.transformExecutor === undefined ? {} : { executor: options.transformExecutor }),
    ...(options.transformCache === undefined ? {} : { cache: options.transformCache }),
  });
  const transformation = new TransformationService({
    executor: transformConfiguration.executor,
    eventBus,
  });

  const formatterConfiguration = createFormatterConfiguration(config, {
    ...(options.formatterPlanner === undefined ? {} : { planner: options.formatterPlanner }),
    ...(options.formatterExecutor === undefined ? {} : { executor: options.formatterExecutor }),
    ...(options.formatterDefinitionRegistry === undefined
      ? {}
      : { definitionRegistry: options.formatterDefinitionRegistry }),
    ...(options.formatterDefinitionContext === undefined
      ? {}
      : { definitionContext: options.formatterDefinitionContext }),
    ...(options.formatterDefinitions === undefined
      ? {}
      : { definitions: options.formatterDefinitions }),
    ...(options.formatterEntries === undefined ? {} : { entries: options.formatterEntries }),
    ...(options.formatterPlans === undefined ? {} : { plans: options.formatterPlans }),
  });
  const formattingOptions: ConstructorParameters<typeof FormattingService>[0] = {
    planner: formatterConfiguration.planner,
    executor: formatterConfiguration.executor,
    eventBus,
    ...(options.artifactWriter === undefined ? {} : { writer: options.artifactWriter }),
  };
  const formatting = new FormattingService(formattingOptions);

  const dependencyConfiguration = createDependencyConfiguration(config, {
    ...(options.dependencyBuilder === undefined ? {} : { builder: options.dependencyBuilder }),
    ...(options.dependencyDiffStrategy === undefined
      ? {}
      : { diffStrategy: options.dependencyDiffStrategy }),
    ...(options.dependencyStrategy === undefined ? {} : { strategy: options.dependencyStrategy }),
    ...(options.dependencyRegistry === undefined ? {} : { registry: options.dependencyRegistry }),
  });

  const dependencyTrackingOptions: ConstructorParameters<typeof DependencyTrackingService>[0] = {
    builder: dependencyConfiguration.builder,
    diffStrategy: dependencyConfiguration.diffStrategy,
    eventBus,
    ...(options.dependencyCache === undefined ? {} : { store: options.dependencyCache }),
  };
  const dependencyTracking = new DependencyTrackingService(dependencyTrackingOptions);

  return {
    planner,
    resolution,
    transformation,
    formatting,
    dependencyTracking,
    eventBus,
    formatterPlans: formatterConfiguration.plans,
    transformDefinitions: transformConfiguration.definitions,
  } satisfies BuildRuntimeServices;
}

/**
 * Runs the full build pipeline using the provided services and configuration.
 * @param {BuildRuntimeServices} services - Runtime services created by {@link createBuildRuntime}.
 * @param {BuildConfig} config - Build configuration associated with the current run.
 * @param {TelemetryTracer} telemetry - Telemetry tracer used to instrument the pipeline.
 * @param {BuildRunOptions} [options] - Optional flags controlling pipeline execution.
 * @returns {Promise<BuildRunResult>} Summary of the completed build.
 */
export async function executeBuild(
  services: BuildRuntimeServices,
  config: BuildConfig,
  telemetry: TelemetryTracer,
  options: BuildRunOptions = {},
): Promise<BuildRunResult> {
  const includeTransforms = options.includeTransforms ?? true;
  const includeFormatters = options.includeFormatters ?? true;
  const parentSpan = options.parentSpan;
  const runSpan = parentSpan
    ? parentSpan.startChild('dtifx.pipeline.run', {
        attributes: { includeTransforms, includeFormatters },
      })
    : telemetry.startSpan('dtifx.pipeline.run', {
        attributes: { includeTransforms, includeFormatters },
      });

  const totalStart = performance.now();

  let plan: SourcePlan;
  let planMs = 0;
  let resolved: ResolvedPlan;
  let resolveMs = 0;
  let parseMs = 0;
  let tokens: readonly TokenSnapshot[] = [];
  let metrics: TokenMetrics = collectTokenMetrics([]);
  let dependencyResult: DependencyTrackingResult | undefined;
  let dependencyDiff: TokenDependencyDiff | undefined;
  let dependencyMs = 0;
  let transformResults: Awaited<ReturnType<TransformationService['run']>>['results'] = [];
  let transformMs = 0;
  let transformCacheSummary: TransformCacheSummary = {
    hits: 0,
    misses: 0,
    skipped: 0,
  };
  let formatterResults: FormatterExecutionResult[] = [];
  let formatMs = 0;
  let writtenArtifacts: ReadonlyMap<string, readonly string[]> = new Map();

  try {
    const planSpan = runSpan.startChild('dtifx.pipeline.plan');
    const planStart = performance.now();
    try {
      plan = await services.planner.plan();
      planMs = performance.now() - planStart;
      planSpan.end({ attributes: { entryCount: plan.entries.length } });
    } catch (error) {
      planSpan.end({ status: 'error' });
      throw error;
    }

    const resolveSpan = runSpan.startChild('dtifx.pipeline.resolve');
    const resolveStart = performance.now();
    try {
      resolved = await services.resolution.resolve(plan);
      resolveMs = performance.now() - resolveStart;
      const resolutionMetrics = services.resolution.consumeMetrics();
      parseMs = resolutionMetrics?.parseMs ?? resolveMs;
      resolveSpan.end({ attributes: { entryCount: resolved.entries.length } });
    } catch (error) {
      resolveSpan.end({ status: 'error' });
      throw error;
    }

    tokens = flattenTokens(resolved);
    runSpan.addEvent('tokens.flattened', { count: tokens.length });

    metrics = collectTokenMetrics(tokens as readonly TokenMetricsSnapshot[]);
    runSpan.addEvent('tokens.metrics', {
      totalCount: metrics.totalCount,
      typedCount: metrics.typedCount,
      unreferencedCount: metrics.references.unreferencedCount,
      aliasDepthMax: metrics.aliasDepth.max,
      aliasDepthAverage: metrics.aliasDepth.average,
    });

    dependencyResult = await services.dependencyTracking.evaluate(resolved);
    dependencyDiff = dependencyResult.diff;
    dependencyMs = dependencyResult.durationMs;
    runSpan.addEvent('tokens.dependencies', {
      changedCount: dependencyDiff.changed.size,
      removedCount: dependencyDiff.removed.size,
    });

    if (includeTransforms) {
      const transformSpan = runSpan.startChild('dtifx.pipeline.transform');
      try {
        const result = await services.transformation.run({
          snapshots: tokens,
          changedPointers:
            dependencyDiff?.changed ?? new Set<string>(tokens.map((token) => token.pointer)),
        });
        transformResults = [...result.results];
        transformMs = result.durationMs;
        transformCacheSummary = summariseTransformCache(transformResults);
        transformSpan.end({
          attributes: {
            resultCount: transformResults.length,
            durationMs: result.durationMs,
            cacheHits: transformCacheSummary.hits,
            cacheMisses: transformCacheSummary.misses,
            cacheSkipped: transformCacheSummary.skipped,
          },
        });
      } catch (error) {
        transformSpan.end({ status: 'error' });
        throw error;
      }
    }

    if (includeFormatters) {
      const formatSpan = runSpan.startChild('dtifx.pipeline.format');
      try {
        const baseRequest: Parameters<FormattingService['run']>[0] = {
          snapshots: tokens,
          transforms: transformResults,
          plans: services.formatterPlans,
        };
        const configuredFormatters = getFormatterConfigEntries(config);
        const request =
          configuredFormatters === undefined
            ? baseRequest
            : { ...baseRequest, formatters: configuredFormatters };
        const formattingResult = await services.formatting.run(request);
        formatterResults = formattingResult.executions.map((execution) => {
          const writtenPaths = execution.writtenPaths;
          if (writtenPaths && writtenPaths.length > 0) {
            return {
              id: execution.id,
              name: execution.name,
              artifacts: [...execution.artifacts],
              output: execution.output,
              writtenPaths: [...writtenPaths],
            } satisfies FormatterExecutionResult;
          }
          return {
            id: execution.id,
            name: execution.name,
            artifacts: [...execution.artifacts],
            output: execution.output,
          } satisfies FormatterExecutionResult;
        });
        writtenArtifacts = formattingResult.writes;
        formatMs = formattingResult.durationMs;
        formatSpan.end({
          attributes: {
            formatterCount: formatterResults.length,
            artifactCount: formattingResult.artifacts.length,
            durationMs: formattingResult.durationMs,
          },
        });
      } catch (error) {
        formatSpan.end({ status: 'error' });
        throw error;
      }
    }

    const totalMs = performance.now() - totalStart;
    runSpan.end({
      attributes: {
        entryCount: plan.entries.length,
        tokenCount: metrics.totalCount,
        typedTokenCount: metrics.typedCount,
        unreferencedTokenCount: metrics.references.unreferencedCount,
        parseMs,
        transformCount: transformResults.length,
        formatterCount: formatterResults.length,
        transformCacheHits: transformCacheSummary.hits,
        transformCacheMisses: transformCacheSummary.misses,
        transformCacheSkipped: transformCacheSummary.skipped,
        dependencyChangedCount: dependencyDiff?.changed.size ?? 0,
        dependencyRemovedCount: dependencyDiff?.removed.size ?? 0,
      },
    });

    if (dependencyResult) {
      await services.dependencyTracking.commit(dependencyResult.snapshot);
    }

    const runContext = createRunContext({
      startedAt: plan.createdAt,
      durationMs: totalMs,
    });

    return {
      plan,
      resolved,
      tokens,
      transforms: transformResults,
      formatters: formatterResults,
      timings: {
        planMs,
        parseMs,
        resolveMs,
        transformMs,
        formatMs,
        dependencyMs,
        totalMs,
      },
      metrics,
      transformCache: transformCacheSummary,
      ...(dependencyDiff === undefined
        ? {}
        : { dependencyChanges: summariseDependencyChanges(dependencyDiff) }),
      writtenArtifacts,
      runContext,
    } satisfies BuildRunResult;
  } catch (error) {
    runSpan.end({ status: 'error' });
    throw error;
  }
}

/**
 * Flattens the resolved plan entries into a single array of token snapshots.
 * @param {ResolvedPlan} resolved - The resolved plan produced by the planner and resolution stages.
 * @returns {readonly TokenSnapshot[]} Ordered list of token snapshots.
 */
function flattenTokens(resolved: ResolvedPlan): readonly TokenSnapshot[] {
  const snapshots: TokenSnapshot[] = [];
  for (const entry of resolved.entries) {
    snapshots.push(...entry.tokens);
  }
  return snapshots;
}

/**
 * Calculates aggregate cache statistics for the provided transform results.
 * @param {Awaited<ReturnType<TransformationService['run']>>['results']} results - Results returned
 * for each transform execution.
 * @returns {TransformCacheSummary} Counts for hits, misses, and skipped cache entries.
 */
function summariseTransformCache(
  results: Awaited<ReturnType<TransformationService['run']>>['results'],
): TransformCacheSummary {
  let hits = 0;
  let misses = 0;
  let skipped = 0;
  for (const result of results) {
    if (result.cacheStatus === 'hit') {
      hits += 1;
      continue;
    }
    if (result.cacheStatus === 'miss') {
      misses += 1;
      continue;
    }
    if (result.cacheStatus === 'skip') {
      skipped += 1;
      continue;
    }
    const exhaustive: never = result.cacheStatus;
    void exhaustive;
  }
  return { hits, misses, skipped } satisfies TransformCacheSummary;
}

/**
 * Produces a simplified summary of dependency changes for reporting.
 * @param {TokenDependencyDiff} diff - Dependency diff produced by the tracking service.
 * @returns {DependencyChangeSummary} Sorted lists of changed and removed pointers.
 */
function summariseDependencyChanges(diff: TokenDependencyDiff): DependencyChangeSummary {
  const changedPointers = [...diff.changed].toSorted();
  const removedPointers = [...diff.removed].toSorted();
  return { changedPointers, removedPointers } satisfies DependencyChangeSummary;
}

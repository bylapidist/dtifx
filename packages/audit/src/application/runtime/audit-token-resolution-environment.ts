import type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';

import {
  SessionTokenParser,
  DefaultSourceRepository,
  collectTokenMetrics,
  planTokenSources,
  type SessionTokenParserOptions,
  type ParserMetrics,
  type ParserPort,
  type TokenResolutionServiceOptions,
  TokenResolutionService,
  type TokenResolvedPlan,
  type TokenResolutionSnapshot,
  type TokenSourceConfig,
  type TokenSourcePlanningConfig,
  type TokenSourcePlan,
  type TokenSourceRepositoryPort,
  type TokenLayerConfig,
  type TokenMetricsSnapshot,
} from '@dtifx/core/sources';
import {
  InMemoryDomainEventBus,
  createLifecycleLoggingSubscriber,
  createLifecycleTelemetrySubscriber,
  type DomainEventBusPort,
  type DomainEventSubscriber,
  type DomainEventSubscription,
} from '@dtifx/core/runtime';
import {
  convertTokenSourceIssues,
  type DiagnosticEvent,
  type StructuredLogger,
  type TokenSourceIssue,
} from '@dtifx/core';

import type { AuditTelemetryRuntime } from './audit-runtime.js';
import type {
  AuditPipelineTimings,
  AuditTokenMetrics,
  AuditTokenResolutionPort,
  AuditTokenResolutionResult,
  AuditTokenResolutionContext,
} from './audit-runtime.js';
import type {
  AuditConfigurationSource,
  PolicyConfigurationResult,
  PolicyRuleFactoryRegistry,
} from '../configuration/policies.js';
import {
  createPolicyConfiguration,
  loadPolicyRuleRegistry,
  type LoadPolicyRuleRegistryOptions,
} from '../configuration/policies.js';
import type { LoadedAuditConfiguration } from '../configuration/config-loader.js';
import type { PolicyTokenSnapshot } from '../../domain/tokens/token-snapshot.js';
import type { PolicyTokenMetadata } from '../../domain/tokens/token-snapshot.js';

export interface CreateAuditTokenResolutionEnvironmentOptions<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
> {
  readonly telemetry: AuditTelemetryRuntime;
  readonly logger: StructuredLogger;
  readonly configuration: LoadedAuditConfiguration<TConfig>;
  readonly documentCache?: DocumentCache;
  readonly tokenCache?: TokenCache;
}

export interface AuditTokenResolutionEnvironment {
  readonly policyConfiguration: PolicyConfigurationResult;
  readonly tokens: AuditTokenResolutionPort;
  dispose(): void;
}

export interface CreateAuditTokenResolutionEnvironmentDependencies {
  readonly planSources?: typeof planTokenSources;
  readonly createRepository?: (configDirectory: string) => TokenSourceRepositoryPort;
  readonly repository?: TokenSourceRepositoryPort;
  readonly createEventBus?: () => DomainEventBusPort;
  readonly loggingSubscriberFactory?: (logger: StructuredLogger) => DomainEventSubscriber;
  readonly telemetrySubscriberFactory?: (options: {
    getSpan(): AuditTokenResolutionContext['span'];
  }) => DomainEventSubscriber;
  readonly createParser?: (options: SessionTokenParserOptions) => ParserPort;
  readonly createResolutionService?: (
    options: TokenResolutionServiceOptions,
  ) => TokenResolutionService;
  readonly collectMetrics?: typeof collectTokenMetrics;
  readonly loadPolicyRegistry?: <
    TConfig extends AuditConfigurationSource = AuditConfigurationSource,
  >(
    options: LoadPolicyRuleRegistryOptions<TConfig>,
  ) => Promise<PolicyRuleFactoryRegistry<TConfig>>;
}

export class AuditSourcePlanningError extends Error {
  readonly issues: readonly TokenSourceIssue[];
  readonly diagnostics: readonly DiagnosticEvent[];

  constructor(
    message: string,
    issues: readonly TokenSourceIssue[],
    diagnostics: readonly DiagnosticEvent[],
  ) {
    super(message);
    this.name = 'AuditSourcePlanningError';
    this.issues = issues;
    this.diagnostics = diagnostics;
  }
}

/**
 * Creates an audit token resolution environment that plans token sources, resolves snapshots, and prepares policy state.
 *
 * @param options - Audit configuration, telemetry, and logging dependencies.
 * @param dependencies - Optional overrides for planning, repositories, and infrastructure.
 * @returns An environment capable of resolving token snapshots for audit workflows.
 */
export async function createAuditTokenResolutionEnvironment<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
>(
  options: CreateAuditTokenResolutionEnvironmentOptions<TConfig>,
  dependencies: CreateAuditTokenResolutionEnvironmentDependencies = {},
): Promise<AuditTokenResolutionEnvironment> {
  const { configuration } = options;

  const loadRegistry = dependencies.loadPolicyRegistry ?? loadPolicyRuleRegistry;
  const policyRegistry = await loadRegistry({
    config: configuration.config,
    configDirectory: configuration.directory,
    configPath: configuration.path,
  });

  const policyConfiguration = createPolicyConfiguration(configuration.config, {
    ruleRegistry: policyRegistry,
    ruleFactoryContext: {
      config: configuration.config,
      configDirectory: configuration.directory,
      configPath: configuration.path,
    },
  });

  const repository =
    dependencies.repository ??
    dependencies.createRepository?.(configuration.directory) ??
    new DefaultSourceRepository({ cwd: () => configuration.directory });

  const eventBus = dependencies.createEventBus?.() ?? new InMemoryDomainEventBus();

  const loggingSubscriber =
    dependencies.loggingSubscriberFactory?.(options.logger) ??
    createLifecycleLoggingSubscriber({
      logger: options.logger,
      scope: 'dtifx-audit',
      eventPrefix: 'audit.stage',
    });

  const subscriptions: DomainEventSubscription[] = [eventBus.subscribe(loggingSubscriber)];

  const parserOptions: SessionTokenParserOptions = {
    includeGraphs: true,
    flatten: true,
    ...(options.documentCache ? { documentCache: options.documentCache } : {}),
    ...(options.tokenCache ? { tokenCache: options.tokenCache } : {}),
  } satisfies SessionTokenParserOptions;

  const parser = dependencies.createParser
    ? dependencies.createParser(parserOptions)
    : new SessionTokenParser(parserOptions);

  const consumeMetrics = createParserMetricsConsumer(parser);

  const resolutionOptions: TokenResolutionServiceOptions = {
    parser,
    includeGraphs: true,
    flatten: true,
    eventBus,
    ...(options.documentCache ? { documentCache: options.documentCache } : {}),
    ...(options.tokenCache ? { tokenCache: options.tokenCache } : {}),
  } satisfies TokenResolutionServiceOptions;

  const resolutionService =
    dependencies.createResolutionService?.(resolutionOptions) ??
    new TokenResolutionService(resolutionOptions);

  const plan = dependencies.planSources ?? planTokenSources;
  const collect = dependencies.collectMetrics ?? collectTokenMetrics;

  const tokens: AuditTokenResolutionPort = {
    async resolve(context: AuditTokenResolutionContext): Promise<AuditTokenResolutionResult> {
      const telemetrySubscriber =
        dependencies.telemetrySubscriberFactory?.({ getSpan: () => context.span }) ??
        createLifecycleTelemetrySubscriber({
          getSpan: () => context.span,
          eventNamespace: 'dtifx.audit.stage',
        });

      const telemetrySubscription = eventBus.subscribe(telemetrySubscriber);
      try {
        const planningConfig = toPlanningConfig(configuration.config);
        const planningResult = await executePlanning({
          plan,
          repository,
          eventBus,
          config: planningConfig,
        });

        const resolvedPlan = await resolutionService.resolve(
          planningResult.plan as TokenSourcePlan,
        );
        const parserMetrics =
          consumeMetrics() ??
          ({
            entryCount: 0,
            totalMs: 0,
            parseMs: 0,
            cache: { hits: 0, misses: 0, skipped: 0 },
          } satisfies ParserMetrics);
        const snapshots = flattenResolvedPlan(resolvedPlan);
        const policySnapshots = snapshots.map((snapshot) => toPolicyTokenSnapshot(snapshot));

        const metrics = collect(snapshots.map((snapshot) => toTokenMetricsSnapshot(snapshot)));

        const auditMetrics: AuditTokenMetrics = {
          totalCount: metrics.totalCount,
          typedCount: metrics.typedCount,
          unreferencedCount: metrics.references.unreferencedCount,
        } satisfies AuditTokenMetrics;

        const timings: AuditPipelineTimings = {
          planMs: planningResult.durationMs,
          parseMs: parserMetrics.parseMs,
          resolveMs: Math.max(0, parserMetrics.totalMs - parserMetrics.parseMs),
          transformMs: 0,
          formatMs: 0,
          dependencyMs: 0,
          totalMs: planningResult.durationMs + parserMetrics.totalMs,
        } satisfies AuditPipelineTimings;

        return {
          snapshots: policySnapshots,
          metrics: auditMetrics,
          timings,
        } satisfies AuditTokenResolutionResult;
      } finally {
        telemetrySubscription.unsubscribe();
      }
    },
  } satisfies AuditTokenResolutionPort;

  return {
    policyConfiguration,
    tokens,
    dispose() {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    },
  } satisfies AuditTokenResolutionEnvironment;
}

interface PlanningOptions {
  readonly plan: typeof planTokenSources;
  readonly repository: TokenSourceRepositoryPort;
  readonly eventBus: DomainEventBusPort;
  readonly config: TokenSourcePlanningConfig;
}

async function executePlanning(options: PlanningOptions): Promise<{
  plan: TokenSourcePlan;
  issues: readonly TokenSourceIssue[];
  durationMs: number;
}> {
  await options.eventBus.publish({
    type: 'stage:start',
    payload: { stage: 'planning', timestamp: new Date() },
  });

  try {
    const result = await options.plan(options.config, { repository: options.repository });
    if (result.issues.length > 0) {
      const diagnostics = convertTokenSourceIssues(result.issues, { label: 'audit' });
      const error = new AuditSourcePlanningError(
        'One or more token sources failed validation',
        result.issues,
        diagnostics,
      );
      await options.eventBus.publish({
        type: 'stage:error',
        payload: { stage: 'planning', timestamp: new Date(), error },
      });
      throw error;
    }

    await options.eventBus.publish({
      type: 'stage:complete',
      payload: {
        stage: 'planning',
        timestamp: new Date(),
        attributes: { durationMs: result.durationMs, entryCount: result.plan.entries.length },
      },
    });

    return result;
  } catch (error) {
    if (!(error instanceof AuditSourcePlanningError)) {
      await options.eventBus.publish({
        type: 'stage:error',
        payload: { stage: 'planning', timestamp: new Date(), error },
      });
    }
    throw error;
  }
}

function toPlanningConfig(config: AuditConfigurationSource): TokenSourcePlanningConfig {
  const layers = (config as AuditConfigurationSource & { layers?: unknown }).layers;
  const sources = (config as AuditConfigurationSource & { sources?: unknown }).sources;

  if (!Array.isArray(layers) || !Array.isArray(sources)) {
    throw new TypeError(
      'Audit configuration must define "layers" and "sources" arrays to resolve tokens.',
    );
  }

  return {
    layers: layers as readonly TokenLayerConfig[],
    sources: sources as readonly TokenSourceConfig[],
  } satisfies TokenSourcePlanningConfig;
}

function flattenResolvedPlan(plan: TokenResolvedPlan): readonly TokenResolutionSnapshot[] {
  const snapshots: TokenResolutionSnapshot[] = [];
  for (const entry of plan.entries) {
    snapshots.push(...entry.tokens);
  }
  return snapshots;
}

function toPolicyTokenSnapshot(snapshot: TokenResolutionSnapshot): PolicyTokenSnapshot {
  return {
    pointer: snapshot.pointer,
    ...(snapshot.sourcePointer ? { sourcePointer: snapshot.sourcePointer } : {}),
    token: {
      ...(snapshot.id ? { id: snapshot.id } : {}),
      ...(snapshot.type === undefined ? {} : { type: snapshot.type }),
      ...(snapshot.value === undefined ? {} : { value: snapshot.value }),
      ...(snapshot.raw === undefined ? {} : { raw: snapshot.raw }),
    },
    metadata: toPolicyTokenMetadata(snapshot),
    ...(snapshot.resolution?.value === undefined
      ? {}
      : { resolution: { value: snapshot.resolution.value } }),
    provenance: snapshot.provenance,
    context: snapshot.context,
  } satisfies PolicyTokenSnapshot;
}

function toPolicyTokenMetadata(snapshot: TokenResolutionSnapshot): PolicyTokenMetadata {
  const extensions = snapshot.metadata?.extensions ?? snapshot.extensions;
  const deprecated = snapshot.metadata?.deprecated ?? snapshot.deprecated;

  return {
    extensions: { ...extensions },
    ...(deprecated ? { deprecated } : {}),
  } satisfies PolicyTokenMetadata;
}

function createParserMetricsConsumer(parser: ParserPort): () => ParserMetrics | undefined {
  const candidate = parser as ParserPort & { consumeMetrics?: () => ParserMetrics | undefined };
  if (typeof candidate.consumeMetrics === 'function') {
    return () => candidate.consumeMetrics?.();
  }
  return () => void 0;
}

function toTokenMetricsSnapshot(snapshot: TokenResolutionSnapshot): TokenMetricsSnapshot {
  return {
    pointer: snapshot.pointer,
    ...(snapshot.sourcePointer ? { sourcePointer: snapshot.sourcePointer } : {}),
    token: { ...(snapshot.type === undefined ? {} : { type: snapshot.type }) },
    provenance: { uri: snapshot.provenance.uri },
    ...(snapshot.resolution
      ? {
          resolution: {
            ...(snapshot.resolution.type === undefined ? {} : { type: snapshot.resolution.type }),
            references: snapshot.resolution.references.map((reference) => ({
              pointer: reference.pointer,
              uri: reference.uri,
            })),
            appliedAliases: snapshot.resolution.appliedAliases.map((alias) => ({
              pointer: alias.pointer,
              uri: alias.uri,
            })),
          },
        }
      : {}),
  };
}

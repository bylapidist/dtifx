import type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';

import type { StructuredLogger } from '@dtifx/core/logging';

import type { PolicyTokenSnapshot } from '../../domain/tokens/token-snapshot.js';
import type {
  AuditConfigurationSource,
  PolicyConfigurationResult,
} from '../configuration/policies.js';
import type { LoadedAuditConfiguration } from '../configuration/config-loader.js';
import type {
  AuditPipelineTimings,
  AuditTelemetryRuntime,
  AuditTelemetrySpan,
  AuditTokenMetrics,
  AuditTokenResolutionPort,
  AuditTokenResolutionResult,
} from './audit-runtime.js';
import type { AuditRunMetadata } from '../reporting/cli-reporters.js';

interface BuildEventSubscription {
  unsubscribe(): void;
}

interface BuildEventBus {
  subscribe(subscriber: unknown): BuildEventSubscription;
}

interface BuildRuntimeServices {
  readonly eventBus: BuildEventBus;
}

interface BuildEnvironmentContext<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
> {
  readonly config: TConfig;
  readonly configDirectory: string;
  readonly configPath: string;
}

interface BuildEnvironmentResult {
  readonly services: BuildRuntimeServices;
  readonly policyConfiguration: PolicyConfigurationResult;
}

interface BuildRunMetrics {
  readonly totalCount: number;
  readonly typedCount: number;
  readonly references: {
    readonly unreferencedCount: number;
  };
}

interface BuildRunTimings {
  readonly planMs: number;
  readonly parseMs: number;
  readonly resolveMs: number;
  readonly transformMs: number;
  readonly formatMs: number;
  readonly dependencyMs: number;
  readonly totalMs: number;
}

interface BuildRunResult {
  readonly tokens: readonly PolicyTokenSnapshot[];
  readonly timings: BuildRunTimings;
  readonly metrics: BuildRunMetrics;
  readonly runContext?: AuditRunMetadata['runContext'];
}

export interface BuildModuleIntegration<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
  TEnvironmentOptions = unknown,
> {
  createDefaultBuildEnvironment(
    context: BuildEnvironmentContext<TConfig>,
    options: TEnvironmentOptions,
  ): BuildEnvironmentResult;
  createBuildStageLoggingSubscriber(logger: StructuredLogger): unknown;
  createBuildStageTelemetryEventSubscriber(options: { getSpan(): AuditTelemetrySpan }): unknown;
  executeBuild(
    services: BuildRuntimeServices,
    config: TConfig,
    tracer: AuditTelemetryRuntime['tracer'],
    options: { readonly includeFormatters?: boolean; readonly parentSpan?: AuditTelemetrySpan },
  ): Promise<BuildRunResult>;
}

export interface CreateBuildTokenResolutionOptions<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
  TEnvironmentOptions = unknown,
> {
  readonly build: BuildModuleIntegration<TConfig, TEnvironmentOptions>;
  readonly telemetry: AuditTelemetryRuntime;
  readonly logger: StructuredLogger;
  readonly configuration: LoadedAuditConfiguration<TConfig>;
  readonly defaultOutDir?: string;
  readonly documentCache?: DocumentCache;
  readonly tokenCache?: TokenCache;
}

export interface BuildTokenResolutionEnvironment {
  readonly policyConfiguration: PolicyConfigurationResult;
  readonly tokens: AuditTokenResolutionPort;
  dispose(): void;
}

export const createBuildTokenResolutionEnvironment = async <
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
  TEnvironmentOptions = unknown,
>(
  options: CreateBuildTokenResolutionOptions<TConfig, TEnvironmentOptions>,
): Promise<BuildTokenResolutionEnvironment> => {
  const { config, directory, path } = options.configuration;

  const runtime = options.build.createDefaultBuildEnvironment(
    {
      config,
      configDirectory: directory,
      configPath: path,
    },
    {
      logger: options.logger,
      ...(options.defaultOutDir ? { defaultOutDir: options.defaultOutDir } : {}),
      ...(options.documentCache ? { documentCache: options.documentCache } : {}),
      ...(options.tokenCache ? { tokenCache: options.tokenCache } : {}),
      runtime: { flatten: true, includeGraphs: true },
    } as TEnvironmentOptions,
  );

  const loggingSubscriber = options.build.createBuildStageLoggingSubscriber(options.logger);
  const subscriptions: BuildEventSubscription[] = [
    runtime.services.eventBus.subscribe(loggingSubscriber),
  ];

  const tokens: AuditTokenResolutionPort = {
    async resolve({ span }): Promise<AuditTokenResolutionResult> {
      const telemetrySubscriber = options.build.createBuildStageTelemetryEventSubscriber({
        getSpan: () => span,
      });
      const telemetrySubscription = runtime.services.eventBus.subscribe(telemetrySubscriber);

      const buildSpan = span.startChild('dtifx.cli.audit.build');
      try {
        const result = await options.build.executeBuild(
          runtime.services,
          config,
          options.telemetry.tracer,
          {
            includeFormatters: false,
            parentSpan: buildSpan,
          },
        );

        buildSpan.end({
          attributes: {
            tokenCount: result.metrics.totalCount,
            typedTokenCount: result.metrics.typedCount,
            unreferencedTokenCount: result.metrics.references.unreferencedCount,
          },
        });

        const timings: AuditPipelineTimings = {
          planMs: result.timings.planMs,
          parseMs: result.timings.parseMs,
          resolveMs: result.timings.resolveMs,
          transformMs: result.timings.transformMs,
          formatMs: result.timings.formatMs,
          dependencyMs: result.timings.dependencyMs,
          totalMs: result.timings.totalMs,
        } satisfies AuditPipelineTimings;

        const metrics: AuditTokenMetrics = {
          totalCount: result.metrics.totalCount,
          typedCount: result.metrics.typedCount,
          unreferencedCount: result.metrics.references.unreferencedCount,
        } satisfies AuditTokenMetrics;

        const metadata: AuditRunMetadata | undefined = result.runContext
          ? { runContext: result.runContext }
          : undefined;

        return {
          snapshots: result.tokens,
          timings,
          metrics,
          ...(metadata ? { metadata } : {}),
        } satisfies AuditTokenResolutionResult;
      } catch (error) {
        buildSpan.end({ status: 'error' });
        throw error;
      } finally {
        telemetrySubscription.unsubscribe();
      }
    },
  } satisfies AuditTokenResolutionPort;

  let disposed = false;
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
  };

  return {
    policyConfiguration: runtime.policyConfiguration,
    tokens,
    dispose,
  } satisfies BuildTokenResolutionEnvironment;
};

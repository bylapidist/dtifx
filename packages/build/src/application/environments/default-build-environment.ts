import path from 'node:path';

import { InMemoryDocumentCache, type DocumentCache, type TokenCache } from '@lapidist/dtif-parser';

import type { BuildConfig } from '../../config/index.js';
import {
  createBuildRuntime,
  type BuildRuntimeServices,
  type BuildRuntimeOptions,
} from '../build-runtime.js';
import type { TransformCache } from '../../transform/transform-cache.js';
import { FileSystemTransformCache } from '../../transform/transform-cache.js';
import type { TokenDependencyCache } from '../../incremental/token-dependency-cache.js';
import { FileSystemTokenDependencyCache } from '../../incremental/token-dependency-cache.js';
import { FileSystemTokenCache } from '../../session/file-system-token-cache.js';
import type { StructuredLogger } from '@dtifx/core/logging';
import type { ArtifactWriterPort } from '../../domain/ports/formatters.js';
import { FileSystemArtifactWriter } from '../../infrastructure/formatting/file-system-artifact-writer.js';
import {
  createTransformConfiguration,
  type TransformConfigurationOverrides,
  type TransformConfigurationResult,
} from '../configuration/transforms.js';
import {
  createDependencyConfiguration,
  type DependencyConfigurationOverrides,
  type DependencyConfigurationResult,
} from '../configuration/dependencies.js';
import {
  createPolicyConfiguration,
  type PolicyConfigurationOverrides,
  type PolicyConfigurationResult,
} from '@dtifx/core/policy/configuration';
import type { FormatterConfigurationOverrides } from '../configuration/formatters.js';

/**
 * Metadata describing the loaded build configuration and where it originated from.
 */
export interface BuildEnvironmentContext {
  readonly config: BuildConfig;
  readonly configPath: string;
  readonly configDirectory: string;
}

/**
 * Overrides that allow callers to provide custom runtime services when creating the environment.
 */
export interface DefaultBuildEnvironmentOverrides {
  readonly logger?: StructuredLogger;
  readonly planner?: BuildRuntimeOptions['planner'];
  readonly documentCache?: DocumentCache;
  readonly tokenCache?: TokenCache;
  readonly transformCache?: TransformCache;
  readonly dependencyCache?: TokenDependencyCache;
  readonly artifactWriter?: ArtifactWriterPort;
  readonly transform?: TransformConfigurationOverrides;
  readonly dependencies?: DependencyConfigurationOverrides;
  readonly policies?: PolicyConfigurationOverrides;
  readonly formatters?: FormatterConfigurationOverrides;
  readonly runtime?: Pick<
    BuildRuntimeOptions,
    | 'eventBus'
    | 'flatten'
    | 'includeGraphs'
    | 'formatterExecutor'
    | 'formatterPlanner'
    | 'observers'
  >;
}

/**
 * Options accepted by {@link createDefaultBuildEnvironment} including overrides and defaults.
 */
export interface DefaultBuildEnvironmentOptions extends DefaultBuildEnvironmentOverrides {
  readonly defaultOutDir?: string;
}

/**
 * Result returned by {@link createDefaultBuildEnvironment} containing runtime services and caches.
 */
export interface DefaultBuildEnvironmentResult {
  readonly services: BuildRuntimeServices;
  readonly transformConfiguration: TransformConfigurationResult;
  readonly dependencyConfiguration: DependencyConfigurationResult;
  readonly policyConfiguration: PolicyConfigurationResult;
  readonly documentCache: DocumentCache;
  readonly tokenCache: TokenCache;
  readonly transformCache: TransformCache;
  readonly dependencyCache: TokenDependencyCache;
  readonly artifactWriter: ArtifactWriterPort;
}

/**
 * Creates the default build environment used by CLI commands, wiring caches, writers, and
 * configuration registries together.
 * @param {BuildEnvironmentContext} context - Metadata describing the loaded configuration.
 * @param {DefaultBuildEnvironmentOptions} [options] - Overrides for caches, loggers, and registries.
 * @returns {DefaultBuildEnvironmentResult} The assembled runtime services and configuration state.
 */
export function createDefaultBuildEnvironment(
  context: BuildEnvironmentContext,
  options: DefaultBuildEnvironmentOptions = {},
): DefaultBuildEnvironmentResult {
  const cacheRoot = path.resolve(context.configDirectory, '.dtifx-cache');
  const documentCache = options.documentCache ?? new InMemoryDocumentCache();
  const tokenCache = options.tokenCache ?? new FileSystemTokenCache(path.join(cacheRoot, 'parser'));
  const transformCache =
    options.transformCache ?? new FileSystemTransformCache(path.join(cacheRoot, 'transforms'));
  const dependencyCache =
    options.dependencyCache ??
    new FileSystemTokenDependencyCache(path.join(cacheRoot, 'dependencies', 'snapshot.json'));
  const artifactWriter =
    options.artifactWriter ??
    new FileSystemArtifactWriter({
      configDir: context.configDirectory,
      ...(options.defaultOutDir === undefined ? {} : { defaultOutDir: options.defaultOutDir }),
    });

  const transformOption = options.transform;
  const transformOverrides: TransformConfigurationOverrides = {
    ...transformOption,
    cache: transformOption?.cache ?? transformCache,
    definitionContext: {
      config: context.config,
      configDirectory: context.configDirectory,
      configPath: context.configPath,
      ...transformOption?.definitionContext,
    },
  } satisfies TransformConfigurationOverrides;

  const transformConfiguration = createTransformConfiguration(context.config, transformOverrides);

  const dependencyOverrides = options.dependencies;
  const dependencyConfiguration = createDependencyConfiguration(context.config, {
    ...dependencyOverrides,
  });

  const policyOverrides = options.policies as PolicyConfigurationOverrides<BuildConfig> | undefined;
  const basePolicyRuleFactoryContext: PolicyConfigurationOverrides<BuildConfig>['ruleFactoryContext'] =
    {
      config: context.config,
      configDirectory: context.configDirectory,
      configPath: context.configPath,
    };

  const policyConfigurationOverrides: PolicyConfigurationOverrides<BuildConfig> = policyOverrides
    ? {
        ...policyOverrides,
        ruleFactoryContext: {
          ...basePolicyRuleFactoryContext,
          ...policyOverrides.ruleFactoryContext,
          config: policyOverrides.ruleFactoryContext?.config ?? context.config,
          configDirectory:
            policyOverrides.ruleFactoryContext?.configDirectory ?? context.configDirectory,
          configPath: policyOverrides.ruleFactoryContext?.configPath ?? context.configPath,
        },
      }
    : { ruleFactoryContext: basePolicyRuleFactoryContext };

  const policyConfiguration = createPolicyConfiguration(
    context.config,
    policyConfigurationOverrides,
  );

  const formatterOverrides = options.formatters;
  const formatterDefinitionContext =
    formatterOverrides?.definitionContext === undefined
      ? {
          config: context.config,
          configDirectory: context.configDirectory,
          configPath: context.configPath,
        }
      : {
          ...formatterOverrides.definitionContext,
          config: formatterOverrides.definitionContext.config ?? context.config,
          configDirectory:
            formatterOverrides.definitionContext.configDirectory ?? context.configDirectory,
          configPath: formatterOverrides.definitionContext.configPath ?? context.configPath,
        };

  const runtimeOverrides = options.runtime;
  const runtimeOptions = {
    ...runtimeOverrides,
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.planner ? { planner: options.planner } : {}),
    formatterDefinitionContext,
    ...(formatterOverrides?.planner ? { formatterPlanner: formatterOverrides.planner } : {}),
    ...(formatterOverrides?.executor ? { formatterExecutor: formatterOverrides.executor } : {}),
    ...(formatterOverrides?.definitionRegistry
      ? { formatterDefinitionRegistry: formatterOverrides.definitionRegistry }
      : {}),
    ...(formatterOverrides?.definitions
      ? { formatterDefinitions: formatterOverrides.definitions }
      : {}),
    ...(formatterOverrides?.entries ? { formatterEntries: formatterOverrides.entries } : {}),
    ...(formatterOverrides?.plans ? { formatterPlans: formatterOverrides.plans } : {}),
  } satisfies BuildRuntimeOptions;

  const services = createBuildRuntime(context.config, {
    ...runtimeOptions,
    documentCache,
    tokenCache,
    transformCache,
    dependencyCache,
    artifactWriter,
    transformExecutor: transformConfiguration.executor,
    transformRegistry: transformConfiguration.registry,
    transformDefinitions: transformConfiguration.definitions,
    dependencyBuilder: dependencyConfiguration.builder,
    dependencyDiffStrategy: dependencyConfiguration.diffStrategy,
  });

  return {
    services,
    transformConfiguration,
    dependencyConfiguration,
    policyConfiguration,
    documentCache,
    tokenCache,
    transformCache,
    dependencyCache,
    artifactWriter,
  } satisfies DefaultBuildEnvironmentResult;
}

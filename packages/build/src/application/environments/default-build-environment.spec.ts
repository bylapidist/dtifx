import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BuildConfig } from '../../../config/index.js';
import type { TransformConfigurationOverrides } from '../configuration/transforms.js';
import type { DependencyConfigurationOverrides } from '../configuration/dependencies.js';
import type { PolicyConfigurationOverrides } from '@dtifx/core/policy/configuration';
import type { FormatterConfigurationOverrides } from '../configuration/formatters.js';
import type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';
import type { TransformCache } from '../../transform/transform-cache.js';
import type { TokenDependencyCache } from '../../incremental/token-dependency-cache.js';
import type { ArtifactWriterPort } from '../../domain/ports/formatters.js';
import type { StructuredLogger } from '@dtifx/core/logging';
import type { BuildRuntimeServices } from '../build-runtime.js';

vi.mock('../build-runtime.js', () => ({
  createBuildRuntime: vi.fn(),
}));

vi.mock('../configuration/transforms.js', () => ({
  createTransformConfiguration: vi.fn(),
}));

vi.mock('../configuration/dependencies.js', () => ({
  createDependencyConfiguration: vi.fn(),
}));

vi.mock('@dtifx/core/policy/configuration', () => ({
  createPolicyConfiguration: vi.fn(),
}));

vi.mock('../../transform/transform-cache.js', () => ({
  FileSystemTransformCache: vi.fn(),
}));

vi.mock('../../incremental/token-dependency-cache.js', () => ({
  FileSystemTokenDependencyCache: vi.fn(),
}));

vi.mock('../../session/file-system-token-cache.js', () => ({
  FileSystemTokenCache: vi.fn(),
}));

vi.mock('../../infrastructure/formatting/file-system-artifact-writer.js', () => ({
  FileSystemArtifactWriter: vi.fn(),
}));

import { createBuildRuntime } from '../build-runtime.js';
import { createTransformConfiguration } from '../configuration/transforms.js';
import { createDependencyConfiguration } from '../configuration/dependencies.js';
import { createPolicyConfiguration } from '@dtifx/core/policy/configuration';
import { FileSystemTransformCache } from '../../transform/transform-cache.js';
import { FileSystemTokenDependencyCache } from '../../incremental/token-dependency-cache.js';
import { FileSystemTokenCache } from '../../session/file-system-token-cache.js';
import { FileSystemArtifactWriter } from '../../infrastructure/formatting/file-system-artifact-writer.js';
import { createDefaultBuildEnvironment } from './default-build-environment.js';

const createBuildRuntimeMock = vi.mocked(createBuildRuntime);
const createTransformConfigurationMock = vi.mocked(createTransformConfiguration);
const createDependencyConfigurationMock = vi.mocked(createDependencyConfiguration);
const createPolicyConfigurationMock = vi.mocked(createPolicyConfiguration);
const FileSystemTransformCacheMock = vi.mocked(FileSystemTransformCache);
const FileSystemTokenDependencyCacheMock = vi.mocked(FileSystemTokenDependencyCache);
const FileSystemTokenCacheMock = vi.mocked(FileSystemTokenCache);
const FileSystemArtifactWriterMock = vi.mocked(FileSystemArtifactWriter);

describe('createDefaultBuildEnvironment', () => {
  const config: BuildConfig = {
    layers: [],
    sources: [],
  };
  const context = {
    config,
    configPath: '/workspace/dtif.config.ts',
    configDirectory: '/workspace',
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();

    createBuildRuntimeMock.mockReturnValue({
      kind: 'services',
    } satisfies BuildRuntimeServices as BuildRuntimeServices);

    createTransformConfigurationMock.mockReturnValue({
      executor: Symbol('executor'),
      registry: Symbol('registry'),
      definitions: Symbol('definitions'),
    });

    createDependencyConfigurationMock.mockReturnValue({
      builder: Symbol('builder'),
      diffStrategy: Symbol('diffStrategy'),
    });

    createPolicyConfigurationMock.mockReturnValue({
      kind: 'policyConfiguration',
    });

    FileSystemTransformCacheMock.mockImplementation(function (root: string) {
      return {
        kind: 'transformCache',
        root,
      };
    });
    FileSystemTokenDependencyCacheMock.mockImplementation(function (filePath: string) {
      return {
        kind: 'dependencyCache',
        filePath,
      };
    });
    FileSystemTokenCacheMock.mockImplementation(function (root: string) {
      return {
        kind: 'tokenCache',
        root,
      };
    });
    FileSystemArtifactWriterMock.mockImplementation(function (options) {
      return {
        kind: 'artifactWriter',
        options,
      };
    });
  });

  it('creates default caches and runtime services when overrides are not provided', () => {
    const result = createDefaultBuildEnvironment(context, { defaultOutDir: 'out' });

    expect(FileSystemTransformCacheMock).toHaveBeenCalledTimes(1);
    expect(FileSystemTokenDependencyCacheMock).toHaveBeenCalledTimes(1);
    expect(FileSystemTokenCacheMock).toHaveBeenCalledTimes(1);
    expect(FileSystemArtifactWriterMock).toHaveBeenCalledTimes(1);

    const cacheRoot = path.resolve(context.configDirectory, '.dtifx-cache');

    expect(FileSystemTransformCacheMock).toHaveBeenCalledWith(path.join(cacheRoot, 'transforms'));
    expect(FileSystemTokenDependencyCacheMock).toHaveBeenCalledWith(
      path.join(cacheRoot, 'dependencies', 'snapshot.json'),
    );
    expect(FileSystemTokenCacheMock).toHaveBeenCalledWith(path.join(cacheRoot, 'parser'));
    expect(FileSystemArtifactWriterMock).toHaveBeenCalledWith({
      configDir: context.configDirectory,
      defaultOutDir: 'out',
    });

    const transformCacheInstance = FileSystemTransformCacheMock.mock.results[0]!.value;
    const dependencyCacheInstance = FileSystemTokenDependencyCacheMock.mock.results[0]!.value;
    const tokenCacheInstance = FileSystemTokenCacheMock.mock.results[0]!.value;
    const artifactWriterInstance = FileSystemArtifactWriterMock.mock.results[0]!.value;
    const transformConfiguration = createTransformConfigurationMock.mock.results[0]!.value;
    const dependencyConfiguration = createDependencyConfigurationMock.mock.results[0]!.value;

    expect(createTransformConfigurationMock).toHaveBeenCalledWith(
      context.config,
      expect.objectContaining({
        cache: transformCacheInstance,
        definitionContext: {
          config: context.config,
          configDirectory: context.configDirectory,
          configPath: context.configPath,
        },
      }),
    );

    expect(createDependencyConfigurationMock).toHaveBeenCalledWith(context.config, {});

    expect(createPolicyConfigurationMock).toHaveBeenCalledWith(context.config, {
      ruleFactoryContext: {
        config: context.config,
        configDirectory: context.configDirectory,
        configPath: context.configPath,
      },
    });

    expect(createBuildRuntimeMock).toHaveBeenCalledWith(
      context.config,
      expect.objectContaining({
        documentCache: result.documentCache,
        tokenCache: tokenCacheInstance,
        transformCache: transformCacheInstance,
        dependencyCache: dependencyCacheInstance,
        artifactWriter: artifactWriterInstance,
        transformExecutor: transformConfiguration.executor,
        transformRegistry: transformConfiguration.registry,
        transformDefinitions: transformConfiguration.definitions,
        dependencyBuilder: dependencyConfiguration.builder,
        dependencyDiffStrategy: dependencyConfiguration.diffStrategy,
      }),
    );

    expect(result.services).toBe(createBuildRuntimeMock.mock.results[0]!.value);
    expect(result.transformConfiguration).toBe(transformConfiguration);
    expect(result.dependencyConfiguration).toBe(dependencyConfiguration);
    expect(result.policyConfiguration).toBe(createPolicyConfigurationMock.mock.results[0]!.value);
    expect(result.transformCache).toBe(transformCacheInstance);
    expect(result.dependencyCache).toBe(dependencyCacheInstance);
    expect(result.tokenCache).toBe(tokenCacheInstance);
    expect(result.artifactWriter).toBe(artifactWriterInstance);
  });

  it('honours provided overrides and merges formatter and policy contexts', () => {
    const documentCache = { kind: 'documentCache' } as unknown as DocumentCache;
    const tokenCache = { kind: 'tokenCache' } as unknown as TokenCache;
    const transformCache = { kind: 'transformCache' } as unknown as TransformCache;
    const dependencyCache = { kind: 'dependencyCache' } as unknown as TokenDependencyCache;
    const artifactWriter = { kind: 'artifactWriter' } as unknown as ArtifactWriterPort;
    const logger = { log: vi.fn() } as unknown as StructuredLogger;
    const planner = { plan: vi.fn() } as unknown;

    const transformOverrides: TransformConfigurationOverrides = {
      entries: [],
      definitionContext: {
        configDirectory: '/custom/transforms',
      },
    };
    const dependencyOverrides: DependencyConfigurationOverrides = {
      builder: { kind: 'builder' } as never,
    };
    const policyOverrides: PolicyConfigurationOverrides<BuildConfig> = {
      ruleFactoryContext: {
        configDirectory: '/policy/dir',
      },
    };
    const formatterOverrides: FormatterConfigurationOverrides = {
      executor: Symbol('formatterExecutor') as never,
      planner: Symbol('formatterPlanner') as never,
      definitionRegistry: Symbol('definitionRegistry') as never,
      definitions: [Symbol('definition')] as never,
      entries: [Symbol('entry')] as never,
      plans: [Symbol('plan')] as never,
      definitionContext: {
        configDirectory: '/custom/formatters',
      },
    };

    const runtimeOverrides = {
      eventBus: Symbol('eventBus'),
      flatten: true,
    } as const;

    const result = createDefaultBuildEnvironment(context, {
      documentCache,
      tokenCache,
      transformCache,
      dependencyCache,
      artifactWriter,
      logger,
      planner,
      transform: transformOverrides,
      dependencies: dependencyOverrides,
      policies: policyOverrides,
      formatters: formatterOverrides,
      runtime: runtimeOverrides,
    });

    expect(FileSystemTransformCacheMock).not.toHaveBeenCalled();
    expect(FileSystemTokenDependencyCacheMock).not.toHaveBeenCalled();
    expect(FileSystemTokenCacheMock).not.toHaveBeenCalled();
    expect(FileSystemArtifactWriterMock).not.toHaveBeenCalled();

    expect(createTransformConfigurationMock).toHaveBeenCalledWith(
      context.config,
      expect.objectContaining({
        cache: transformCache,
        entries: [],
        definitionContext: {
          config: context.config,
          configDirectory: '/custom/transforms',
          configPath: context.configPath,
        },
      }),
    );

    expect(createDependencyConfigurationMock).toHaveBeenCalledWith(
      context.config,
      dependencyOverrides,
    );

    expect(createPolicyConfigurationMock).toHaveBeenCalledWith(
      context.config,
      expect.objectContaining({
        ruleFactoryContext: {
          config: context.config,
          configDirectory: '/policy/dir',
          configPath: context.configPath,
        },
      }),
    );

    expect(createBuildRuntimeMock).toHaveBeenCalledWith(
      context.config,
      expect.objectContaining({
        documentCache,
        tokenCache,
        transformCache,
        dependencyCache,
        artifactWriter,
        logger,
        planner,
        eventBus: runtimeOverrides.eventBus,
        flatten: runtimeOverrides.flatten,
        formatterExecutor: formatterOverrides.executor,
        formatterPlanner: formatterOverrides.planner,
        formatterDefinitionRegistry: formatterOverrides.definitionRegistry,
        formatterDefinitions: formatterOverrides.definitions,
        formatterEntries: formatterOverrides.entries,
        formatterPlans: formatterOverrides.plans,
        formatterDefinitionContext: {
          config: context.config,
          configDirectory: '/custom/formatters',
          configPath: context.configPath,
        },
      }),
    );

    expect(result.documentCache).toBe(documentCache);
    expect(result.tokenCache).toBe(tokenCache);
    expect(result.transformCache).toBe(transformCache);
    expect(result.dependencyCache).toBe(dependencyCache);
    expect(result.artifactWriter).toBe(artifactWriter);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  noopTelemetryTracer,
  type TelemetryAttributeValue,
  type TelemetryAttributes,
  type TelemetrySpan,
  type TelemetrySpanEndOptions,
  type TelemetrySpanOptions,
  type TelemetryTracer,
} from '@dtifx/core/telemetry';

import { createBuildRuntime, executeBuild } from './build-runtime.js';
import type { BuildRuntimeServices, BuildRunResult } from './build-runtime.js';
import type { BuildConfig, SourcePlan } from '../config/index.js';
import type {
  TokenDependencyDiff,
  TokenDependencySnapshot,
} from '../incremental/token-dependency-cache.js';
import type { DependencyTrackingResult } from '../domain/services/dependency-tracking-service.js';
import type {
  ArtifactWriterPort,
  BuildLifecycleObserverPort,
  DependencyDiffStrategyPort,
  DependencySnapshotBuilderPort,
  DomainEventBusPort,
  FormatterExecutorPort,
  FormatterPlannerPort,
  FormatterInstanceConfig,
  FormatterPlan,
  TransformExecutorPort,
} from '../domain/ports/index.js';
import * as events from '../domain/events/index.js';
import type {
  TransformResult,
  TransformDefinition,
  TransformRegistry,
} from '../transform/transform-registry.js';
import type { TokenSnapshot, ResolvedPlan } from '../session/resolution-session.js';
import type { TransformCache } from '../transform/transform-cache.js';
import type { FormatterDefinition } from '../formatter/formatter-registry.js';
import type {
  FormatterDefinitionFactoryContext,
  FormatterDefinitionFactoryRegistry,
} from '../formatter/formatter-factory.js';
import * as transformConfig from './configuration/transforms.js';
import * as formatterConfig from './configuration/formatters.js';
import * as dependencyConfig from './configuration/dependencies.js';
import type { DependencyConfigurationOverrides } from './configuration/dependencies.js';
import type { TokenDependencyCache } from '../incremental/token-dependency-cache.js';
import type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';

const minimalConfig: BuildConfig = {
  layers: [{ name: 'base' }],
  sources: [],
  transforms: { entries: [] },
  formatters: [],
} as BuildConfig;

function createDependencyResult(
  overrides: Partial<DependencyTrackingResult> = {},
): DependencyTrackingResult {
  const snapshot: TokenDependencySnapshot = {
    version: 1,
    resolvedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
    entries: [],
  };
  const diff: TokenDependencyDiff = {
    snapshot,
    changed: new Set<string>(),
    removed: new Set<string>(),
  };
  return {
    snapshot,
    diff,
    durationMs: 0,
    ...overrides,
  } satisfies DependencyTrackingResult;
}

function createMockServices(): {
  readonly services: BuildRuntimeServices;
  readonly plan: SourcePlan;
  readonly resolved: ResolvedPlan;
  readonly plannerPlan: ReturnType<typeof vi.fn>;
  readonly resolutionResolve: ReturnType<typeof vi.fn>;
  readonly resolutionConsumeMetrics: ReturnType<typeof vi.fn>;
  readonly transformationRun: ReturnType<typeof vi.fn>;
  readonly formattingRun: ReturnType<typeof vi.fn>;
  readonly dependencyEvaluate: ReturnType<typeof vi.fn>;
  readonly dependencyCommit: ReturnType<typeof vi.fn>;
} {
  const plan = {
    entries: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
  } as unknown as SourcePlan;
  const token = {
    pointer: '#/tokens/a',
    sourcePointer: '#/tokens/a',
    token: {
      id: 'tokens.a',
      value: { $type: 'dimension', $value: 16 },
      raw: { $type: 'dimension', $value: 16 },
    },
    metadata: undefined,
    resolution: {
      value: { $type: 'dimension', $value: 16 },
      references: [{ uri: 'file:///tokens.json', pointer: '#/tokens/a' }],
      resolutionPath: [{ uri: 'file:///tokens.json', pointer: '#/tokens/a' }],
      appliedAliases: [],
    },
    provenance: {
      sourceId: 'source',
      layer: 'base',
      layerIndex: 0,
      uri: 'file:///tokens.json',
      pointerPrefix: '#/tokens',
    },
    context: { layer: 'base', theme: 'light' },
  } as unknown as TokenSnapshot;
  const resolved = {
    entries: [{ tokens: [token] }],
    diagnostics: [],
    resolvedAt: new Date('2024-01-01T00:00:01Z'),
  } as unknown as ResolvedPlan;
  const plannerPlan = vi.fn(async () => plan);
  const planner = { plan: plannerPlan } as unknown as BuildRuntimeServices['planner'];
  const resolutionResolve = vi.fn(async () => resolved);
  const resolutionConsumeMetrics = vi.fn(() => undefined as number | undefined);
  const resolution = {
    resolve: resolutionResolve,
    consumeMetrics: resolutionConsumeMetrics,
  } as unknown as BuildRuntimeServices['resolution'];
  const transformationRun = vi.fn(async () => ({ results: [], durationMs: 0 }));
  const transformation = {
    run: transformationRun,
  } as unknown as BuildRuntimeServices['transformation'];
  const formattingRun = vi.fn(async () => ({
    executions: [],
    artifacts: [],
    durationMs: 0,
    writes: new Map<string, readonly string[]>(),
  }));
  const formatting = { run: formattingRun } as unknown as BuildRuntimeServices['formatting'];
  const dependencyEvaluate = vi.fn(async () => createDependencyResult());
  const dependencyCommit = vi.fn(async () => {});
  const dependencyTracking = {
    evaluate: dependencyEvaluate,
    commit: dependencyCommit,
  } as unknown as BuildRuntimeServices['dependencyTracking'];
  const eventBus: DomainEventBusPort = {
    publish: vi.fn(async () => {}),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  };

  const services: BuildRuntimeServices = {
    planner,
    resolution,
    transformation,
    formatting,
    dependencyTracking,
    eventBus,
    formatterPlans: [],
    transformDefinitions: [],
  };

  return {
    services,
    plan,
    resolved,
    plannerPlan,
    resolutionResolve,
    resolutionConsumeMetrics,
    transformationRun,
    formattingRun,
    dependencyEvaluate,
    dependencyCommit,
  };
}

class StubSpan implements TelemetrySpan {
  readonly spanId: string;
  readonly traceId: string;
  readonly children: StubSpan[] = [];
  readonly events: { readonly name: string; readonly attributes?: TelemetryAttributes }[] = [];
  readonly attributes: Record<string, TelemetryAttributeValue> = {};
  readonly startOptions: TelemetrySpanOptions | undefined;
  endOptions: TelemetrySpanEndOptions | undefined;
  ended = false;

  constructor(
    private readonly tracer: StubTracer,
    readonly name: string,
    readonly parent: StubSpan | undefined,
    options?: TelemetrySpanOptions,
  ) {
    this.spanId = tracer.allocateSpanId();
    this.traceId = parent ? parent.traceId : tracer.allocateTraceId();
    this.startOptions = options;
  }

  startChild(name: string, options?: TelemetrySpanOptions): TelemetrySpan {
    const child = new StubSpan(this.tracer, name, this, options);
    this.children.push(child);
    this.tracer.register(child);
    return child;
  }

  addEvent(name: string, attributes?: TelemetryAttributes): void {
    this.events.push({ name, attributes });
  }

  setAttribute(name: string, value: TelemetryAttributeValue): void {
    this.attributes[name] = value;
  }

  end(options?: TelemetrySpanEndOptions): void {
    this.ended = true;
    this.endOptions = options;
  }
}

class StubTracer implements TelemetryTracer {
  private spanCounter = 1;
  private traceCounter = 1;
  readonly spans: StubSpan[] = [];

  startSpan(name: string, options?: TelemetrySpanOptions): TelemetrySpan {
    const span = new StubSpan(this, name, undefined, options);
    this.spans.push(span);
    return span;
  }

  allocateSpanId(): string {
    return `span-${(this.spanCounter++).toString(16)}`;
  }

  allocateTraceId(): string {
    return `trace-${(this.traceCounter++).toString(16)}`;
  }

  register(span: StubSpan): void {
    this.spans.push(span);
  }
}

describe('createBuildRuntime', () => {
  it('attaches lifecycle observers when provided', () => {
    const attachSpy = vi.spyOn(events, 'attachLifecycleObservers');
    const eventBus: DomainEventBusPort = {
      publish: vi.fn(async () => {}),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    };
    const observer: BuildLifecycleObserverPort = {
      onStageStart: vi.fn(),
      onStageComplete: vi.fn(),
      onError: vi.fn(),
    };

    createBuildRuntime(minimalConfig, { eventBus, observers: [observer] });

    expect(attachSpy).toHaveBeenCalledWith(eventBus, [observer]);
    attachSpy.mockRestore();
  });

  it('forwards runtime overrides to configuration factories', () => {
    const transformSpy = vi.spyOn(transformConfig, 'createTransformConfiguration');
    const formatterSpy = vi.spyOn(formatterConfig, 'createFormatterConfiguration');
    const dependencySpy = vi.spyOn(dependencyConfig, 'createDependencyConfiguration');

    const documentCache = {} as DocumentCache;
    const tokenCache = {} as TokenCache;
    const transformDefinitions: TransformDefinition[] = [];
    const transformRegistry = {} as TransformRegistry;
    const transformExecutor = { run: vi.fn() } as unknown as TransformExecutorPort;
    const transformCache = { get: vi.fn(), set: vi.fn() } as unknown as TransformCache;
    const formatterPlanner = { plan: vi.fn() } as unknown as FormatterPlannerPort;
    const formatterExecutor = { run: vi.fn() } as unknown as FormatterExecutorPort;
    const formatterDefinitionRegistry = {} as FormatterDefinitionFactoryRegistry;
    const formatterDefinitionContext = {} as FormatterDefinitionFactoryContext;
    const formatterDefinitions: FormatterDefinition[] = [];
    const formatterEntries = [] as readonly FormatterInstanceConfig[];
    const formatterPlans = [] as readonly FormatterPlan[];
    const artifactWriter = { write: vi.fn() } as ArtifactWriterPort;
    const dependencyBuilder = {} as DependencySnapshotBuilderPort;
    const dependencyDiffStrategy = {} as DependencyDiffStrategyPort;
    const dependencyStrategy = 'custom-strategy' as DependencyConfigurationOverrides['strategy'];
    const dependencyRegistry = 'custom-registry' as DependencyConfigurationOverrides['registry'];
    const dependencyCache = {
      load: vi.fn(),
      store: vi.fn(),
    } as unknown as TokenDependencyCache;

    createBuildRuntime(minimalConfig, {
      includeGraphs: true,
      flatten: true,
      documentCache,
      tokenCache,
      transformDefinitions,
      transformRegistry,
      transformExecutor,
      transformCache,
      formatterPlanner,
      formatterExecutor,
      formatterDefinitionRegistry,
      formatterDefinitionContext,
      formatterDefinitions,
      formatterEntries,
      formatterPlans,
      artifactWriter,
      dependencyBuilder,
      dependencyDiffStrategy,
      dependencyStrategy,
      dependencyRegistry,
      dependencyCache,
    });

    expect(transformSpy).toHaveBeenCalledWith(
      minimalConfig,
      expect.objectContaining({
        definitions: transformDefinitions,
        registry: transformRegistry,
        executor: transformExecutor,
        cache: transformCache,
      }),
    );
    expect(formatterSpy).toHaveBeenCalledWith(
      minimalConfig,
      expect.objectContaining({
        planner: formatterPlanner,
        executor: formatterExecutor,
        definitionRegistry: formatterDefinitionRegistry,
        definitionContext: formatterDefinitionContext,
        definitions: formatterDefinitions,
        entries: formatterEntries,
        plans: formatterPlans,
      }),
    );
    expect(dependencySpy).toHaveBeenCalledWith(
      minimalConfig,
      expect.objectContaining({
        builder: dependencyBuilder,
        diffStrategy: dependencyDiffStrategy,
        strategy: dependencyStrategy,
        registry: dependencyRegistry,
      }),
    );

    transformSpy.mockRestore();
    formatterSpy.mockRestore();
    dependencySpy.mockRestore();
  });
});

describe('executeBuild', () => {
  it('skips transforms and formatters when disabled via options', async () => {
    const services = createBuildRuntime(minimalConfig);
    const transformSpy = vi
      .fn<
        Parameters<typeof services.transformation.run>,
        ReturnType<typeof services.transformation.run>
      >()
      .mockImplementation(async () => ({ results: [], durationMs: 0 }));
    const formatSpy = vi
      .fn<Parameters<typeof services.formatting.run>, ReturnType<typeof services.formatting.run>>()
      .mockImplementation(async () => ({
        durationMs: 0,
        executions: [],
        artifacts: [],
        writes: new Map(),
      }));

    services.transformation.run = transformSpy;
    services.formatting.run = formatSpy;

    const result = await executeBuild(services, minimalConfig, noopTelemetryTracer, {
      includeTransforms: false,
      includeFormatters: false,
    });

    expect(transformSpy).not.toHaveBeenCalled();
    expect(formatSpy).not.toHaveBeenCalled();
    expect(result.transforms).toHaveLength(0);
    expect(result.formatters).toHaveLength(0);
    expect(result.writtenArtifacts.size).toBe(0);
  });

  it('commits dependency snapshots when evaluation succeeds', async () => {
    const services = createBuildRuntime(minimalConfig);
    const tracer = new StubTracer();
    const snapshot = {
      version: 1,
      resolvedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      entries: [],
    } as const;
    const diff = {
      snapshot,
      changed: new Set<string>(['#/tokens/a']),
      removed: new Set<string>(),
    };
    const evaluateSpy = vi
      .spyOn(services.dependencyTracking, 'evaluate')
      .mockResolvedValue({ snapshot, diff, durationMs: 5 });
    const commitSpy = vi.spyOn(services.dependencyTracking, 'commit').mockResolvedValue();

    const result = await executeBuild(services, minimalConfig, tracer, {
      includeTransforms: false,
      includeFormatters: false,
    });

    expect(evaluateSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).toHaveBeenCalledWith(snapshot);
    expect(result.dependencyChanges).toEqual({
      changedPointers: ['#/tokens/a'],
      removedPointers: [],
    });
    const runSpan = tracer.spans.find((span) => span.name === 'dtifx.pipeline.run') as
      | StubSpan
      | undefined;
    expect(runSpan?.endOptions?.attributes?.dependencyChangedCount).toBe(1);
  });

  it('marks telemetry spans as errored when planning fails', async () => {
    const services = createBuildRuntime(minimalConfig);
    const tracer = new StubTracer();
    const error = new Error('plan failed');
    vi.spyOn(services.planner, 'plan').mockRejectedValue(error);
    const commitSpy = vi.spyOn(services.dependencyTracking, 'commit');

    await expect(executeBuild(services, minimalConfig, tracer)).rejects.toThrow('plan failed');

    const runSpan = tracer.spans.find((span) => span.name === 'dtifx.pipeline.run') as
      | StubSpan
      | undefined;
    expect(runSpan?.endOptions?.status).toBe('error');
    const planSpan = runSpan?.children.find((span) => span.name === 'dtifx.pipeline.plan');
    expect(planSpan?.endOptions?.status).toBe('error');
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('marks transform spans as errored when transformation fails', async () => {
    const services = createBuildRuntime(minimalConfig);
    const tracer = new StubTracer();
    const evaluateSpy = vi
      .spyOn(services.dependencyTracking, 'evaluate')
      .mockResolvedValue(createDependencyResult());
    const commitSpy = vi.spyOn(services.dependencyTracking, 'commit');
    const transformError = new Error('transform failed');
    vi.spyOn(services.transformation, 'run').mockRejectedValue(transformError);

    await expect(executeBuild(services, minimalConfig, tracer)).rejects.toThrow('transform failed');

    expect(evaluateSpy).toHaveBeenCalled();
    expect(commitSpy).not.toHaveBeenCalled();
    const runSpan = tracer.spans.find((span) => span.name === 'dtifx.pipeline.run') as
      | StubSpan
      | undefined;
    const transformSpan = runSpan?.children.find(
      (span) => span.name === 'dtifx.pipeline.transform',
    );
    expect(transformSpan?.endOptions?.status).toBe('error');
    const formatSpan = runSpan?.children.find((span) => span.name === 'dtifx.pipeline.format');
    expect(formatSpan).toBeUndefined();
    expect(runSpan?.endOptions?.status).toBe('error');
  });

  it('marks format spans as errored when formatter execution fails', async () => {
    const services = createBuildRuntime(minimalConfig);
    const tracer = new StubTracer();
    vi.spyOn(services.dependencyTracking, 'evaluate').mockResolvedValue(createDependencyResult());
    vi.spyOn(services.transformation, 'run').mockResolvedValue({ results: [], durationMs: 0 });
    const formatError = new Error('format failed');
    vi.spyOn(services.formatting, 'run').mockRejectedValue(formatError);

    await expect(executeBuild(services, minimalConfig, tracer)).rejects.toThrow('format failed');

    const runSpan = tracer.spans.find((span) => span.name === 'dtifx.pipeline.run') as
      | StubSpan
      | undefined;
    const formatSpan = runSpan?.children.find((span) => span.name === 'dtifx.pipeline.format');
    expect(formatSpan?.endOptions?.status).toBe('error');
    expect(runSpan?.endOptions?.status).toBe('error');
  });

  it('summarises transform cache hits, misses, and skips in build results', async () => {
    const services = createBuildRuntime(minimalConfig);
    const tracer = new StubTracer();
    vi.spyOn(services.dependencyTracking, 'evaluate').mockResolvedValue(createDependencyResult());
    vi.spyOn(services.dependencyTracking, 'commit').mockResolvedValue();

    const snapshot = { pointer: '#/tokens/a' } as unknown as TokenSnapshot;
    const createResult = (status: TransformResult['cacheStatus']): TransformResult => ({
      transform: 'noop',
      pointer: '#/tokens/a',
      output: {},
      snapshot,
      group: 'default',
      optionsHash: 'hash',
      cacheStatus: status,
    });

    const results: readonly TransformResult[] = [
      createResult('hit'),
      createResult('miss'),
      createResult('skip'),
    ];

    vi.spyOn(services.transformation, 'run').mockResolvedValue({
      results,
      durationMs: 42,
    });
    vi.spyOn(services.formatting, 'run').mockResolvedValue({
      durationMs: 0,
      executions: [],
      artifacts: [],
      writes: new Map(),
    });

    const result = await executeBuild(services, minimalConfig, tracer);

    expect(result.transformCache).toEqual({ hits: 1, misses: 1, skipped: 1 });
    const runSpan = tracer.spans.find((span) => span.name === 'dtifx.pipeline.run');
    expect(runSpan?.endOptions?.attributes).toMatchObject({
      transformCacheHits: 1,
      transformCacheMisses: 1,
      transformCacheSkipped: 1,
    });
  });

  it('creates a child run span when a parent span is provided', async () => {
    const mocks = createMockServices();
    const tracer = new StubTracer();
    const parentSpan = tracer.startSpan('parent-operation') as StubSpan;

    await executeBuild(mocks.services, minimalConfig, tracer, { parentSpan });

    expect(mocks.plannerPlan).toHaveBeenCalledTimes(1);
    const runSpan = parentSpan.children.find((span) => span.name === 'dtifx.pipeline.run');
    expect(runSpan).toBeDefined();
    expect(runSpan?.startOptions?.attributes).toMatchObject({
      includeTransforms: true,
      includeFormatters: true,
    });
  });

  it('falls back to resolve duration when parser metrics are unavailable', async () => {
    const mocks = createMockServices();
    const tracer = new StubTracer();
    const result = await executeBuild(mocks.services, minimalConfig, tracer);

    expect(mocks.resolutionResolve).toHaveBeenCalledTimes(1);
    expect(mocks.resolutionConsumeMetrics).toHaveBeenCalledTimes(1);
    expect(result.timings.parseMs).toBe(result.timings.resolveMs);
  });

  it('retains formatter written paths in build results', async () => {
    const mocks = createMockServices();
    const tracer = new StubTracer();
    const writtenPaths = ['/workspace/out/token.json'];
    const writes = new Map<string, readonly string[]>([['formatter', writtenPaths]]);
    mocks.formattingRun.mockResolvedValue({
      executions: [
        {
          id: 'formatter',
          name: 'Formatter',
          artifacts: [],
          output: {} as BuildRunResult['formatters'][number]['output'],
          writtenPaths,
        },
      ],
      artifacts: [],
      durationMs: 12,
      writes,
    });

    const result = await executeBuild(mocks.services, minimalConfig, tracer);

    expect(mocks.formattingRun).toHaveBeenCalledTimes(1);
    expect(result.formatters).toEqual([expect.objectContaining({ id: 'formatter', writtenPaths })]);
    expect(result.writtenArtifacts).toBe(writes);
  });
});

import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliIo } from '../../io/cli-io.js';
import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { prepareBuildEnvironment } from './environment.js';
import { setBuildModuleImportersForTesting } from './build-module.js';

type BuildDependencies = NonNullable<
  Parameters<typeof setBuildModuleImportersForTesting>[0]
>['build'] extends infer T
  ? NonNullable<T>
  : never;
type ReporterDependencies = NonNullable<
  Parameters<typeof setBuildModuleImportersForTesting>[0]
>['reporters'] extends infer T
  ? NonNullable<T>
  : never;

const createInteractiveIo = (): CliIo & { stderrBuffer: string[] } => {
  const stdoutBuffer: string[] = [];
  const stderrBuffer: string[] = [];
  const stdout = Object.assign(new PassThrough(), {
    write(chunk: string | Uint8Array) {
      stdoutBuffer.push(chunk.toString());
      return true;
    },
  });
  const stderr = Object.assign(new PassThrough(), {
    isTTY: true as const,
    write(chunk: string | Uint8Array) {
      stderrBuffer.push(chunk.toString());
      return true;
    },
  });

  return {
    stdin: new PassThrough(),
    stdout,
    stderr,
    stderrBuffer,
    writeOut(chunk: string) {
      stdoutBuffer.push(chunk);
    },
    writeErr(chunk: string) {
      stderrBuffer.push(chunk);
    },
    exit: vi.fn(),
  } satisfies CliIo & { stderrBuffer: string[] };
};

const createBuildMocks = () => {
  const configPath = '/workspace/dtifx.config.js';
  const loadedConfig = {
    config: { formatters: [] },
    directory: '/workspace',
    path: configPath,
  } as const;
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(() => ({ unsubscribe }));
  const tracerSpan = { end: vi.fn() };
  const telemetryRuntime = {
    tracer: {
      startSpan: vi.fn(() => tracerSpan),
    },
    exportSpans: vi.fn(async () => {}),
  };

  const build: BuildDependencies = {
    resolveConfigPath: vi.fn(async () => configPath),
    loadConfig: vi.fn(async () => loadedConfig),
    loadFormatterDefinitionRegistry: vi.fn(async () => ({ formatters: true })),
    loadTransformDefinitionRegistry: vi.fn(async () => ({ transforms: true })),
    loadDependencyStrategyRegistry: vi.fn(async () => ({ dependencies: true })),
    loadPolicyRuleRegistry: vi.fn(async () => ({ policies: true })),
    createTelemetryRuntime: vi.fn(() => telemetryRuntime),
    createBuildStageLoggingSubscriber: vi.fn(() => vi.fn()),
    createDefaultBuildEnvironment: vi.fn(() => ({
      documentCache: { kind: 'document-cache' },
      tokenCache: { kind: 'token-cache' },
      policyConfiguration: { kind: 'policy' },
      services: {
        eventBus: { subscribe },
      },
    })),
    JsonLineLogger: vi.fn(function (this: unknown, stream: NodeJS.WritableStream) {
      Object.assign(this, { stream, log: vi.fn() });
    }),
    noopLogger: { log: vi.fn() },
  } as unknown as BuildDependencies;

  const reporters: ReporterDependencies = {
    formatDurationMs: vi.fn(() => '5ms'),
  } as ReporterDependencies;

  return { build, reporters, telemetryRuntime, subscribe, unsubscribe, loadedConfig };
};

describe('prepareBuildEnvironment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setBuildModuleImportersForTesting();
  });

  afterEach(() => {
    setBuildModuleImportersForTesting();
  });

  it('returns undefined when the build module cannot be loaded', async () => {
    const io = createMemoryCliIo();
    const reporters: ReporterDependencies = {
      formatDurationMs: vi.fn(() => '0ms'),
    } as ReporterDependencies;
    setBuildModuleImportersForTesting({
      // eslint-disable-next-line unicorn/no-useless-undefined -- simulating unresolved module
      build: async () => undefined,
      reporters: async () => reporters,
    });
    const result = await prepareBuildEnvironment({ jsonLogs: false, timings: false }, io);

    expect(result).toBeUndefined();
  });

  it('returns undefined when the reporters module is unavailable', async () => {
    const io = createMemoryCliIo();
    const { build, reporters } = createBuildMocks();
    setBuildModuleImportersForTesting({
      build: async () => build,
      // eslint-disable-next-line unicorn/no-useless-undefined -- simulating unresolved reporters
      reporters: async () => undefined,
    });
    const result = await prepareBuildEnvironment({ jsonLogs: false, timings: false }, io);

    expect(result).toBeUndefined();
  });

  it('configures the build environment with interactive logging', async () => {
    const io = createInteractiveIo();
    const { build, reporters, telemetryRuntime, subscribe, unsubscribe, loadedConfig } =
      createBuildMocks();
    const documentCache = { source: 'document-cache' } as unknown;
    const tokenCache = { source: 'token-cache' } as unknown;

    setBuildModuleImportersForTesting({
      build: async () => build,
      reporters: async () => reporters,
    });

    const result = await prepareBuildEnvironment(
      {
        config: 'dtifx.config.ts',
        outDir: 'dist/out',
        jsonLogs: false,
        timings: true,
        telemetry: 'stdout',
      },
      io,
      documentCache,
      tokenCache,
    );

    expect(result).toBeDefined();
    expect(build.resolveConfigPath).toHaveBeenCalledWith({ configPath: 'dtifx.config.ts' });
    expect(build.loadFormatterDefinitionRegistry).toHaveBeenCalledWith({
      config: loadedConfig.config,
      configDirectory: loadedConfig.directory,
      configPath: loadedConfig.path,
    });
    expect(build.createTelemetryRuntime).toHaveBeenCalledWith(
      'stdout',
      expect.objectContaining({ logger: expect.any(Object) }),
    );
    expect(build.createDefaultBuildEnvironment).toHaveBeenCalledWith(
      {
        config: loadedConfig.config,
        configDirectory: loadedConfig.directory,
        configPath: loadedConfig.path,
      },
      expect.objectContaining({
        defaultOutDir: 'dist/out',
        documentCache,
        tokenCache,
        runtime: { flatten: true, includeGraphs: true },
      }),
    );

    const environment = result!;
    expect(environment.documentCache).toEqual({ kind: 'document-cache' });
    expect(environment.tokenCache).toEqual({ kind: 'token-cache' });

    environment.logger.log({
      level: 'info',
      event: 'build.complete',
      elapsedMs: 42,
      data: { ok: true },
    });
    expect(reporters.formatDurationMs).toHaveBeenCalledWith(42);
    expect(io.stderrBuffer.join('')).toContain('[info] build.complete');
    expect(io.stderrBuffer.join('')).toContain('5ms');

    environment.dispose();
    environment.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await environment.telemetry.exportSpans();
    expect(telemetryRuntime.exportSpans).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith(expect.any(Function));
  });

  it('uses the JSON logger when structured logging is requested', async () => {
    const io = createMemoryCliIo();
    const { build, reporters } = createBuildMocks();

    setBuildModuleImportersForTesting({
      build: async () => build,
      reporters: async () => reporters,
    });

    await prepareBuildEnvironment({ jsonLogs: true, timings: false }, io);

    expect(build.JsonLineLogger).toHaveBeenCalledWith(io.stdout);
  });
});

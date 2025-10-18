import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';

import { createMemoryCliIo } from '../../testing/memory-cli-io.js';
import { prepareAuditEnvironment } from './environment.js';

const {
  telemetryRuntime,
  JsonLineLoggerMock,
  noopLogger,
  createTelemetryRuntimeMock,
  loadAuditModuleMock,
  auditModule,
} = vi.hoisted(() => {
  const runtime = {
    tracer: {
      startSpan: vi.fn(() => ({ startChild: vi.fn(), end: vi.fn() })),
    },
    exportSpans: vi.fn(async () => {}),
  };
  const module = {
    createAuditTokenResolutionEnvironment: vi.fn(),
    resolveAuditConfigPath: vi.fn(async (options?: { configPath?: string }) =>
      options?.configPath ? `/resolved/${options.configPath}` : '/resolved/dtifx.config.mjs',
    ),
    loadAuditConfiguration: vi.fn(async () => ({
      path: '/resolved/dtifx.config.mjs',
      directory: '/workspace',
      config: { audit: { policies: [] } },
    })),
  };
  return {
    telemetryRuntime: runtime,
    JsonLineLoggerMock: vi.fn(function JsonLineLogger() {}),
    noopLogger: { log: vi.fn() },
    createTelemetryRuntimeMock: vi.fn(() => runtime),
    loadAuditModuleMock: vi.fn(async () => module as never),
    auditModule: module,
  } as const;
});

vi.mock('@dtifx/core/logging', () => ({
  JsonLineLogger: JsonLineLoggerMock,
  noopLogger,
}));

vi.mock('@dtifx/core/telemetry', () => ({
  createTelemetryRuntime: createTelemetryRuntimeMock,
}));

vi.mock('./audit-module-loader.js', () => ({
  loadAuditModule: (...args: Parameters<typeof loadAuditModuleMock>) =>
    loadAuditModuleMock(...args),
}));

beforeEach(() => {
  auditModule.createAuditTokenResolutionEnvironment.mockReset();
  auditModule.resolveAuditConfigPath.mockClear();
  auditModule.loadAuditConfiguration.mockClear();
  loadAuditModuleMock.mockClear();
  loadAuditModuleMock.mockResolvedValue(auditModule as never);
});

describe('prepareAuditEnvironment', () => {
  it('creates an audit environment using injected dependencies', async () => {
    const policyConfiguration = { definitions: [{ id: 'policy-1' }] } as const;
    const tokens = { resolve: vi.fn() } as const;
    const dispose = vi.fn();
    const createTokenEnvironmentMock = vi.fn(async () => ({
      policyConfiguration,
      tokens,
      dispose,
    }));
    const options = {
      config: './dtifx.config.mjs',
      outDir: 'dist/audit',
      jsonLogs: true,
      reporter: 'json',
      telemetry: 'stdout',
      timings: true,
    } as const;
    const documentCache = {} as DocumentCache;
    const tokenCache = {} as TokenCache;
    const io = createMemoryCliIo();

    const resolveConfigPath = vi.fn(async () => '/absolute/dtifx.config.mjs');
    const loadConfig = vi.fn(async () => ({
      path: '/absolute/dtifx.config.mjs',
      directory: '/project',
      config: { audit: { policies: [] } },
    }));
    const environment = await prepareAuditEnvironment(options, io, documentCache, tokenCache, {
      createTokenEnvironment: createTokenEnvironmentMock,
      resolveConfigPath,
      loadConfig,
    });

    expect(loadAuditModuleMock).not.toHaveBeenCalled();
    expect(environment).toBeDefined();

    expect(createTokenEnvironmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        logger: expect.any(JsonLineLoggerMock),
        telemetry: telemetryRuntime,
        configuration: {
          path: '/absolute/dtifx.config.mjs',
          directory: '/project',
          config: { audit: { policies: [] } },
        },
        documentCache,
        tokenCache,
      }),
    );
    expect(environment.logger).toBeInstanceOf(JsonLineLoggerMock);
    expect(environment.telemetry).toBe(telemetryRuntime);
    expect(environment.policyConfiguration).toBe(policyConfiguration);
    expect(environment.tokens).toBe(tokens);

    environment.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);

    expect(resolveConfigPath).toHaveBeenCalledWith({ configPath: options.config });
    expect(loadConfig).toHaveBeenCalledWith({ path: '/absolute/dtifx.config.mjs' });

    expect(createTelemetryRuntimeMock).toHaveBeenCalledWith(
      'stdout',
      expect.objectContaining({
        logger: expect.any(JsonLineLoggerMock),
      }),
    );
  });

  it('uses the default token environment when not overridden', async () => {
    const policyConfiguration = { definitions: [] } as const;
    const tokens = { resolve: vi.fn() } as const;
    auditModule.createAuditTokenResolutionEnvironment.mockResolvedValue({
      tokens,
      policyConfiguration,
      dispose: vi.fn(),
    });

    const options = {
      config: 'dtifx.config.mjs',
      reporter: 'human',
      jsonLogs: false,
      timings: false,
    } as const;
    const io = createMemoryCliIo();

    const environment = await prepareAuditEnvironment(options, io);

    expect(loadAuditModuleMock).toHaveBeenCalledWith({ io });
    expect(environment).toBeDefined();

    expect(auditModule.createAuditTokenResolutionEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: {
          path: '/resolved/dtifx.config.mjs',
          directory: '/workspace',
          config: { audit: { policies: [] } },
        },
      }),
    );
    expect(auditModule.resolveAuditConfigPath).toHaveBeenCalledWith({ configPath: options.config });
    expect(auditModule.loadAuditConfiguration).toHaveBeenCalledWith({
      path: '/resolved/dtifx.config.mjs',
    });
    expect(environment?.policyConfiguration).toEqual(policyConfiguration);
    expect(environment?.tokens).toBe(tokens);
  });

  it('returns undefined when the audit module cannot be loaded', async () => {
    loadAuditModuleMock.mockImplementationOnce(async ({ io: commandIo }) => {
      commandIo.writeErr('Please install @dtifx/audit.\n');
      return;
    });

    const options = {
      reporter: 'human',
      jsonLogs: false,
      timings: false,
    } as const;
    const io = createMemoryCliIo();

    const environment = await prepareAuditEnvironment(options, io);

    expect(environment).toBeUndefined();
    expect(io.stderrBuffer).toContain('Please install @dtifx/audit');
  });
});

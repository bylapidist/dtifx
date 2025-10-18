import type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';
import type {
  AuditTelemetryRuntime,
  AuditTokenResolutionPort,
  PolicyConfigurationResult,
} from '@dtifx/audit';
import { JsonLineLogger, noopLogger, type StructuredLogger } from '@dtifx/core/logging';
import { formatDurationMs } from '@dtifx/core/reporting';
import { createTelemetryRuntime, type TelemetryRuntime } from '@dtifx/core/telemetry';

import type { CliIo } from '../../io/cli-io.js';
import { isInteractiveStream } from '../../utils/streams.js';
import { loadAuditModule, type AuditModule, type LoadAuditModule } from './audit-module-loader.js';
import type { AuditCliOptions } from './options.js';

export interface PreparedAuditEnvironment {
  readonly logger: StructuredLogger;
  readonly telemetry: TelemetryRuntime;
  readonly policyConfiguration: PolicyConfigurationResult;
  readonly tokens: AuditTokenResolutionPort;
  dispose(): void;
}

export interface PrepareAuditEnvironmentDependencies {
  readonly auditModule?: AuditModule;
  readonly loadAuditModule?: LoadAuditModule;
  readonly createTokenEnvironment?: AuditModule['createAuditTokenResolutionEnvironment'];
  readonly resolveConfigPath?: AuditModule['resolveAuditConfigPath'];
  readonly loadConfig?: AuditModule['loadAuditConfiguration'];
}

export const prepareAuditEnvironment = async (
  options: AuditCliOptions,
  io: CliIo,
  documentCache?: DocumentCache,
  tokenCache?: TokenCache,
  dependencies: PrepareAuditEnvironmentDependencies = {},
): Promise<PreparedAuditEnvironment | undefined> => {
  const auditModule = await resolveAuditModule(io, dependencies);
  const createTokenEnvironment =
    dependencies.createTokenEnvironment ?? auditModule?.createAuditTokenResolutionEnvironment;
  const resolveConfigPath = dependencies.resolveConfigPath ?? auditModule?.resolveAuditConfigPath;
  const loadConfig = dependencies.loadConfig ?? auditModule?.loadAuditConfiguration;

  if (!createTokenEnvironment || !resolveConfigPath || !loadConfig) {
    return undefined;
  }

  const logger = createLogger(options.jsonLogs, io);
  const telemetry = createTelemetryRuntime(options.telemetry ?? 'none', {
    logger,
  });
  const resolvedConfigPath = await resolveConfigPath(
    options.config ? { configPath: options.config } : {},
  );
  const loadedConfig = await loadConfig({ path: resolvedConfigPath });
  const tokenEnvironment = await createTokenEnvironment({
    telemetry: telemetry as AuditTelemetryRuntime,
    logger,
    configuration: loadedConfig,
    ...(documentCache ? { documentCache } : {}),
    ...(tokenCache ? { tokenCache } : {}),
  });

  return {
    logger,
    telemetry,
    policyConfiguration: tokenEnvironment.policyConfiguration,
    tokens: tokenEnvironment.tokens,
    dispose() {
      tokenEnvironment.dispose();
    },
  } satisfies PreparedAuditEnvironment;
};

const createLogger = (jsonLogs: boolean, io: CliIo): StructuredLogger => {
  if (jsonLogs) {
    return new JsonLineLogger(io.stdout);
  }

  if (isInteractiveStream(io.stderr)) {
    return {
      log(entry) {
        const elapsed = entry.elapsedMs ? ` (${formatDurationMs(entry.elapsedMs)})` : '';
        const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
        io.writeErr(`[${entry.level}] ${entry.event}${elapsed}${data}\n`);
      },
    } satisfies StructuredLogger;
  }

  return noopLogger;
};

const resolveAuditModule = async (
  io: CliIo,
  dependencies: PrepareAuditEnvironmentDependencies,
): Promise<AuditModule | undefined> => {
  if (dependencies.auditModule) {
    return dependencies.auditModule;
  }

  if (
    dependencies.createTokenEnvironment &&
    dependencies.resolveConfigPath &&
    dependencies.loadConfig
  ) {
    return undefined;
  }

  const loader = dependencies.loadAuditModule ?? loadAuditModule;
  return loader({ io });
};

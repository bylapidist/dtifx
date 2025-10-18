import type { DocumentCache, TokenCache } from '@lapidist/dtif-parser';
import type { LoadedBuildConfiguration, StructuredLogger, TelemetryRuntime } from '@dtifx/build';

import type { CliIo } from '../../io/cli-io.js';
import { isInteractiveStream } from '../../utils/streams.js';
import type { BuildGlobalOptions } from './options.js';
import { loadBuildModule, loadBuildReporterModule } from './build-module.js';

type BuildModule = NonNullable<Awaited<ReturnType<typeof loadBuildModule>>>;
type BuildReporterModule = NonNullable<Awaited<ReturnType<typeof loadBuildReporterModule>>>;
type DefaultBuildEnvironmentResult = ReturnType<BuildModule['createDefaultBuildEnvironment']>;

export interface PreparedBuildEnvironment {
  readonly loaded: LoadedBuildConfiguration;
  readonly logger: StructuredLogger;
  readonly telemetry: TelemetryRuntime;
  readonly documentCache: DocumentCache;
  readonly tokenCache: TokenCache;
  readonly services: DefaultBuildEnvironmentResult['services'];
  readonly policyConfiguration: DefaultBuildEnvironmentResult['policyConfiguration'];
  dispose(): void;
}

export interface PrepareBuildEnvironmentDependencies {
  readonly build?: Awaited<ReturnType<typeof loadBuildModule>>;
  readonly reporters?: Awaited<ReturnType<typeof loadBuildReporterModule>>;
}

export const prepareBuildEnvironment = async (
  options: BuildGlobalOptions,
  io: CliIo,
  documentCache?: DocumentCache,
  tokenCache?: TokenCache,
  dependencies?: PrepareBuildEnvironmentDependencies,
): Promise<PreparedBuildEnvironment | undefined> => {
  const build = dependencies?.build ?? (await loadBuildModule(io));
  if (!build) {
    return undefined;
  }

  const reporters = dependencies?.reporters ?? (await loadBuildReporterModule(io));
  if (!reporters) {
    return undefined;
  }

  const configPath = await build.resolveConfigPath(
    options.config ? { configPath: options.config } : {},
  );
  const loaded = await build.loadConfig(configPath);
  const logger = createLogger(options.jsonLogs, io, build, reporters);
  const telemetry = build.createTelemetryRuntime(options.telemetry ?? 'none', {
    logger,
  });
  const formatterRegistry = await build.loadFormatterDefinitionRegistry({
    config: loaded.config,
    configDirectory: loaded.directory,
    configPath: loaded.path,
  });
  const transformRegistry = await build.loadTransformDefinitionRegistry({
    config: loaded.config,
    configDirectory: loaded.directory,
    configPath: loaded.path,
  });
  const dependencyRegistry = await build.loadDependencyStrategyRegistry({
    config: loaded.config,
    configDirectory: loaded.directory,
    configPath: loaded.path,
  });
  const policyRegistry = await build.loadPolicyRuleRegistry({
    config: loaded.config,
    configDirectory: loaded.directory,
    configPath: loaded.path,
  });
  const runtime = build.createDefaultBuildEnvironment(
    {
      config: loaded.config,
      configDirectory: loaded.directory,
      configPath: loaded.path,
    },
    {
      logger,
      ...(options.outDir ? { defaultOutDir: options.outDir } : {}),
      ...(documentCache ? { documentCache } : {}),
      ...(tokenCache ? { tokenCache } : {}),
      runtime: { flatten: true, includeGraphs: true },
      formatters: { definitionRegistry: formatterRegistry },
      transform: { definitionRegistry: transformRegistry },
      dependencies: { registry: dependencyRegistry },
      policies: { ruleRegistry: policyRegistry },
    },
  );

  const subscriptions = [
    runtime.services.eventBus.subscribe(build.createBuildStageLoggingSubscriber(logger)),
  ];

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
    loaded,
    logger,
    telemetry,
    documentCache: runtime.documentCache,
    tokenCache: runtime.tokenCache,
    services: runtime.services,
    policyConfiguration: runtime.policyConfiguration,
    dispose,
  } satisfies PreparedBuildEnvironment;
};

const createLogger = (
  jsonLogs: boolean,
  io: CliIo,
  build: BuildModule,
  reporters: BuildReporterModule,
): StructuredLogger => {
  if (jsonLogs) {
    return new build.JsonLineLogger(io.stdout);
  }

  if (isInteractiveStream(io.stderr)) {
    return {
      log(entry: Parameters<StructuredLogger['log']>[0]) {
        const elapsed = entry.elapsedMs ? ` (${reporters.formatDurationMs(entry.elapsedMs)})` : '';
        const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
        io.writeErr(`[${entry.level}] ${entry.event}${elapsed}${data}\n`);
      },
    } satisfies StructuredLogger;
  }

  return build.noopLogger;
};

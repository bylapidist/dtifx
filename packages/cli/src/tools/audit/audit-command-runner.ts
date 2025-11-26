import process from 'node:process';

import type { Command } from 'commander';

import type { CliIo } from '../../io/cli-io.js';
import { prepareAuditEnvironment, type PreparedAuditEnvironment } from './environment.js';
import { resolveAuditCliOptions } from './options.js';
import { loadAuditModule, type AuditModule, type LoadAuditModule } from './audit-module-loader.js';

export interface ExecuteAuditCommandOptions {
  readonly command: Command;
  readonly io: CliIo;
  readonly dependencies?: ExecuteAuditCommandDependencies;
}

export interface ExecuteAuditCommandDependencies {
  readonly loadAuditModule?: LoadAuditModule;
  readonly auditModule?: AuditModule;
}

export const executeAuditCommand = async ({
  command,
  io,
  dependencies = {},
}: ExecuteAuditCommandOptions): Promise<void> => {
  const options = resolveAuditCliOptions(command);
  let environment: PreparedAuditEnvironment | undefined;
  let telemetry: PreparedAuditEnvironment['telemetry'] | undefined;
  let disposedEnvironment = false;

  const disposeEnvironment = () => {
    if (!disposedEnvironment && environment) {
      environment.dispose();
      disposedEnvironment = true;
    }
  };

  try {
    const auditModule = await resolveAuditModule(io, dependencies);
    if (!auditModule) {
      process.exitCode = 1;
      return;
    }

    environment = await prepareAuditEnvironment(options, io, undefined, undefined, {
      auditModule,
    });

    telemetry = environment?.telemetry;

    if (!environment) {
      process.exitCode = 1;
      return;
    }

    const reporter = auditModule.createAuditReporter({
      format: options.reporter,
      logger: environment.logger,
      includeTimings: options.timings,
      stdout: { write: (line: string) => io.writeOut(line) },
      stderr: { write: (line: string) => io.writeErr(line) },
      cwd: process.cwd(),
    });

    const runtime = auditModule.createAuditRuntime({
      configuration: environment.policyConfiguration,
      reporter,
      telemetry: environment.telemetry,
      spanName: 'dtifx.cli.audit',
      tokens: environment.tokens,
      dispose: disposeEnvironment,
    });

    const result = await runtime.run();
    if (result.summary.severity.error > 0) {
      process.exitCode = 1;
    }
  } catch {
    process.exitCode = 1;
  } finally {
    disposeEnvironment();
    await telemetry?.exportSpans();
  }
};

const resolveAuditModule = async (
  io: CliIo,
  dependencies: ExecuteAuditCommandDependencies,
): Promise<AuditModule | undefined> => {
  if (dependencies.auditModule) {
    return dependencies.auditModule;
  }

  const loader = dependencies.loadAuditModule ?? loadAuditModule;
  return loader({ io });
};

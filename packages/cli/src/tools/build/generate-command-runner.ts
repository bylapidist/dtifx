import process from 'node:process';

import type { Command } from 'commander';
import type { CliIo } from '../../io/cli-io.js';
import { resolveBuildGlobalOptions } from './options.js';
import { prepareBuildEnvironment } from './environment.js';
import { loadBuildModule, loadBuildReporterModule } from './build-module.js';

interface ExecuteBuildGenerateCommandOptions {
  readonly command: Command;
  readonly io: CliIo;
}

type BuildModule = NonNullable<Awaited<ReturnType<typeof loadBuildModule>>>;

export const executeBuildGenerateCommand = async ({
  command,
  io,
}: ExecuteBuildGenerateCommandOptions): Promise<void> => {
  const options = resolveBuildGlobalOptions(command);
  const build = await loadBuildModule(io);
  if (!build) {
    process.exitCode = 1;
    return;
  }

  const reporters = await loadBuildReporterModule(io);
  if (!reporters) {
    process.exitCode = 1;
    return;
  }

  const environment = await prepareBuildEnvironment(options, io, undefined, undefined, {
    build,
    reporters,
  });
  if (!environment) {
    process.exitCode = 1;
    return;
  }
  const reporter = reporters.createReporter({
    format: options.reporter ?? 'human',
    logger: environment.logger,
    includeTimings: options.timings,
    stdout: { write: (line: string) => io.writeOut(line) },
    stderr: { write: (line: string) => io.writeErr(line) },
    cwd: process.cwd(),
  });

  const span = environment.telemetry.tracer.startSpan('dtifx.cli.generate', {
    attributes: { reporter: reporter.format },
  });
  const telemetrySubscription = environment.services.eventBus.subscribe(
    build.createBuildStageTelemetryEventSubscriber({ getSpan: () => span }),
  );

  try {
    const result = await build.executeBuild(
      environment.services,
      environment.loaded.config,
      environment.telemetry.tracer,
      { parentSpan: span },
    );
    reporter.buildSuccess({
      result,
      writtenArtifacts: result.writtenArtifacts,
      reason: 'generate',
    });
    const artifactCount = countWrittenArtifacts(result);
    span.end({
      attributes: {
        tokenCount: result.metrics.totalCount,
        typedTokenCount: result.metrics.typedCount,
        formatterCount: result.formatters.length,
        artifactCount,
      },
    });
  } catch (error) {
    span.end({ status: 'error' });
    reporter.buildFailure(error);
    process.exitCode = 1;
  } finally {
    telemetrySubscription.unsubscribe();
    environment.dispose();
    await environment.telemetry.exportSpans();
  }
};

const countWrittenArtifacts = (
  result: Awaited<ReturnType<BuildModule['executeBuild']>>,
): number => {
  let total = 0;
  for (const artifacts of result.writtenArtifacts.values()) {
    total += artifacts.length;
  }
  return total;
};

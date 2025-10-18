import { performance } from 'node:perf_hooks';
import process from 'node:process';

import type { Command } from 'commander';
import type { TelemetrySpan } from '@dtifx/build';

import type { CliIo } from '../../io/cli-io.js';
import { resolveBuildGlobalOptions } from './options.js';
import { prepareBuildEnvironment, type PreparedBuildEnvironment } from './environment.js';
import { loadBuildModule, loadBuildReporterModule } from './build-module.js';

type BuildReporterModule = NonNullable<Awaited<ReturnType<typeof loadBuildReporterModule>>>;
type Reporter = ReturnType<BuildReporterModule['createReporter']>;

export interface ExecuteBuildValidateCommandOptions {
  readonly command: Command;
  readonly io: CliIo;
}

export const executeBuildValidateCommand = async ({
  command,
  io,
}: ExecuteBuildValidateCommandOptions): Promise<void> => {
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

  const span = environment.telemetry.tracer.startSpan('dtifx.cli.validate', {
    attributes: { reporter: reporter.format },
  });
  const telemetrySubscription = environment.services.eventBus.subscribe(
    build.createBuildStageTelemetryEventSubscriber({ getSpan: () => span }),
  );

  try {
    await runValidation(environment, reporter, span);
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

const runValidation = async (
  environment: PreparedBuildEnvironment,
  reporter: Reporter,
  span: TelemetrySpan,
): Promise<void> => {
  const planSpan = span.startChild('dtifx.pipeline.plan');
  const planStart = performance.now();

  try {
    const plan = await environment.services.planner.plan();
    const planMs = performance.now() - planStart;
    planSpan.end({ attributes: { entryCount: plan.entries.length, durationMs: planMs } });
    reporter.validateSuccess(plan);
    span.end({ attributes: { entryCount: plan.entries.length, planMs } });
  } catch (error) {
    planSpan.end({ status: 'error' });
    throw error;
  }
};

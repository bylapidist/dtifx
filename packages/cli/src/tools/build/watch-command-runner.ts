import process from 'node:process';

import type { Command } from 'commander';

import type { CliIo } from '../../io/cli-io.js';
import { resolveBuildGlobalOptions } from './options.js';
import { prepareBuildEnvironment } from './environment.js';
import { loadBuildModule, loadBuildReporterModule } from './build-module.js';

export interface ExecuteBuildWatchCommandOptions {
  readonly command: Command;
  readonly io: CliIo;
}

export const executeBuildWatchCommand = async ({
  command,
  io,
}: ExecuteBuildWatchCommandOptions): Promise<void> => {
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

  const configPath = await build.resolveConfigPath(
    options.config ? { configPath: options.config } : {},
  );
  const reporterFormat = options.reporter ?? 'human';
  const includeTimings = options.timings;

  await build.startWatchPipeline({
    configPath,
    watcher: new build.ChokidarWatcher(),
    scheduler: new build.SequentialTaskScheduler(),
    environmentFactory: async (request) => {
      const environment = await prepareBuildEnvironment(
        { ...options, config: request.configPath },
        io,
        request.documentCache,
        request.tokenCache,
        { build, reporters },
      );
      return environment!;
    },
    initialReason: 'initial build',
    createReporter: (environment) =>
      reporters.createReporter({
        format: reporterFormat,
        logger: environment.logger,
        includeTimings,
        stdout: { write: (line: string) => io.writeOut(line) },
        stderr: { write: (line: string) => io.writeErr(line) },
        cwd: process.cwd(),
      }),
  });
};

import { Option, type Command } from 'commander';

import type { ReporterFormat } from '@dtifx/build/cli/reporters';
import type { TelemetryMode } from '@dtifx/build';

export interface BuildGlobalOptions {
  readonly config?: string;
  readonly outDir?: string;
  readonly jsonLogs: boolean;
  readonly reporter?: ReporterFormat;
  readonly telemetry?: TelemetryMode;
  readonly timings: boolean;
}

export const registerBuildGlobalOptions = (command: Command): void => {
  const reporterOption = new Option(
    '--reporter <format>',
    'Output reporter format for CLI commands',
  )
    .choices(['human', 'json', 'markdown', 'html'])
    .default('human');

  const telemetryOption = new Option(
    '--telemetry <mode>',
    'Telemetry exporter to use for CLI commands',
  )
    .choices(['none', 'stdout'])
    .default('none');

  command
    .option('-c, --config <path>', 'Path to the dtifx-build configuration file')
    .option('--out-dir <path>', 'Fallback output directory for formatter artifacts', 'dist')
    .option('--json-logs', 'Emit NDJSON structured logs', false)
    .option('--timings', 'Print build stage timing breakdowns', false)
    .addOption(reporterOption)
    .addOption(telemetryOption);
};

const isTelemetryMode = (value: unknown): value is TelemetryMode =>
  value === 'none' || value === 'stdout';

export const resolveBuildGlobalOptions = (command: Command): BuildGlobalOptions => {
  const localOptions = command.opts<Record<string, unknown>>();
  const parentOptions = command.parent?.optsWithGlobals<Record<string, unknown>>() ?? {};
  const readOption = <T>(key: string): T | undefined => {
    const localValue = localOptions[key];
    if (localValue !== undefined) {
      return localValue as T;
    }
    if (Object.prototype.hasOwnProperty.call(parentOptions, key)) {
      return parentOptions[key] as T;
    }
    return undefined;
  };
  const telemetryOption = readOption<unknown>('telemetry');
  const telemetry = isTelemetryMode(telemetryOption) ? telemetryOption : undefined;
  const jsonLogs = readOption<boolean>('jsonLogs') ?? false;
  const timings = readOption<boolean>('timings') ?? false;
  const config = readOption<string>('config');
  const outDir = readOption<string>('outDir');
  const reporter = readOption<ReporterFormat>('reporter');
  return {
    jsonLogs,
    timings,
    ...(config === undefined ? {} : { config }),
    ...(outDir === undefined ? {} : { outDir }),
    ...(reporter === undefined ? {} : { reporter }),
    ...(telemetry === undefined ? {} : { telemetry }),
  } satisfies BuildGlobalOptions;
};

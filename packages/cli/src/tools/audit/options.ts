import { Option, type Command } from 'commander';

import type { AuditReporterFormat } from '@dtifx/audit';

export type AuditTelemetryMode = 'none' | 'stdout';

export interface AuditCliOptions {
  readonly config?: string;
  readonly outDir?: string;
  readonly jsonLogs: boolean;
  readonly reporter: AuditReporterFormat | readonly AuditReporterFormat[];
  readonly telemetry?: AuditTelemetryMode;
  readonly timings: boolean;
}

export const registerAuditCliOptions = (command: Command): void => {
  const reporterOption = new Option(
    '--reporter <format>',
    'Output reporter format for audit commands',
  )
    .choices(['human', 'json', 'markdown', 'html'])
    .argParser((value: string, previous?: unknown): readonly AuditReporterFormat[] => {
      const format = value as AuditReporterFormat;
      const accumulator: AuditReporterFormat[] = [];

      if (Array.isArray(previous)) {
        accumulator.push(...previous);
      } else if (typeof previous === 'string') {
        accumulator.push(previous as AuditReporterFormat);
      }

      if (!accumulator.includes(format)) {
        accumulator.push(format);
      }

      return accumulator;
    });

  const telemetryOption = new Option(
    '--telemetry <mode>',
    'Telemetry exporter to use for audit commands',
  )
    .choices(['none', 'stdout'])
    .default('none');

  command
    .option('-c, --config <path>', 'Path to the dtifx configuration file')
    .option('--out-dir <path>', 'Fallback output directory for formatter artifacts', 'dist')
    .option('--json-logs', 'Emit NDJSON structured logs', false)
    .option('--timings', 'Print audit stage timing breakdowns', false)
    .addOption(reporterOption)
    .addOption(telemetryOption);
};

const isAuditTelemetryMode = (value: unknown): value is AuditTelemetryMode =>
  value === 'none' || value === 'stdout';

export const resolveAuditCliOptions = (command: Command): AuditCliOptions => {
  const localOptions = command.opts<Record<string, unknown>>();
  const parentCommand = command.parent ?? undefined;
  const parentOptions = parentCommand?.optsWithGlobals<Record<string, unknown>>() ?? {};
  const getOptionValueSource = (
    target: Command | null | undefined,
    key: string,
  ): string | undefined => {
    if (!target) {
      return undefined;
    }
    const sourceAccessor = (
      target as Command & { getOptionValueSource?: (optionKey: string) => string | undefined }
    ).getOptionValueSource;
    return typeof sourceAccessor === 'function' ? sourceAccessor.call(target, key) : undefined;
  };
  const getOptionValue = (target: Command | null | undefined, key: string): unknown => {
    if (!target) {
      return undefined;
    }
    const accessor = (target as Command & { getOptionValue?: (optionKey: string) => unknown })
      .getOptionValue;
    return typeof accessor === 'function' ? accessor.call(target, key) : undefined;
  };
  const readOption = <T>(key: string): T | undefined => {
    const localValueRaw = getOptionValue(command, key);
    const localValue = (localValueRaw ?? localOptions[key]) as T | undefined;
    const localSource = getOptionValueSource(command, key);
    if (localSource && localSource !== 'default') {
      return localValue;
    }

    const parentValueRaw = getOptionValue(parentCommand, key);
    const parentValue = (parentValueRaw ?? parentOptions[key]) as T | undefined;
    const parentSource = getOptionValueSource(parentCommand, key);
    if (parentSource && parentSource !== 'default') {
      return parentValue;
    }

    if (parentValue !== undefined && (localValue === undefined || localSource === 'default')) {
      return parentValue;
    }

    return localValue;
  };

  const telemetryOption = readOption<unknown>('telemetry');
  const telemetry = isAuditTelemetryMode(telemetryOption) ? telemetryOption : undefined;
  const jsonLogs = readOption<boolean>('jsonLogs') ?? false;
  const timings = readOption<boolean>('timings') ?? false;
  const config = readOption<string>('config');
  const outDir = readOption<string>('outDir');
  const reporterValue = readOption<unknown>('reporter');
  const reporter = normaliseReporterOption(reporterValue);
  return {
    jsonLogs,
    timings,
    ...(config === undefined ? {} : { config }),
    ...(outDir === undefined ? {} : { outDir }),
    reporter: reporter ?? 'human',
    ...(telemetry === undefined ? {} : { telemetry }),
  } satisfies AuditCliOptions;
};

const normaliseReporterOption = (
  value: unknown,
): AuditReporterFormat | readonly AuditReporterFormat[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const formats = value.filter((candidate): candidate is AuditReporterFormat =>
      isAuditReporterFormat(candidate),
    );
    if (formats.length === 0) {
      return undefined;
    }
    if (formats.length === 1) {
      return formats[0];
    }
    const deduped: AuditReporterFormat[] = [];
    for (const format of formats) {
      if (!deduped.includes(format)) {
        deduped.push(format);
      }
    }
    return deduped;
  }

  if (isAuditReporterFormat(value)) {
    return value;
  }

  return undefined;
};

const isAuditReporterFormat = (value: unknown): value is AuditReporterFormat =>
  value === 'human' || value === 'json' || value === 'markdown' || value === 'html';

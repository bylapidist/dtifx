import { InvalidOptionArgumentError, type Command } from 'commander';

import type { CliGlobalOptions, TelemetryPreference } from '../../kernel/types.js';

const TELEMETRY_HELP = 'Control telemetry usage (auto, on, off).';
const JSON_LOGS_HELP = 'Emit machine-readable JSON logs.';

export const defaultGlobalOptions: CliGlobalOptions = Object.freeze({
  telemetry: 'auto',
  logFormat: 'pretty',
} as const);

export const createDefaultGlobalOptions = (): CliGlobalOptions => ({
  telemetry: defaultGlobalOptions.telemetry,
  logFormat: defaultGlobalOptions.logFormat,
});

export const registerGlobalOptions = (program: Command): void => {
  program
    .option(
      '--telemetry <mode>',
      TELEMETRY_HELP,
      parseTelemetryOption,
      defaultGlobalOptions.telemetry,
    )
    .option('--json-logs', JSON_LOGS_HELP, false);
};

export const readGlobalOptions = (program: Command): CliGlobalOptions => {
  const options = program.optsWithGlobals() as {
    telemetry?: TelemetryPreference;
    jsonLogs?: boolean;
  };

  return {
    telemetry: options.telemetry ?? defaultGlobalOptions.telemetry,
    logFormat: options.jsonLogs ? 'json' : 'pretty',
  };
};

const parseTelemetryOption = (value: string): TelemetryPreference => {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'auto') {
    return 'auto';
  }

  if (normalized === 'on' || normalized === 'enable' || normalized === 'enabled') {
    return 'enabled';
  }

  if (normalized === 'off' || normalized === 'disable' || normalized === 'disabled') {
    return 'disabled';
  }

  throw new InvalidOptionArgumentError(
    `Invalid telemetry mode \"${value}\". Expected one of: auto, on, off.`,
  );
};

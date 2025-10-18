import type { Command } from 'commander';

import type { CliIo } from '../io/cli-io.js';

export type TelemetryPreference = 'auto' | 'enabled' | 'disabled';
export type CliLogFormat = 'pretty' | 'json';

export interface CliGlobalOptions {
  readonly telemetry: TelemetryPreference;
  readonly logFormat: CliLogFormat;
}

export interface CliKernelOptions {
  readonly programName: string;
  readonly version: string;
  readonly description?: string | undefined;
  readonly io?: CliIo | undefined;
}

export interface CliKernelContext {
  readonly io: CliIo;
  readonly getGlobalOptions: () => CliGlobalOptions;
}

export interface CliCommandModule {
  readonly id: string;
  register(command: Command, context: CliKernelContext): void;
}

export interface CliKernel {
  register(module: CliCommandModule): CliKernel;
  run(argv?: readonly string[]): Promise<number>;
}

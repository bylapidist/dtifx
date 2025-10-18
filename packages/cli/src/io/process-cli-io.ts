import process from 'node:process';

import type { CliIo } from './cli-io.js';

export interface ProcessCliIoOptions {
  readonly process?: NodeJS.Process;
}

export const createProcessCliIo = (options: ProcessCliIoOptions = {}): CliIo => {
  const target = options.process ?? process;

  return {
    stdin: target.stdin,
    stdout: target.stdout,
    stderr: target.stderr,
    writeOut: (chunk: string) => {
      target.stdout.write(chunk);
    },
    writeErr: (chunk: string) => {
      target.stderr.write(chunk);
    },
    exit: (code: number): never => {
      const nonZeroExitCode =
        target.exitCode !== undefined && target.exitCode !== 0 ? target.exitCode : undefined;
      const resolvedCode = code === 0 && nonZeroExitCode !== undefined ? nonZeroExitCode : code;
      return target.exit(resolvedCode);
    },
  };
};

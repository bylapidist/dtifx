import { PassThrough } from 'node:stream';

import type { CliIo } from '../io/cli-io.js';

export interface MemoryCliIo extends CliIo {
  readonly stdoutBuffer: string;
  readonly stderrBuffer: string;
  readonly exitCodes: readonly number[];
}

export const createMemoryCliIo = (): MemoryCliIo => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const recordedExitCodes: number[] = [];

  return {
    stdin,
    stdout,
    stderr,
    writeOut: (chunk: string) => {
      stdoutChunks.push(chunk);
      stdout.write(chunk);
    },
    writeErr: (chunk: string) => {
      stderrChunks.push(chunk);
      stderr.write(chunk);
    },
    exit: (code: number): never => {
      recordedExitCodes.push(code);
      throw new Error(`process exit called with code ${code}`);
    },
    get stdoutBuffer(): string {
      return stdoutChunks.join('');
    },
    get stderrBuffer(): string {
      return stderrChunks.join('');
    },
    get exitCodes(): readonly number[] {
      return recordedExitCodes;
    },
  };
};

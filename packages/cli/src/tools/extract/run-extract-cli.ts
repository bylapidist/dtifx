import process from 'node:process';

import { createCliKernel } from '../../kernel/cli-kernel.js';
import type { CliIo } from '../../io/cli-io.js';
import type { CliKernel } from '../../kernel/types.js';
import { extractCommandModule } from './extract-command-module.js';

export interface CreateExtractCliKernelOptions {
  readonly programName: string;
  readonly version: string;
  readonly description?: string | undefined;
  readonly io?: CliIo | undefined;
}

export const createExtractCliKernel = (options: CreateExtractCliKernelOptions): CliKernel => {
  const kernel = createCliKernel(options);
  kernel.register(extractCommandModule);
  return kernel;
};

export interface RunExtractCliOptions extends CreateExtractCliKernelOptions {
  readonly argv?: readonly string[] | undefined;
}

export const runExtractCli = async ({
  argv = process.argv,
  programName,
  version,
  description,
  io,
}: RunExtractCliOptions): Promise<number> => {
  const kernel = createExtractCliKernel({ programName, version, description, io });
  return kernel.run(argv);
};

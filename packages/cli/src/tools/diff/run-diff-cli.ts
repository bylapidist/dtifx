import process from 'node:process';

import { createCliKernel } from '../../kernel/cli-kernel.js';
import type { CliIo } from '../../io/cli-io.js';
import type { CliKernel } from '../../kernel/types.js';
import { diffCommandModule } from './diff-command-module.js';

export interface CreateDiffCliKernelOptions {
  readonly programName: string;
  readonly version: string;
  readonly description?: string | undefined;
  readonly io?: CliIo | undefined;
}

export const createDiffCliKernel = (options: CreateDiffCliKernelOptions): CliKernel => {
  const kernel = createCliKernel(options);
  kernel.register(diffCommandModule);
  return kernel;
};

export interface RunDiffCliOptions extends CreateDiffCliKernelOptions {
  readonly argv?: readonly string[] | undefined;
}

export const runDiffCli = async ({
  argv = process.argv,
  programName,
  version,
  description,
  io,
}: RunDiffCliOptions): Promise<number> => {
  const kernel = createDiffCliKernel({ programName, version, description, io });
  return kernel.run(argv);
};

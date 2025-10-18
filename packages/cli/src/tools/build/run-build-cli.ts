import process from 'node:process';

import { createCliKernel } from '../../kernel/cli-kernel.js';
import type { CliKernel } from '../../kernel/types.js';
import type { CliIo } from '../../io/cli-io.js';
import { buildCommandModule } from './build-command-module.js';

export interface CreateBuildCliKernelOptions {
  readonly programName: string;
  readonly version: string;
  readonly description?: string | undefined;
  readonly io?: CliIo | undefined;
}

export const createBuildCliKernel = (options: CreateBuildCliKernelOptions): CliKernel => {
  const kernel = createCliKernel(options);
  kernel.register(buildCommandModule);
  return kernel;
};

export interface RunBuildCliOptions extends CreateBuildCliKernelOptions {
  readonly argv?: readonly string[] | undefined;
}

export const runBuildCli = async ({
  argv = process.argv,
  programName,
  version,
  description,
  io,
}: RunBuildCliOptions): Promise<number> => {
  const kernel = createBuildCliKernel({ programName, version, description, io });
  return kernel.run(argv);
};

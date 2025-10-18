import process from 'node:process';

import { createCliKernel } from '../../kernel/cli-kernel.js';
import type { CliKernel } from '../../kernel/types.js';
import type { CliIo } from '../../io/cli-io.js';
import { auditCommandModule } from './audit-command-module.js';

export interface CreateAuditCliKernelOptions {
  readonly programName: string;
  readonly version: string;
  readonly description?: string | undefined;
  readonly io?: CliIo | undefined;
}

export const createAuditCliKernel = (options: CreateAuditCliKernelOptions): CliKernel => {
  const kernel = createCliKernel(options);
  kernel.register(auditCommandModule);
  return kernel;
};

export interface RunAuditCliOptions extends CreateAuditCliKernelOptions {
  readonly argv?: readonly string[] | undefined;
}

export const runAuditCli = async ({
  argv = process.argv,
  programName,
  version,
  description,
  io,
}: RunAuditCliOptions): Promise<number> => {
  const kernel = createAuditCliKernel({ programName, version, description, io });
  return kernel.run(argv);
};

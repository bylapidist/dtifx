export { createCliKernel } from './kernel/cli-kernel.js';
export type {
  CliCommandModule,
  CliKernel,
  CliKernelContext,
  CliKernelOptions,
  CliGlobalOptions,
  TelemetryPreference,
  CliLogFormat,
} from './kernel/types.js';
export { createProcessCliIo } from './io/process-cli-io.js';
export type { CliIo } from './io/cli-io.js';
export { diffCommandModule } from './tools/diff/diff-command-module.js';
export { buildCommandModule } from './tools/build/build-command-module.js';
export { auditCommandModule } from './tools/audit/audit-command-module.js';
export { createDiffCliKernel, runDiffCli } from './tools/diff/run-diff-cli.js';
export type { CompareCommandOptions } from './tools/diff/compare-options.js';
export { createBuildCliKernel, runBuildCli } from './tools/build/run-build-cli.js';
export { createAuditCliKernel, runAuditCli } from './tools/audit/run-audit-cli.js';

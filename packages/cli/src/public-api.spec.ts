import { describe, expect, it } from 'vitest';

import * as cli from './index.js';
import { createCliKernel } from './kernel/cli-kernel.js';
import { createProcessCliIo } from './io/process-cli-io.js';
import { auditCommandModule } from './tools/audit/audit-command-module.js';
import { buildCommandModule } from './tools/build/build-command-module.js';
import { extractCommandModule } from './tools/extract/extract-command-module.js';
import { initCommandModule } from './tools/init/init-command-module.js';
import { diffCommandModule } from './tools/diff/diff-command-module.js';
import { createAuditCliKernel, runAuditCli } from './tools/audit/run-audit-cli.js';
import { createBuildCliKernel, runBuildCli } from './tools/build/run-build-cli.js';
import { createDiffCliKernel, runDiffCli } from './tools/diff/run-diff-cli.js';
import { createExtractCliKernel, runExtractCli } from './tools/extract/run-extract-cli.js';

describe('CLI public API surface', () => {
  it('re-exports the primary CLI entry points', () => {
    expect(cli.createCliKernel).toBe(createCliKernel);
    expect(cli.createProcessCliIo).toBe(createProcessCliIo);
    expect(cli.diffCommandModule).toBe(diffCommandModule);
    expect(cli.buildCommandModule).toBe(buildCommandModule);
    expect(cli.auditCommandModule).toBe(auditCommandModule);
    expect(cli.initCommandModule).toBe(initCommandModule);
    expect(cli.extractCommandModule).toBe(extractCommandModule);
    expect(cli.createDiffCliKernel).toBe(createDiffCliKernel);
    expect(cli.runDiffCli).toBe(runDiffCli);
    expect(cli.createBuildCliKernel).toBe(createBuildCliKernel);
    expect(cli.runBuildCli).toBe(runBuildCli);
    expect(cli.createAuditCliKernel).toBe(createAuditCliKernel);
    expect(cli.runAuditCli).toBe(runAuditCli);
    expect(cli.createExtractCliKernel).toBe(createExtractCliKernel);
    expect(cli.runExtractCli).toBe(runExtractCli);
  });
});

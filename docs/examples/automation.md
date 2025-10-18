---
title: Automation example
description: Combine build, diff, and audit APIs in a custom release script.
outline: deep
---

# Automation example

This example ties together the build, diff, and audit runtimes to validate a release candidate
before publishing artefacts.

```ts
// scripts/release-check.ts
import { createDefaultBuildEnvironment, executeBuild, loadConfig } from '@dtifx/build';
import {
  createRunContext,
  createSessionTokenSourcePort,
  renderReport,
  runDiffSession,
} from '@dtifx/diff';
import {
  createAuditReporter,
  createAuditRuntime,
  createAuditTokenResolutionEnvironment,
  loadAuditConfiguration,
  resolveAuditConfigPath,
  type AuditTelemetryRuntime,
} from '@dtifx/audit';
import { JsonLineLogger } from '@dtifx/core/logging';
import { createTelemetryRuntime } from '@dtifx/core/telemetry';

async function main(): Promise<void> {
  // 1. Run the build pipeline to ensure transforms and formatters succeed.
  const loadedBuild = await loadConfig('./dtifx.config.mjs');
  const buildEnvironment = createDefaultBuildEnvironment(
    {
      config: loadedBuild.config,
      configDirectory: loadedBuild.directory,
      configPath: loadedBuild.path,
    },
    { defaultOutDir: 'dist' },
  );
  const telemetry = createTelemetryRuntime('stdout');
  try {
    const buildResult = await executeBuild(
      buildEnvironment.services,
      loadedBuild.config,
      telemetry.tracer,
      { parentSpan: telemetry.tracer.startSpan('release.build') },
    );
    console.log(`Generated ${buildResult.formatters.length} formatter batches.`);

    // 2. Diff the proposed release against the last published snapshot.
    const diffSession = await runDiffSession(
      {
        tokenSource: createSessionTokenSourcePort({
          previous: { kind: 'file', target: 'snapshots/published.json' },
          next: { kind: 'file', target: 'snapshots/candidate.json' },
        }),
      },
      {
        failure: { failOnBreaking: true },
      },
    );
    const diffReport = await renderReport(diffSession.filteredDiff, {
      format: 'markdown',
      mode: 'summary',
      runContext: createRunContext({
        sources: {
          previous: { kind: 'file', target: 'snapshots/published.json' },
          next: { kind: 'file', target: 'snapshots/candidate.json' },
        },
        startedAt: new Date(),
        durationMs: 0,
      }),
    });
    console.log(diffReport);
    if (diffSession.failure.shouldFail) {
      throw new Error('Blocking change detected by diff policy.');
    }

    // 3. Run governance policies using the same configuration.
    const auditConfigPath = await resolveAuditConfigPath();
    const loadedAudit = await loadAuditConfiguration({ path: auditConfigPath });
    const logger = new JsonLineLogger(process.stderr);
    const auditEnvironment = await createAuditTokenResolutionEnvironment({
      configuration: loadedAudit,
      telemetry: telemetry as AuditTelemetryRuntime,
      logger,
    });
    const reporter = createAuditReporter({
      format: 'human',
      logger,
      includeTimings: true,
    });
    const auditRuntime = createAuditRuntime({
      configuration: auditEnvironment.policyConfiguration,
      reporter,
      telemetry,
      tokens: auditEnvironment.tokens,
      dispose: () => auditEnvironment.dispose(),
    });
    const auditResult = await auditRuntime.run();
    if (auditResult.summary.severity.error > 0) {
      throw new Error('Audit reported blocking policy violations.');
    }
  } finally {
    await telemetry.exportSpans();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Run the script with `tsx` or `ts-node` to exercise all runtimes before publishing a release. Extend
it with notification hooks, artifact uploads, or change management automation as required.

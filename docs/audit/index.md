---
title: '@dtifx/audit'
description: 'Governance policy evaluation and evidence generation for DTIF programmes.'
---

# `@dtifx/audit`

`@dtifx/audit` empowers teams to automate compliance checks and generate the evidence required to
ship design tokens responsibly. It evaluates governance policies, compiles attestations, and feeds
results to the CLI or custom hosts.

## Key capabilities

- **Policy engines** — Evaluate governance rules against token metadata, runtime telemetry, and
  build outcomes.
- **Evidence generation** — Produce audit trails and partner-ready reports using structured
  artefacts.
- **Workflow automation** — Integrate with CI, incident drills, and playbooks to keep compliance
  continuous.

## CLI workflow

Most teams begin with the [`dtifx audit run`](/guides/audit-governance#cli-usage) command. The CLI
reuses your `dtifx.config.*` build settings to resolve token snapshots, then executes the registered
policies and reporters. Global flags mirror the build tooling (`--config`, `--out-dir`,
`--json-logs`, `--timings`, `--telemetry`) while audit-specific flags control the output format:

- `--reporter <format>` — Repeatable flag that renders `human`, `json`, `markdown`, or `html`
  reports.
- `--telemetry <mode>` — Controls span export behaviour; choose `none` to disable telemetry or
  `stdout` to stream spans for local debugging.

Exit codes are `0` when no error-severity policy violations are detected and `1` when policy
evaluation fails or surfaces blocking findings.

Refer to the [audit governance guide](/guides/audit-governance) for a full walkthrough covering
policy configuration, telemetry, and combining audit runs with build outputs.

## Programmatic usage

Embed the runtime when you need to orchestrate audits alongside bespoke infrastructure. The helpers
exported from `@dtifx/audit` mirror the CLI workflow: load configuration, create token resolution
and reporting environments, then execute the runtime.

```ts
import {
  createAuditReporter,
  createAuditRuntime,
  createAuditTokenResolutionEnvironment,
  loadAuditConfiguration,
  resolveAuditConfigPath,
} from '@dtifx/audit';
import { JsonLineLogger } from '@dtifx/core/logging';
import { createTelemetryRuntime } from '@dtifx/core/telemetry';

const configPath = await resolveAuditConfigPath();
const configuration = await loadAuditConfiguration({ path: configPath });
const telemetry = createTelemetryRuntime('stdout');
const logger = new JsonLineLogger(process.stdout);

const environment = await createAuditTokenResolutionEnvironment({
  configuration,
  telemetry,
  logger,
});

const reporter = createAuditReporter({
  format: ['human', 'json'],
  logger,
  includeTimings: true,
});

const auditRuntime = createAuditRuntime({
  configuration: environment.policyConfiguration,
  reporter,
  telemetry,
  tokens: environment.tokens,
  dispose: () => environment.dispose(),
});

const result = await auditRuntime.run();

if (result.summary.severity.error > 0) {
  throw new Error('Blocking policy violation detected.');
}
```

The `createAuditRuntime` factory resolves tokens, evaluates policies, and reports results through
your configured reporters. Use the optional `dispose` callback to clean up any resources created as
part of the token resolution environment. Telemetry spans are exported automatically once the run
completes, aligning behaviour with the CLI command.

## Resources

- [Audit governance guide](/guides/audit-governance) — Roll out policies, evidence pipelines, and
  incident drills.
- [Audit configuration reference](/reference/audit-config) — Policy manifest schema and
  configuration options.
- [Audit runtime reference](/reference/audit-runtime) — Runtime APIs for scheduling evaluations and
  exporting evidence.

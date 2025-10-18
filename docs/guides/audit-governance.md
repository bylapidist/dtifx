---
title: Audit governance guide
description: Configure and operate DTIFx policy audits.
outline: deep
---

# Audit governance guide

`@dtifx/audit` evaluates policy catalogues against resolved token snapshots. The `dtifx audit run`
command reuses the build configuration to resolve tokens before executing policies and reporters.

## Configuration recap

Audit settings live under the `audit` block of `dtifx.config.*` files:

```ts
export const config = {
  layers: [...],
  sources: [...],
  audit: {
    policies: [
      { name: 'governance.requireOwner' },
      {
        name: 'governance.requireTag',
        options: { tags: ['release-approved'], severity: 'warning' },
      },
    ],
    plugins: [
      '@company/dtifx-policies',
      {
        module: '@company/dtifx-extra-policies',
        register: 'registerPolicies',
        options: { area: 'web' },
      },
    ],
  },
};
```

- `policies` registers policy names with optional options objects. Unknown names trigger validation
  errors.
- `plugins` accepts bare module specifiers or objects containing a `module`, optional `register`
  export name, and optional `options`. Plugin modules receive a context object containing the
  configuration, registry, and config path to register additional policy factories.

Built-in policies cover owner metadata, deprecation replacement, tag enforcement, override
approvals, and WCAG contrast checks. Severity defaults to `error` unless overridden with `warning`
or `info`.

## CLI usage

```bash
dtifx audit run [options]
```

Global options mirror the build CLI (`--config`, `--out-dir`, `--json-logs`, `--timings`,
`--telemetry`). Audit-specific behaviour:

- `--reporter <format>` – Accepts `human`, `json`, `markdown`, or `html`. The option is repeatable;
  all unique formats render when supplied multiple times.
- Reporters stream to stdout and stderr. Capture Markdown or HTML output with shell redirection. The
  `--out-dir` flag exists for parity with build commands but is currently unused by the audit
  runtime.

Exit codes:

- `0` when the run completes without `error`-severity policy violations.
- `1` when policy evaluation throws or when the summary counts at least one `error`.

## Reporter formats

- **Human** – Table-driven console output summarising policy results and timing breakdowns.
- **JSON** – Machine-readable payload with per-policy results, timings, and optional run metadata.
- **Markdown/HTML** – Rich reports suitable for publishing to dashboards or wikis.

When `--timings` is set, reporters include planning, parsing, resolution, dependency, and policy
stages.

## Telemetry

Audit commands instantiate the telemetry runtime from `@dtifx/core` and attach stage subscribers so
spans capture planning and build timings even though formatters are skipped. Use
`--telemetry stdout` to stream spans via the OpenTelemetry console exporter for local inspection.

## Programmatic control

Embed the runtime to integrate audits into bespoke workflows:

```ts
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

const configPath = await resolveAuditConfigPath();
const loaded = await loadAuditConfiguration({ path: configPath });
const telemetry = createTelemetryRuntime('stdout');
const logger = new JsonLineLogger(process.stdout);

const environment = await createAuditTokenResolutionEnvironment({
  configuration: loaded,
  telemetry: telemetry as AuditTelemetryRuntime,
  logger,
});

const reporter = createAuditReporter({
  format: ['human', 'json'],
  logger,
  includeTimings: true,
});

const runtime = createAuditRuntime({
  configuration: environment.policyConfiguration,
  reporter,
  telemetry,
  tokens: environment.tokens,
  dispose: () => environment.dispose(),
});

try {
  const result = await runtime.run();
  if (result.summary.severity.error > 0) {
    throw new Error('Blocking policy violation detected.');
  }
} finally {
  await telemetry.exportSpans();
}
```

The runtime handles token resolution, policy evaluation, and telemetry export. Dispose of token
caches exposed by the token resolution environment when you create them manually.

## Combining with build outputs

The audit runtime reuses the build configuration to resolve tokens via the same `SourcePlanner` and
`TokenResolutionService`. When `@dtifx/build` transforms produce additional context required for
policies, switch to the build-integrated environment via `createBuildTokenResolutionEnvironment`
exported from `@dtifx/audit`. This helper accepts build modules such as
`createDefaultBuildEnvironment` and `executeBuild` so policies run against the same snapshots used
for formatter generation.

---
title: Audit runtime reference
description:
  APIs for loading policy catalogues, resolving tokens, and executing audits programmatically.
outline: deep
---

# Audit runtime reference

`@dtifx/audit` reuses the build infrastructure to resolve tokens and evaluate governance policies.
The API supports standalone audits as well as build-integrated policy checks.

## Configuration loading

```ts
import { resolveAuditConfigPath, loadAuditConfiguration } from '@dtifx/audit';
```

- `resolveAuditConfigPath({ cwd?, configPath? })` searches for `dtifx.config.*` files and returns
  the absolute path, mirroring the shared configuration
  loader.【F:packages/audit/src/application/configuration/config-loader.ts†L1-L86】
- `loadAuditConfiguration({ path })` imports the module, resolves promises or factory exports, and
  returns `{ config, path, directory }` for downstream
  use.【F:packages/audit/src/application/configuration/config-loader.ts†L88-L155】

## Policy registries

```ts
import {
  createDefaultPolicyRuleRegistry,
  createPolicyConfiguration,
  createPolicyRules,
  loadPolicyRuleRegistry,
} from '@dtifx/audit';
```

- `createDefaultPolicyRuleRegistry()` registers the built-in governance policies.
- `loadPolicyRuleRegistry({ config, configDirectory, configPath, plugins })` loads plugin modules
  and augments the registry. Plugin entries may be bare specifiers or objects with `module`,
  optional `register`, and optional `options`
  properties.【F:packages/core/src/policy/configuration/configuration.ts†L382-L604】
- `createPolicyConfiguration(config, overrides?)` normalises policy entries, applying overrides for
  rule registries or additional metadata, and returns
  `{ rules, engine }`.【F:packages/core/src/policy/configuration/configuration.ts†L318-L380】
- `createPolicyRules(entries, registry?, context?)` validates raw configuration entries before they
  are passed to `createPolicyConfiguration()`, ensuring identifiers are unique, required tags are
  present, and plugin references resolve
  correctly.【F:packages/audit/src/application/configuration/policies.ts†L1-L101】【F:packages/core/src/policy/configuration/configuration.ts†L221-L328】

Use the normaliser when sourcing policies from arbitrary configuration layers so duplicate entries
or malformed options fail fast:

```ts
import { createPolicyConfiguration, createPolicyRules, type PolicyConfigEntry } from '@dtifx/audit';

const entries = [
  { name: 'core.requireOwner', options: { severity: 'error' } },
  { name: 'core.requireTag', options: { tags: ['component'] } },
] satisfies PolicyConfigEntry[];

const rules = createPolicyRules(entries);
const { engine } = createPolicyConfiguration({}, { rules });
```

See the [Core policy engine reference](./core-runtime.md#policy-engine) for shared configuration
behaviour across `@dtifx/core` and `@dtifx/audit`.

## Token resolution environments

```ts
import {
  createAuditTokenResolutionEnvironment,
  createBuildTokenResolutionEnvironment,
} from '@dtifx/audit';
```

- `createAuditTokenResolutionEnvironment({ configuration, telemetry, logger, documentCache?, tokenCache? })`
  plans sources with `planTokenSources`, resolves tokens with `TokenResolutionService`, and wires
  lifecycle subscribers for logging and telemetry. It returns policy configuration plus a
  `tokens.resolve({ span })` port used by the
  runtime.【F:packages/audit/src/application/runtime/audit-token-resolution-environment.ts†L1-L260】
- `createBuildTokenResolutionEnvironment({ build, configuration, telemetry, logger, ... })`
  delegates token resolution to the build runtime (using `executeBuild`) while disabling formatters,
  so audits can share caches and transform results. It still surfaces per-stage timings and token
  metrics for
  reporting.【F:packages/audit/src/application/runtime/build-token-resolution.ts†L120-L209】

## Runtime execution

```ts
import { createAuditRuntime } from '@dtifx/audit';
```

- `createAuditRuntime({ configuration, reporter, telemetry, tokens, spanName?, dispose? })` starts a
  root span (default `dtifx.audit.run`) and orchestrates token resolution followed by policy
  evaluation. Timings include both the build phases and audit duration. `run()` returns policy
  results plus severity tallies; errors set the span status to `error` before
  rethrowing.【F:packages/audit/src/application/runtime/audit-runtime.ts†L1-L214】
- Pass a custom `clock` for deterministic tests or override the span name to align with host naming.

## Reporters

```ts
import { createAuditReporter } from '@dtifx/audit';
```

- Formats: `human`, `json`, `markdown`, and `html`. The option accepts a single format or an array
  to emit multiple outputs in one
  run.【F:packages/audit/src/application/reporting/cli-reporters.ts†L1-L374】
- `includeTimings` adds planning, parsing, resolution, transform, dependency, audit, and total
  durations to the report
  payloads.【F:packages/audit/src/application/reporting/cli-reporters.ts†L211-L357】
- Reporters stream to provided writers, so CLI integrations supply stdout/stderr while custom hosts
  can target files or other
  sinks.【F:packages/audit/src/application/reporting/cli-reporters.ts†L43-L208】

## Policy engine and defaults

```ts
import { policyEngine, createRequireOwnerPolicy } from '@dtifx/audit';
```

- `policyEngine.run({ configuration, snapshots })` evaluates registered policies and returns
  individual results plus a summary with severity counts and violation
  totals.【F:packages/audit/src/application/policy-engine/policy-engine.ts†L1-L132】
- Default factories include:
  - `createRequireOwnerPolicy` – ensures governance owner metadata is
    present.【F:packages/core/src/policy/definitions/default-policies.ts†L63-L108】
  - `createDeprecationReplacementPolicy` – checks deprecated tokens for replacement pointers and
    expects producers to set `$deprecated: { "$replacement": "…" }` in DTIF sources. Hydrated
    snapshots expose the pointer to policies as
    `deprecated.supersededBy.pointer`.【F:packages/core/src/policy/definitions/default-policies.ts†L110-L164】
  - `createRequireTagPolicy` – enforces required tags (single or
    multiple).【F:packages/core/src/policy/definitions/default-policies.ts†L165-L218】
  - `createRequireOverrideApprovalPolicy` – validates recorded approvals for layer
    overrides.【F:packages/core/src/policy/definitions/default-policies.ts†L220-L328】
  - `createWcagContrastPolicy` – evaluates per-pair WCAG ratios with optional minimum
    overrides.【F:packages/core/src/policy/definitions/default-policies.ts†L330-L360】
- Each policy accepts an options bag supporting severity overrides (`error`, `warning`, `info`) and
  policy-specific configuration. Invalid option keys raise explicit `TypeError` messages during
  configuration
  normalisation.【F:packages/core/src/policy/configuration/configuration.ts†L382-L604】

### Policy engine primitives

```ts
import {
  PolicyEngine,
  createPolicyRule,
  createPolicyRulesFromDefinitions,
  summarisePolicyResults,
  type PolicyEngineOptions,
  type PolicyRule,
  type PolicySummary,
} from '@dtifx/audit';
```

- Prefer `createPolicyRule` to wrap policy handlers in reusable rule installers when composing
  bespoke policy sets.【F:packages/core/src/policy/engine/index.ts†L112-L205】
- Convert existing imperative `PolicyDefinition` objects into rules with
  `createPolicyRulesFromDefinitions` when migrating plugins or testing legacy
  handlers.【F:packages/core/src/policy/engine/index.ts†L105-L205】
- Instantiate `PolicyEngine` directly when you want to evaluate snapshots in bespoke workflows or
  embed policies in long-lived services. Provide the rule collection via `PolicyEngineOptions` to
  share definitions across runs.【F:packages/core/src/policy/engine/index.ts†L65-L113】
- `summarisePolicyResults(results)` produces a `PolicySummary` object that aggregates violation
  counts by severity. Use it to generate reports when you bypass the convenience `policyEngine.run`
  helper.【F:packages/core/src/policy/engine/index.ts†L200-L217】
- Prefer the direct classes when integrating with non-standard dependency injection containers or
  when you need to reuse the same registry across multiple diffed snapshot sets; otherwise the
  `policyEngine.run` helper remains a concise entry point for one-off evaluations.

```ts
const rules: readonly PolicyRule[] = [
  createPolicyRule({
    policy: 'tokens.requireStatus',
    evaluate(input) {
      if (!input.metadata?.status) {
        return { severity: 'error', message: 'Token is missing a status flag.' };
      }
      return;
    },
  }),
];

const engine = new PolicyEngine({ rules } satisfies PolicyEngineOptions);
// resolveSnapshots returns PolicyTokenSnapshot[] from your runtime pipeline.
const snapshots = await resolveSnapshots();
const results = await engine.run(snapshots);
const summary: PolicySummary = summarisePolicyResults(results);

console.log(summary.policyCount, summary.violationCount, summary.severity.error);
```

## Token selector utilities

The package also exports helpers used by policies and custom audits:

- `extractTokenTags(pointer)` flattens tag metadata from token
  snapshots.【F:packages/audit/src/domain/tokens/token-snapshot.ts†L1-L120】
- `matchesTokenSelector(selector, pointer)` evaluates pointer/extension based selectors for
  fine-grained targeting.【F:packages/audit/src/domain/selectors/token-selector.ts†L1-L168】
- Colour helpers such as `parseColorValue` and `toColorCssOutput` convert token colour metadata into
  normalized representations for reporting or downstream
  calculations.【F:packages/audit/src/domain/colors/color-utils.ts†L1-L160】

Combining these APIs lets you integrate audits into bespoke automation while reusing the same policy
engine and token resolution behaviour as the CLI.

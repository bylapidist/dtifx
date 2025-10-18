---
title: Audit configuration
description: Structure of the `audit` block and policy plugin registration.
outline: deep
---

# Audit configuration

Audit policies are defined under the `audit` key in `dtifx.config.*` modules. The configuration is
shared by the build and audit runtimes, but policy evaluation happens through
[`dtifx audit run`](/guides/audit-governance) rather than during `dtifx build` executions. Refer to
the [Audit governance guide](/guides/audit-governance) for a walkthrough of the audit workflow.

## Schema

```ts
interface AuditConfig {
  policies: { name: string; options?: Record<string, unknown> }[];
  plugins?: (
    | string
    | {
        module: string;
        register?: string;
        options?: Record<string, unknown>;
      }
  )[];
}
```

- `policies` must be an array. Duplicate policy names trigger an error during registration.
- `plugins` is optional. Entries may be bare specifiers or objects specifying the module, export
  name, and options payload forwarded to the plugin.

If the `audit` field is present it must be an object. Validation errors provide explicit messages
(`Configuration "audit.policies" field must be an array when provided.`).

## Built-in policies

The default registry exposes the following policy factories.

### `governance.requireOwner`

- Purpose: ensures a token exposes owner metadata within an extension field.
- Default severity: `error`.
- Key options:
  - `extension` (defaults to `net.lapidist.governance`).
  - `field` (defaults to `owner`).
  - `message` for customised error text.
  - `severity` to downgrade findings to `warning` or `info`.

### `governance.deprecationHasReplacement`

- Purpose: requires deprecated tokens to reference a successor. Producers must set
  `$deprecated: { "$replacement": "…" }` on tokens within their DTIF sources. During hydration the
  `$replacement` string is exposed to policy consumers as `deprecated.supersededBy.pointer`, so
  audit findings refer to the hydrated pointer.
- Default severity: `error`.
- Key options:
  - `message` for customised error text.
  - `severity` to adjust enforcement level (`error`, `warning`, or `info`).

#### Replacement metadata example

```json
{
  "$schema": "https://dtif.lapidist.net/schema/core.json",
  "$version": "1.0.0",
  "color": {
    "surface": {
      "button": {
        "primary": {
          "$type": "color",
          "$value": {
            "colorSpace": "srgb",
            "components": [0.196, 0.333, 0.643],
            "hex": "#3255A4"
          },
          "$deprecated": {
            "$replacement": "#/color/surface/button/primary/v2"
          }
        },
        "primary/v2": {
          "$type": "color",
          "$value": {
            "colorSpace": "srgb",
            "components": [0.172, 0.278, 0.521],
            "hex": "#2C477D"
          }
        }
      }
    }
  }
}
```

In this example, the policy flags `color.surface.button.primary` unless the `$replacement` pointer
is present. After hydration the same relationship appears to audit policies as
`deprecated.supersededBy.pointer === '#/color/surface/button/primary/v2'`, enabling consistent
enforcement across runtimes.

### `governance.requireTag`

- Purpose: enforces presence of governance tags.
- Default severity: `error`.
- Key options:
  - `tag`/`tags` describing one or more required tags (duplicates are deduplicated).
  - `message` for customised error text.
  - `severity` to adjust enforcement level (`error`, `warning`, or `info`).

### `governance.requireOverrideApproval`

- Purpose: checks that overrides between layers include recorded approvals.
- Default severity: `error`.
- Key options:
  - `layer`/`layers` select target layers (at least one required).
  - `minimumApprovals` specifies the required approval count (must be a non-negative integer).
  - `extension`, `field`, and `context` control where approvals are read from.
  - `message` for customised error text.
  - `severity` to adjust enforcement level (`error`, `warning`, or `info`).

### `governance.wcagContrast`

- Purpose: evaluates WCAG contrast ratios between token pairs.
- Default severity: `error`.
- Key options:
  - `pairs` describes foreground and background pointers with optional per-pair `minimum` and
    `label`. Each pointer may be:
    - An absolute pointer (`/tokens/primary`) or local fragment (`#/palette/background`).
    - A `file://` URL referencing another token file.
    - A relative filesystem path resolved against the configuration directory, optionally followed
      by a `#/...` fragment (for example `./tokens.json#/palette/background`).
  - `minimum` overrides the default contrast ratio requirement for all pairs.
  - `message` for customised error text.
  - `severity` to adjust enforcement level (`error`, `warning`, or `info`).

Supply `options` objects to override defaults. Unsupported keys raise errors so mistakes are
surfaced immediately.

### Example

```ts
audit: {
  policies: [
    { name: 'governance.requireOwner' },
    {
      name: 'governance.requireTag',
      options: { tags: ['release-approved'], severity: 'warning' },
    },
    {
      name: 'governance.wcagContrast',
      options: {
        minimum: 4.5,
        pairs: [
          {
            label: 'Primary button',
            foreground: '/color/surface/button',
            background: '/color/surface/background',
          },
          {
            label: 'Card background',
            foreground: './palette.json#/card/foreground',
            background: './palette.json#/card/background',
          },
        ],
      },
    },
  ],
}
```

## Plugins

Plugins register additional policy definition factories at runtime. The loader resolves each entry
in order:

```ts
audit: {
  policies: [...],
  plugins: [
    '@company/dtifx-governance-policies',
    {
      module: '@company/dtifx-extra-policies',
      register: 'registerPolicies',
      options: { area: 'mobile' },
    },
  ],
}
```

- String entries load the module’s default export (or its `default` property when using ES modules)
  and expect a function accepting `{ registry, config, configDirectory, configPath, options? }`.
- Object entries allow choosing a named export via `register`. Omit `register` to call the default
  export.
- Plugins execute sequentially and may synchronously or asynchronously register new factories.

## Loading utilities

- `resolveAuditConfigPath(options?)` – Resolves the configuration path using the shared loader.
  Accepts `{ cwd?: string, configPath?: string }` overrides.
- `loadAuditConfiguration({ path })` – Loads the module and returns `{ config, path, directory }`
  after asserting the export is an object.

Use these helpers when embedding the audit runtime directly.

## Integration with build

When `audit` is present, `@dtifx/build` reuses the configuration for token planning and dependency
analysis, but it does not execute policies. Run [`dtifx audit run`](/guides/audit-governance) to
evaluate policies, optionally combining the audit runtime with build caches via
`createBuildTokenResolutionEnvironment`.

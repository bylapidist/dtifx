---
title: Build configuration
description: Schema and validation rules for `dtifx.config.*` modules consumed by `@dtifx/build`.
outline: deep
---

# Build configuration

`@dtifx/build` expects configuration modules to export a `BuildConfig` object. The loader validates
the shape before orchestrating pipelines, so invalid entries fail fast with descriptive errors. The
`audit` block shares its schema with [`dtifx audit`](/guides/audit-governance), but policy execution
occurs through that dedicated CLI rather than the build pipeline.

## Module exports

Configuration modules may export the object via a named export (`export const config = …`),
`export const buildConfig = …`, a default export, or a factory/promise that resolves to the
configuration. The loader resolves the module relative to the current working directory (or the
`--config` path) and returns:

- `config`: the normalised `BuildConfig` value.
- `path`: absolute file path to the configuration module.
- `directory`: directory containing the module (used for resolving relative paths and caches).

## Layers

```ts
interface TokenLayerConfig {
  name: string;
  context?: Record<string, unknown>;
}
```

- `layers` must be a non-empty array. Each entry represents an ordered layer (base, theme, brand).
- `context` is optional metadata forwarded to transform and formatter implementations.

## Sources

Every source references a layer and pointer template. Supported kinds:

### File glob sources

```ts
interface FileGlobTokenSourceConfig {
  kind: 'file';
  id: string;
  layer: string;
  pointerTemplate: PointerTemplate;
  patterns: string[];
  ignore?: string[];
  rootDir?: string;
  context?: Record<string, unknown>;
}
```

- `patterns` – Glob patterns resolved from `rootDir` (defaults to the configuration directory).
- `ignore` – Optional glob patterns to exclude.
- Symbolic links are ignored, preventing files outside `rootDir` from being loaded.

### Virtual sources

```ts
interface VirtualTokenSourceConfig {
  kind: 'virtual';
  id: string;
  layer: string;
  pointerTemplate: PointerTemplate;
  document: () => DesignTokenInterchangeFormat | Promise<DesignTokenInterchangeFormat>;
  context?: Record<string, unknown>;
}
```

Use virtual sources to inject synthetic or computed documents without hitting the file system.

### Pointer templates and placeholders

Pointer templates describe how token pointers are derived from source paths:

```ts
const template = pointerTemplate('tokens', placeholder('stem'));
```

Available placeholders:

| Placeholder | Description                                                              |
| ----------- | ------------------------------------------------------------------------ |
| `relative`  | Path relative to the source root (with directory separators normalised). |
| `basename`  | Source file name (including extension).                                  |
| `stem`      | Source file name without extension.                                      |
| `source`    | Entire source identifier (for example `file:` or `virtual:` URIs).       |

Templates may also include a `base` pointer prefix when constructing nested pointers.

## Transforms

```ts
interface TransformConfig {
  entries?: { name: string; group?: string; options?: Record<string, unknown> }[];
  plugins?: (string | { module: string; register?: string; options?: Record<string, unknown> })[];
}
```

- `entries` run in order. `group` namespaces transform caches.
- `plugins` register additional transform definitions. Strings are module specifiers; objects allow
  custom export names and option bags.

## Formatters

```ts
interface FormatterInstanceConfig {
  id?: string;
  name: string;
  options?: Record<string, unknown>;
  output: { directory?: string };
}

type FormatterPluginEntry =
  | string
  | { module: string; register?: string; options?: Record<string, unknown> };

type FormatterConfig =
  | readonly FormatterInstanceConfig[]
  | {
      entries?: readonly FormatterInstanceConfig[];
      plugins?: readonly FormatterPluginEntry[];
    };
```

- Formatters resolve by `name` via the formatter registry. Missing definitions raise errors during
  planning.
- `output.directory` overrides the writer’s default destination (`dist` unless `--out-dir` is
  passed).
- Provide `{ entries, plugins }` to register formatter instances _and_ install additional formatter
  factories. Plugins follow the transform/policy pattern: bare specifiers resolve to packages, while
  objects allow selecting a named export and forwarding options.

The default formatter registry includes:

- `json.snapshot` — Emits flattened token JSON snapshots that honour pointer templates.
- `javascript.module` — Emits ESM JavaScript modules paired with `.d.ts` declarations for bundlers
  and runtime tooling. Supports optional named exports for top-level pointer segments, configurable
  root identifiers, and inclusion of selected transform outputs.
- `typescript.module` — Emits ESM TypeScript modules with `as const` snapshots suitable for direct
  import into applications and library packages.
- `css.variables` — Emits CSS custom properties for colour, dimension, gradient, and typography
  tokens.
- `sass.variables` — Emits Sass variables mirroring the CSS custom property set.
- `less.variables` — Emits Less variables mirroring the CSS custom property set.
- Platform suites for SwiftUI (`ios.swiftui.*`) and Android (`android.material.*`).

The module formatters share a common option surface:

- `filename` – Output file name including extension (`.js` or `.ts`). For the JavaScript formatter a
  matching `.d.ts` declaration file is emitted using the same stem.
- `rootIdentifier` – Variable name used for the exported module object. Adjust this to avoid
  collisions when enabling named exports.
- `namedExports` – When `true`, emits additional named exports for each top-level pointer segment so
  bundlers can tree-shake individual branches.
- `transforms` – Array of transform names to embed within the module. These transforms must also be
  configured in the build’s transform pipeline.

### Loading formatter plugins

Formatter plugins register new factories with the formatter registry. Modules must export a
`registerFormatters` function (named or default). You can pass plugin options that will be forwarded
to the registration callback:

```ts
formatters: {
  entries: [
    { name: 'json.snapshot', output: { directory: 'dist/snapshots' } },
    { name: 'company.preview', output: { directory: 'dist/previews' }, options: { theme: 'brand' } },
  ],
  plugins: [
    '@company/dtifx-formatter-plugin',
    {
      module: './plugins/formatters.mjs',
      register: 'registerCustomFormatters',
      options: { namespace: 'company' },
    },
  ],
},
```

## Dependencies

```ts
interface DependencyConfig {
  strategy?: { name: string; options?: Record<string, unknown> };
  plugins?: (string | { module: string; register?: string; options?: Record<string, unknown> })[];
}
```

Dependency strategies analyse token relationships (for example layer overrides or dependencies on
source artefacts). Plugins register custom strategies.

## Preset helpers

`@dtifx/build` exports preset helpers that assemble transform and formatter entries for common
platform targets. Each helper returns a partial `BuildConfig` value (or an array of entries) so you
can spread them into your configuration without rewriting bundle definitions.

- `createCssBuildPreset(options)` — Returns CSS transform and formatter entries configured for
  `dist/css` by default.
- `createJavascriptModuleFormatterPreset(options)` /
  `createTypescriptModuleFormatterPreset(options)` — Formatter helpers that emit module artifacts in
  `dist/js` and `dist/ts` by default.
- `createSassFormatterPreset(options)` / `createLessFormatterPreset(options)` — Formatter helpers
  for Sass (`dist/sass`) and Less (`dist/less`) variable bundles.
- `createIosSwiftUiBuildPreset(options)` — Returns SwiftUI transform and formatter entries aimed at
  `dist/ios`.
- `createAndroidMaterialBuildPreset(options)` — Returns Android Material transform and formatter
  entries aimed at `dist/android`.
- `createBuildPreset(options)` — Aggregates any combination of the platform presets into one
  fragment.

Under the hood these helpers call the lower-level `createCssTransformPreset`,
`createIosSwiftUiTransformPreset`, `createAndroidMaterialTransformPreset`, and their formatter
counterparts (including the standalone Sass and Less formatter presets). Pass `false` for the
`transforms` or `formatters` options when you want to disable part of a preset, or supply override
objects to customise formatter identifiers, output directories, and transform groups. All preset
implementations rely on `@lapidist/dtif-parser` for pointer decoding, so customisation never
requires reimplementing JSON pointer logic.

When you need to assemble a bespoke registry, see
[Direct transform factory helpers](./build-runtime.md#direct-transform-factory-helpers) for the raw
transform factory exports that power each preset. They let you mix individual colour, dimension,
gradient, shadow, and typography transforms without inheriting formatter defaults.

## Audit block

Build configurations may embed audit policies. The schema mirrors the standalone audit configuration
and is documented in [Audit configuration](./audit-config.md). Policies execute via
[`dtifx audit run`](/guides/audit-governance) using the same configuration; the build commands do
not evaluate them automatically.

## Validation rules

The loader enforces several invariants:

- `layers` and `sources` must be non-empty arrays.
- `transforms.entries`, `transforms.plugins`, `formatters.entries`, `formatters.plugins`,
  `dependencies.plugins`, and `audit.policies` / `audit.plugins` must be arrays when provided;
  otherwise a `TypeError` is thrown.
- Plugin entries must be non-empty strings or objects with a non-empty `module` string.
- Unknown policy names or formatter names raise errors during runtime planning (after configuration
  is loaded). Policy registration occurs when [`dtifx audit run`](/guides/audit-governance) executes
  or when the audit runtime is embedded programmatically.

Catch validation errors early by running `dtifx build validate` in CI.

## Example module

```ts
import { placeholder, pointerTemplate, type BuildConfig } from '@dtifx/build';

export const config: BuildConfig = {
  layers: [{ name: 'base' }, { name: 'brand', context: { brand: 'north' } }],
  sources: [
    {
      kind: 'file',
      id: 'design-tokens',
      layer: 'base',
      pointerTemplate: pointerTemplate('tokens'),
      patterns: ['tokens/**/*.json'],
      ignore: ['**/__snapshots__/**'],
    },
    {
      kind: 'virtual',
      id: 'brand-overrides',
      layer: 'brand',
      pointerTemplate: pointerTemplate('tokens', placeholder('stem')),
      document: () => ({
        tokens: {
          button: {
            color: {
              $type: 'color',
              $value: { colorSpace: 'srgb', components: [0, 0, 1], hex: '#0000ff' },
            },
          },
        },
      }),
    },
  ],
  transforms: {
    entries: [{ name: 'color.toCss' }],
    plugins: ['@company/dtifx-transforms'],
  },
  formatters: {
    entries: [
      {
        name: 'json.snapshot',
        output: { directory: 'dist/snapshots' },
      },
    ],
    plugins: ['@company/dtifx-formatters'],
  },
  audit: {
    policies: [{ name: 'governance.requireOwner' }],
  },
};
```

Adapt this skeleton to register additional transforms, formatters, dependency strategies, and
policies as your automation matures.

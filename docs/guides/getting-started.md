---
title: Quickstart
description: Install DTIFx packages, author a configuration module, and exercise every workflow.
outline: deep
---

# Quickstart

This walkthrough provisions a minimal project that runs the build, audit, and diff workflows through
the `dtifx` CLI. Follow each step to verify your environment before adapting the configuration to a
real token library.

## 1. Check prerequisites

- **Node.js 22 or later.** The CLI enforces the runtime requirement via its `engines` declaration.
- **Package manager.** Examples use `pnpm`. Substitute `npm` if you prefer.

```bash
node --version
# optionally enable pnpm via Corepack
corepack enable pnpm
```

## 2. Initialise the workspace

### Scaffolding with `dtifx init`

Generate a workspace with configuration, sample tokens, and downstream integration stubs:

```bash
pnpm dlx @dtifx/cli dtifx init my-design-system
cd my-design-system
```

The command prompts for the package manager, whether to include sample data, and if Git should be
initialised. Pass `--yes` and `--no-sample-data`/`--no-git` to skip the questions. The scaffolder
prepares `dtifx.config.mjs`, installs dependencies, and wires common scripts in `package.json`. When
you opt into the sample data you can skip to [exercise the workflows](#5-exercise-the-workflows).

### Manual bootstrap

Prefer to assemble the project by hand? Create a directory, add dependencies, and register scripts:

```bash
mkdir dtifx-sample
cd dtifx-sample

pnpm init --yes
pnpm add -D @dtifx/cli @dtifx/build @dtifx/diff @dtifx/audit
# or
npm init --yes
npm install --save-dev @dtifx/cli @dtifx/build @dtifx/diff @dtifx/audit
```

Add convenience scripts that forward to the local CLI binary so everyone runs the same workflow:

```bash
pnpm pkg set "scripts.build:validate"="dtifx build validate"
pnpm pkg set "scripts.build:generate"="dtifx build generate"
pnpm pkg set "scripts.governance:audit"="dtifx audit run"
pnpm pkg set "scripts.quality:diff"="dtifx diff compare"
# or
npm pkg set "scripts.build:validate"="dtifx build validate"
npm pkg set "scripts.build:generate"="dtifx build generate"
npm pkg set "scripts.governance:audit"="dtifx audit run"
npm pkg set "scripts.quality:diff"="dtifx diff compare"
```

Running `pnpm run build:validate` now prints usage help because the configuration file is missing.
Create it next.

## 3. Author DTIF inputs

Create a simple token dictionary and two snapshots for diffing. The JSON aligns with the DTIF schema
used by the build and diff runtimes.

```bash
mkdir -p tokens snapshots

cat <<'JSON' > tokens/library.json
{
  "$schema": "https://dtif.lapidist.net/schema/core.json",
  "$version": "1.0.0",
  "color": {
    "surface": {
      "background": {
        "$type": "color",
        "$value": {
          "colorSpace": "srgb",
          "components": [0.125, 0.2, 0.35],
          "hex": "#203459"
        },
        "$extensions": {
          "net.lapidist.governance": {
            "owner": "design-systems"
          }
        }
      },
      "button": {
        "$type": "color",
        "$value": {
          "colorSpace": "srgb",
          "components": [0.196, 0.333, 0.643],
          "hex": "#3255A4"
        },
        "$extensions": {
          "net.lapidist.governance": {
            "owner": "design-systems"
          }
        }
      }
    }
  }
}
JSON

cat <<'JSON' > snapshots/baseline.json
{
  "$schema": "https://dtif.lapidist.net/schema/core.json",
  "$version": "1.0.0",
  "color": {
    "surface": {
      "background": {
        "$type": "color",
        "$value": {
          "colorSpace": "srgb",
          "components": [0.125, 0.2, 0.35],
          "hex": "#203459"
        }
      }
    }
  }
}
JSON

cat <<'JSON' > snapshots/next.json
{
  "$schema": "https://dtif.lapidist.net/schema/core.json",
  "$version": "1.0.0",
  "color": {
    "surface": {
      "background": {
        "$type": "color",
        "$value": {
          "colorSpace": "srgb",
          "components": [0.125, 0.2, 0.35],
          "hex": "#203459"
        }
      },
      "button": {
        "$type": "color",
        "$value": {
          "colorSpace": "srgb",
          "components": [0.231, 0.4, 0.686],
          "hex": "#3B66AF"
        },
        "$extensions": {
          "net.lapidist.governance": {
            "owner": "design-systems"
          }
        }
      }
    }
  }
}
JSON
```

## 4. Create `dtifx.config.mjs`

```bash
cat <<'JS' > dtifx.config.mjs
import { defineConfig, placeholder, pointerTemplate } from '@dtifx/build';

export default defineConfig({
  layers: [
    { name: 'base' },
  ],
  sources: [
    {
      id: 'library',
      layer: 'base',
      kind: 'file',
      pointerTemplate: pointerTemplate('tokens', placeholder('stem')),
      patterns: ['tokens/**/*.json'],
    },
  ],
  formatters: [
    {
      name: 'json.snapshot',
      output: { directory: 'dist/snapshots' },
    },
    {
      name: 'css.variables',
      options: { filename: 'tokens.css' },
      output: { directory: 'dist/css' },
    },
  ],
  audit: {
    policies: [
      {
        name: 'governance.requireOwner',
        options: { severity: 'error' },
      },
    ],
  },
});
JS
```

Each layer entry now supplies the `name` property that `TokenLayerConfig` expects. The file source
uses the `FileGlobTokenSourceConfig` shape so you can scale the quickstart to many documents without
editing the configuration. `pointerTemplate('tokens', placeholder('stem'))` emits pointers such as
`#/tokens/library` by replacing the `stem` placeholder with the matched file name (minus the
extension). The glob pattern `tokens/**/*.json` matches the `tokens/library.json` file created above
along with any additional JSON tokens stored in nested folders. Add an `ignore` array when you need
to exclude subdirectories (for example `['**/__snapshots__/**']`).

The `json.snapshot` formatter mirrors the flattened pointers produced during resolution so you can
archive resolved token payloads or feed them into downstream automations. Combined with the
`css.variables` formatter you now have both a raw snapshot and a browser-friendly output. Add
`sass.variables` or `less.variables` when you need to emit preprocessor-friendly bundles alongside
the CSS custom properties.

## 5. Exercise the workflows

```bash
pnpm run build:validate
pnpm run build:generate
pnpm run governance:audit -- --reporter markdown --reporter json
pnpm run quality:diff -- snapshots/baseline.json snapshots/next.json --summary
```

Artifacts appear under `dist/css`, `dist/snapshots`, and in the terminal. Audit runs surface policy
findings, and the diff run recommends a semantic version bump alongside change details.

## 6. Clean up

Remove the sample directory when finished:

```bash
cd ..
rm -rf dtifx-sample
```

Continue to the [build pipeline guide](./build-pipeline.md) for configuration depth, or review the
[CLI reference](/reference/cli) to explore every command and flag.

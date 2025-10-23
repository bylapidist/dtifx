---
title: Extractor setup
description:
  Configure the DTIFx extractor package and CLI to harvest design styles from Figma, Penpot, and
  Sketch into DTIF token documents for local and CI automation.
outline: deep
---

The extractor workflow connects DTIFx to design providers such as Figma, converts their style nodes
into DTIF-compliant token documents, and saves the results alongside your existing libraries. Follow
these steps to authenticate, run the CLI, and merge extracted payloads into your repositories.

## 1. Create API credentials

Follow the setup steps for the providers you plan to automate.

### Figma

1. Visit [Figma personal access tokens](https://www.figma.com/developers/api#personal-access-tokens)
   and generate a token scoped for the files you plan to extract.
2. Copy the token into a secure secret store. For local development set it as an environment
   variable:

   ```bash
   export FIGMA_ACCESS_TOKEN="<paste-token-here>"
   ```

3. Record the file key for each Figma document you want to extract. The key appears in the file URL
   (`https://www.figma.com/file/<FILE_KEY>/…`).

### Penpot

1. Create a [Penpot personal access token](https://help.penpot.app/user-guide/access-tokens/) with
   permission to read the document you plan to harvest.
2. Store the token securely and expose it to the CLI via an environment variable:

   ```bash
   export PENPOT_ACCESS_TOKEN="<paste-token-here>"
   ```

3. Note the Penpot file identifier (UUID) from the application URL. It is used as the `--file`
   option.

### Sketch

Sketch extractions read shared styles from local `.sketch` archives or JSON exports. No API tokens
are required—ensure your automation runner can access the source files on disk.

## 2. Install extractor tooling

Add the extractor library alongside the CLI so both the programmatic and command-line workflows are
available:

```bash
pnpm add -D @dtifx/cli @dtifx/extractors
# or
npm install --save-dev @dtifx/cli @dtifx/extractors
```

Consider adding package scripts that forward the required options. The examples below write provider
documents into the `tokens/` directory:

```bash
pnpm pkg set "scripts.tokens:extract:figma"="dtifx extract figma --file ABC123 --output tokens/figma.json"
pnpm pkg set "scripts.tokens:extract:penpot"="dtifx extract penpot --file DEMO --output tokens/penpot.json"
pnpm pkg set "scripts.tokens:extract:sketch"="dtifx extract sketch --file design-library.json --output tokens/sketch.json"
# or
npm pkg set "scripts.tokens:extract:figma"="dtifx extract figma --file ABC123 --output tokens/figma.json"
npm pkg set "scripts.tokens:extract:penpot"="dtifx extract penpot --file DEMO --output tokens/penpot.json"
npm pkg set "scripts.tokens:extract:sketch"="dtifx extract sketch --file design-library.json --output tokens/sketch.json"
```

You can pass `--token <value>` explicitly or rely on the `FIGMA_ACCESS_TOKEN` /
`PENPOT_ACCESS_TOKEN` environment variables.

## 3. Run the extractor

Execute the script after setting the access token and choose an output location for the DTIF
document:

```bash
FIGMA_ACCESS_TOKEN="<token>" pnpm run tokens:extract:figma
PENPOT_ACCESS_TOKEN="<token>" pnpm run tokens:extract:penpot
pnpm run tokens:extract:sketch
# yields DTIF documents (for example tokens/figma.json or tokens/penpot.json) with metadata,
# colours, gradients, typography, and image references where supported
```

Override the destination with `--output`, restrict the extraction to specific node identifiers with
`--node`, or point the CLI at a non-production API host via `--api-base` when running recorded
tests.

## 4. Automate in CI

Store provider tokens as masked secrets in your CI platform. The example below runs the Figma
extraction script before invoking downstream DTIFx build or audit jobs—adjust the command if you are
targeting Penpot or Sketch:

```yaml
env:
  FIGMA_ACCESS_TOKEN: ${{ secrets.FIGMA_ACCESS_TOKEN }}
  PENPOT_ACCESS_TOKEN: ${{ secrets.PENPOT_ACCESS_TOKEN }}

steps:
  - uses: actions/checkout@v4
  - uses: pnpm/action-setup@v4
    with:
      version: 9
  - run: pnpm install --frozen-lockfile
  - run: pnpm run tokens:extract:figma
  - run: pnpm run build:generate
```

Capture extractor output as an artefact if you want to review the generated token document or feed
it into later stages.

## 5. Merge extracted tokens into existing DTIF layers

Extracted documents use the same schema as hand-authored DTIF layers, so you can merge them with
your foundation or product libraries. The following Node.js snippet reads an existing document and
merges in the freshly extracted payload:

```bash
node <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';

const base = JSON.parse(await readFile('tokens/foundation.json', 'utf8'));
const extracted = JSON.parse(await readFile('tokens/provider.json', 'utf8'));

const merged = {
  ...base,
  color: { ...base.color, ...extracted.color },
  gradient: { ...base.gradient, ...extracted.gradient },
  typography: { ...base.typography, ...extracted.typography },
  asset: { ...base.asset, ...extracted.asset },
};

await writeFile('tokens/foundation.merged.json', `${JSON.stringify(merged, null, 2)}\n`);
console.log('Merged tokens written to tokens/foundation.merged.json');
NODE
```

Replace `provider.json` with the actual output file (`figma.json`, `penpot.json`, or `sketch.json`).

Feed `tokens/foundation.merged.json` into `dtifx build` or `dtifx diff` to validate the combined
token set. Tailor the merge logic to your layering strategy—some teams persist extracted files
separately and include them via `$ref` or override blocks in the main DTIF manifest.

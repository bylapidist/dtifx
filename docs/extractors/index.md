---
title: '@dtifx/extractors'
description:
  'Connect the DTIFx toolchain to design platforms and emit DTIF-compliant token payloads.'
---

# `@dtifx/extractors`

`@dtifx/extractors` authenticates with design provider APIs (or the Sketch file system) and converts
their style nodes into DTIF-compliant token documents. Figma, Penpot, and Sketch clients power the
`dtifx extract` CLI namespace.

## Key capabilities

- **Provider clients** — Authenticated REST clients with rate-limit handling, pagination helpers,
  and typed responses targeting design APIs.
- **DTIF schema awareness** — Converts paints, gradients, typography, and asset nodes into the DTIF
  schema shared across the toolkit.
- **Warning surfacing** — Flags unsupported node combinations (such as paint+image fills) without
  halting extraction so you can track gaps.

## Getting started

Install the extractors alongside the CLI so the `dtifx extract` namespace can locate provider
implementations:

```bash
pnpm add -D @dtifx/cli @dtifx/extractors
```

Create scripts that pipe provider credentials and the desired destinations:

```bash
pnpm pkg set "scripts.tokens:extract:figma"="dtifx extract figma --file ABC123 --output tokens/figma.json"
pnpm pkg set "scripts.tokens:extract:penpot"="dtifx extract penpot --file DEMO --output tokens/penpot.json"
pnpm pkg set "scripts.tokens:extract:sketch"="dtifx extract sketch --file design-library.json --output tokens/sketch.json"
```

Run the script with the appropriate credentials:

```bash
FIGMA_ACCESS_TOKEN="<token>" pnpm run tokens:extract:figma
PENPOT_ACCESS_TOKEN="<token>" pnpm run tokens:extract:penpot
pnpm run tokens:extract:sketch
```

Each command writes a DTIF token document enriched with metadata, colour, gradient, and typography
tokens. Combine the outputs with existing layers using merge logic in your build or CI pipelines.

## Provider reference

- **Figma** — `dtifx extract figma` requires `FIGMA_ACCESS_TOKEN` (or the `--token` flag) and
  returns colour, gradient, typography, and image references.
- **Penpot** — `dtifx extract penpot` expects `PENPOT_ACCESS_TOKEN` or `--token`, calling the REST
  API and surfacing warnings when gradients are unsupported.
- **Sketch** — `dtifx extract sketch` reads shared styles from local archives or JSON exports; no
  credentials are necessary, but warnings highlight styles that could not be mapped.

## Resources

- [Extractor setup guide](/guides/extractor-setup) — Credential management, CLI usage, and
  integration examples.
- [CLI reference](/reference/cli) — Full option catalogue for the `dtifx` binary.
- [Toolkit overview](/overview/) — Architecture tour and package relationships.

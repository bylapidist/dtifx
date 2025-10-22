---
title: '@dtifx/extractors'
description:
  'Connect the DTIFx toolchain to design platforms and emit DTIF-compliant token payloads.'
---

# `@dtifx/extractors`

`@dtifx/extractors` authenticates with design provider APIs and converts their style nodes into
DTIF-compliant token documents. The initial release focuses on Figma and powers the `dtifx extract`
CLI namespace.

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

Create a script that pipes provider credentials and the desired destination:

```bash
pnpm pkg set "scripts.tokens:extract"="dtifx extract figma --file ABC123 --output tokens/figma.json"
```

Set the `FIGMA_ACCESS_TOKEN` environment variable (or pass `--token`) before running the script.

```bash
FIGMA_ACCESS_TOKEN="<token>" pnpm run tokens:extract
```

The command writes a DTIF token document enriched with metadata, colour, gradient, typography, and
image tokens. Combine it with existing layers using merge logic in your build or CI pipelines.

## Resources

- [Extractor setup guide](/guides/extractor-setup) — Credential management, CLI usage, and
  integration examples.
- [CLI reference](/reference/cli) — Full option catalogue for the `dtifx` binary.
- [Toolkit overview](/overview/) — Architecture tour and package relationships.

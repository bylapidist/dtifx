<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD033 -->
<div align="left">
  <a href="https://dtifx.lapidist.net/extractors/" target="_blank" rel="noopener">
    <img src="logo.svg" alt="DTIFx Extractors logomark" width="72" height="72" />
  </a>
</div>
<h1>@dtifx/extractors</h1>
<!-- markdownlint-enable MD033 -->
<!-- markdownlint-enable MD041 -->

## Overview

`@dtifx/extractors` connects the DTIF toolchain to design platforms. It authenticates with vendor
APIs and converts their node payloads into DTIF-compliant token documents that plug into the rest of
the DTIFx workflows. The initial release focuses on the Figma file API, normalising colours,
gradients, typography, and image references into DTIF structures.

## Installation

```bash
pnpm add -D @dtifx/extractors
# or
npm install --save-dev @dtifx/extractors
```

- Requires Node.js 22 or later.
- Pair it with `@dtifx/cli` to run extractors from the command line.

## Usage

```ts
import { extractFigmaTokens } from '@dtifx/extractors';

const { document, warnings } = await extractFigmaTokens({
  fileKey: process.env.FIGMA_FILE_KEY!,
  personalAccessToken: process.env.FIGMA_ACCESS_TOKEN!,
});

if (warnings.length > 0) {
  warnings.forEach((warning) => console.warn(warning.message));
}

// Persist the DTIF document or feed it into downstream DTIFx workflows.
console.log(JSON.stringify(document, null, 2));
```

Set `FIGMA_ACCESS_TOKEN` (a personal access token) before invoking the extractor or pass the token
explicitly. Use the optional `nodeIds` array to limit extraction to specific style nodes and
`apiBaseUrl` to redirect requests during testing.

## Related packages

- [`@dtifx/cli`](https://dtifx.lapidist.net/cli/) exposes the `dtifx extract figma` command to wire
  provider credentials, persistence, and CI automation.
- [`@dtifx/core`](https://dtifx.lapidist.net/core/) publishes the schema types and helpers reused by
  the extractors when emitting DTIF documents.

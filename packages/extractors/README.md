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
APIs (or the local file system in the case of Sketch) and converts their payloads into
DTIF-compliant token documents that plug into the rest of the DTIFx workflows. Providers currently
include Figma, Penpot, and Sketch, covering colours, gradients, typography, and asset metadata.

## Installation

```bash
pnpm add -D @dtifx/extractors
# or
npm install --save-dev @dtifx/extractors
```

- Requires Node.js 22 or later.
- Pair it with `@dtifx/cli` to run extractors from the command line.

## Usage

### Figma

```ts
import { extractFigmaTokens } from '@dtifx/extractors';

const { document, warnings } = await extractFigmaTokens({
  fileKey: process.env.FIGMA_FILE_KEY!,
  personalAccessToken: process.env.FIGMA_ACCESS_TOKEN!,
});

warnings.forEach((warning) => console.warn(warning.message));
console.log(JSON.stringify(document, null, 2));
```

Set `FIGMA_ACCESS_TOKEN` (a personal access token) before invoking the extractor or pass the token
explicitly. Use the optional `nodeIds` array to limit extraction to specific style nodes and
`apiBaseUrl` to redirect requests during testing.

### Penpot

```ts
import { extractPenpotTokens } from '@dtifx/extractors';

const { document } = await extractPenpotTokens({
  fileId: process.env.PENPOT_FILE_ID!,
  accessToken: process.env.PENPOT_ACCESS_TOKEN!,
});
```

Penpot extractions rely on the hosted REST API. Override `apiBaseUrl` when testing against a mock
server and supply a custom `fetch` implementation if required.

### Sketch

```ts
import { extractSketchTokens } from '@dtifx/extractors';

const { document } = await extractSketchTokens({
  filePath: './design-library.json',
});
```

Provide a path to a Sketch `.sketch` archive or JSON export containing shared styles. Optional
warnings highlight any styles that could not be represented in DTIF.

## Related packages

- [`@dtifx/cli`](https://dtifx.lapidist.net/cli/) exposes the `dtifx extract figma`, `penpot`, and
  `sketch` commands to wire provider credentials, persistence, and CI automation.
- [`@dtifx/core`](https://dtifx.lapidist.net/core/) publishes the schema types and helpers reused by
  the extractors when emitting DTIF documents.

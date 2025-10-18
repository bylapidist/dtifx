<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD033 -->
<div align="left">
  <a href="https://dtifx.lapidist.net/audit/" target="_blank" rel="noopener">
    <img src="logo.svg" alt="DTIFx Audit logomark" width="72" height="72" />
  </a>
</div>
<h1>@dtifx/audit</h1>
<!-- markdownlint-enable MD033 -->
<!-- markdownlint-enable MD041 -->

## Overview

`@dtifx/audit` is the governance engine for the DTIFx Toolkit. It evaluates policy manifests against
resolved DTIF tokens, surfaces structured violations, and integrates with the shared CLI for
repeatable compliance checks.

## Installation

```bash
pnpm add -D @dtifx/cli @dtifx/audit
# or
npm install --save-dev @dtifx/cli @dtifx/audit
```

The package supports Node.js 22 or later. Pair it with `@dtifx/build` when policies need to inspect
resolved artefacts from the build pipeline.

## Usage

### Command line

```bash
pnpm exec dtifx audit run --config ./dtifx.config.mjs
pnpm exec dtifx audit run --reporter markdown --reporter json
pnpm exec dtifx audit run --json-logs --telemetry stdout
```

Manifest configuration defines policy registries, reporter plans, and telemetry exporters. The
`stdout` telemetry exporter streams runtime metrics to standard output for local inspection or CLI
composition. See the [Audit governance guide](../../docs/guides/audit-governance.md) for a complete
walkthrough.

### Node.js API

```ts
import { createAuditRuntime, createPolicyConfiguration } from '@dtifx/audit';

const configuration = createPolicyConfiguration({
  policies: [
    /* policy factories */
  ],
  reporters: [
    /* reporter entries */
  ],
});

const runtime = createAuditRuntime({ configuration });
const report = await runtime.run();

console.log(report.summary.totalFindings);
```

The runtime emits structured diagnostics, making it straightforward to plug results into logging or
observability pipelines.

## Examples

- [Audit governance guide](../../docs/guides/audit-governance.md)
- [Quickstart](../../docs/guides/getting-started.md)

## Further reading

- [Audit configuration reference](https://dtifx.lapidist.net/reference/audit-config)
- [Audit runtime reference](https://dtifx.lapidist.net/reference/audit-runtime)

## License

[MIT](LICENSE)

<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD033 -->
<div align="left">
  <a href="https://dtifx.lapidist.net/build/" target="_blank" rel="noopener">
    <img src="logo.svg" alt="DTIFx Build logomark" width="72" height="72" />
  </a>
</div>
<h1>@dtifx/build</h1>
<!-- markdownlint-enable MD033 -->
<!-- markdownlint-enable MD041 -->

## Overview

`@dtifx/build` orchestrates DTIF token builds. It resolves layered sources, applies transforms,
renders formatter plans, and evaluates policies so published artefacts match your governance model.

## Installation

```bash
pnpm add -D @dtifx/cli @dtifx/build
# or
npm install --save-dev @dtifx/cli @dtifx/build
```

Use Node.js 22 or later. Pair the package with `@dtifx/audit` when policies are part of your build.

## Usage

### Command line

```bash
# validate configuration without running transforms
pnpm exec dtifx build validate --config ./dtifx.config.mjs

# generate artefacts to the default dist directory
pnpm exec dtifx build generate

# inspect resolved tokens for debugging
pnpm exec dtifx build inspect --pointer /color --json
```

Core flags shared across subcommands:

- `--config <path>` – Explicit configuration module path.
- `--out-dir <path>` – Fallback directory for formatter outputs.
- `--json-logs` – Structured logging suitable for CI pipelines.
- `--telemetry <mode>` – Export spans to stdout when required.

### Programmatic embedding

```ts
import {
  createDefaultBuildEnvironment,
  createTelemetryRuntime,
  executeBuild,
  loadConfig,
} from '@dtifx/build';

const loaded = await loadConfig('./dtifx.config.mjs');
const environment = createDefaultBuildEnvironment(loaded, { defaultOutDir: 'dist' });
const telemetry = createTelemetryRuntime('stdout');

try {
  const result = await executeBuild(environment.services, loaded.config, telemetry.tracer);
  console.log(`Resolved ${result.metrics.totalCount} tokens.`);
} finally {
  await telemetry.exportSpans();
}
```

## Caching

`FileSystemTransformCache` persists transform results with
[`cacache`](https://www.npmjs.com/package/cacache), storing entries inside the cache directory you
provide (the default build environment uses `.dtifx-cache/transforms`). Pass a
`FileSystemTransformCacheOptions` bag to configure behaviours such as a per-entry `ttl` when you
need cached results to expire automatically.

`InMemoryTransformCache` remains available for tests and short-lived scripts where disk persistence
is unnecessary.

## Examples

- [Build pipeline guide](../../docs/guides/build-pipeline.md)
- [Quickstart project](../../docs/guides/getting-started.md)

## Further reading

- [Build configuration reference](https://dtifx.lapidist.net/reference/build-config)
- [Build runtime reference](https://dtifx.lapidist.net/reference/build-runtime)

## License

[MIT](LICENSE)

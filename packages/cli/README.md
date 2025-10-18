<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD033 -->
<div align="left">
  <a href="https://dtifx.lapidist.net/cli/" target="_blank" rel="noopener">
    <img src="logo.svg" alt="DTIFx CLI logomark" width="72" height="72" />
  </a>
</div>
<h1>@dtifx/cli</h1>
<!-- markdownlint-enable MD033 -->
<!-- markdownlint-enable MD041 -->

## Overview

`@dtifx/cli` publishes the `dtifx` executable. It unifies the diff, build, and audit runtimes so you
can run every DTIFx workflow through one entry point with consistent logging, telemetry, and error
handling.

## Installation

```bash
pnpm add -D @dtifx/cli @dtifx/audit @dtifx/build @dtifx/diff
# or
npm install --save-dev @dtifx/cli @dtifx/audit @dtifx/build @dtifx/diff
```

- Requires Node.js 22 or later.
- `@dtifx/audit`, `@dtifx/build`, and `@dtifx/diff` are peer dependencies. Install the packages that
  match your workflows.

## Usage

### Command line

```bash
# discover available namespaces and flags
pnpm exec dtifx --help

# run audit, diff, and build workflows
pnpm exec dtifx audit run --config ./dtifx.config.mjs
pnpm exec dtifx diff compare tokens/base.json tokens/feature.json
pnpm exec dtifx build generate --out-dir dist/tokens
```

Kernel-wide flags shared across namespaces include:

- `--json-logs` – Emit NDJSON logs for CI ingestion.
- `--telemetry <mode>` – Export spans (`none` or `stdout`).

Build and audit commands expose additional options such as `--config`, `--out-dir`, and `--timings`,
while diff-specific options are documented within their respective `--help` output.

Run `dtifx <namespace> <command> --help` for command-specific options.

### Programmatic access

Import the CLI kernel to embed DTIFx workflows within custom hosts:

```ts
import {
  auditCommandModule,
  buildCommandModule,
  createCliKernel,
  diffCommandModule,
} from '@dtifx/cli';

const kernel = createCliKernel({
  programName: 'dtifx',
  version: '1.0.0',
});

kernel.register(auditCommandModule).register(buildCommandModule).register(diffCommandModule);

await kernel.run(process.argv);
```

Testing adapters are available under `@dtifx/cli/testing` for driving commands without touching the
file system.

## Examples

- [Quickstart guide](../../docs/guides/getting-started.md)
- [Automation example](../../docs/examples/automation.md)

## Further reading

- [CLI reference](https://dtifx.lapidist.net/reference/cli)
- [Toolkit overview](https://dtifx.lapidist.net/overview/)

## License

[MIT](LICENSE)

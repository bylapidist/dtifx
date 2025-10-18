<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD033 -->
<div align="left">
  <a href="https://dtifx.lapidist.net" target="_blank" rel="noopener">
    <img src="docs/public/logo.svg" alt="DTIFx logomark" width="72" height="72" />
  </a>
</div>
<h1>DTIFx Toolkit</h1>
<!-- markdownlint-enable MD033 -->
<!-- markdownlint-enable MD041 -->

The DTIFx Toolkit is the production suite for the Design Token Interchange Format (DTIF). It joins
high-fidelity diffing, repeatable builds, and policy automation in a single TypeScript workspace.
Install the CLI once, connect it to your token sources, and ship governed artefacts with reliable
telemetry.

## Why DTIFx

- **DTIF-native automation.** Every package understands DTIF schemas, layered token sources, and
  governance metadata out of the box.
- **One CLI for every workflow.** The `dtifx` executable wires diff, build, and audit lifecycles
  together with shared caching, logging, and help surfaces.
- **Production observability.** Structured logging, telemetry spans, and exit codes designed for CI
  environments keep automation predictable.

## Package suite

| Package                          | Purpose                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| [`@dtifx/cli`](packages/cli)     | Unified CLI for diff, build, and audit workflows.                       |
| [`@dtifx/build`](packages/build) | Plans token layers, runs transforms, and renders distributable outputs. |
| [`@dtifx/diff`](packages/diff)   | Calculates DTIF diffs and produces human and machine-friendly reports.  |
| [`@dtifx/audit`](packages/audit) | Evaluates policy manifests and surfaces actionable guidance.            |
| [`@dtifx/core`](packages/core)   | Shared runtime primitives used by every package and custom hosts.       |

Review each package README for detailed usage examples and API references.

## Quick start

### 1. Check prerequisites

```bash
node --version
corepack enable pnpm # optional, or continue with npm
dtifx --help          # available when the CLI is installed locally
```

- **Runtime.** Node.js 22 or later is required across the toolkit.
- **Package manager.** Examples use `pnpm`. Substitute `npm` if preferred.

### 2. Install the workspace dependencies

Run the commands within your design token repository or a fresh directory.

```bash
pnpm add -D @dtifx/cli @dtifx/build @dtifx/diff @dtifx/audit
# or
npm install --save-dev @dtifx/cli @dtifx/build @dtifx/diff @dtifx/audit
```

Expose helpful scripts for team workflows:

```bash
pnpm pkg set "scripts.tokens:diff"="dtifx diff compare"
pnpm pkg set "scripts.tokens:build"="dtifx build generate"
pnpm pkg set "scripts.tokens:validate"="dtifx build validate"
pnpm pkg set "scripts.tokens:audit"="dtifx audit run"
# or
npm pkg set "scripts.tokens:diff"="dtifx diff compare"
npm pkg set "scripts.tokens:build"="dtifx build generate"
npm pkg set "scripts.tokens:validate"="dtifx build validate"
npm pkg set "scripts.tokens:audit"="dtifx audit run"
```

### 3. Connect DTIF inputs

Author or reuse DTIF token dictionaries, build manifests, and audit policies. The
[Quickstart guide](docs/guides/getting-started.md) shows a minimal configuration and wiring across
all workflows.

### 4. Run automation

```bash
# compare two snapshots
pnpm exec dtifx diff compare snapshots/previous.json snapshots/next.json

# validate configuration without generating artefacts
pnpm exec dtifx build validate

# render distributable packages
pnpm exec dtifx build generate

# enforce policy manifests
pnpm exec dtifx audit run
```

Use `pnpm exec dtifx --help` or `npx @dtifx/cli --help` to inspect every subcommand and flag.

## Documentation

The VitePress site in [`docs/`](docs) is the canonical source for tutorials, architecture notes, and
API reference material. Key entry points include:

- [Toolkit overview](docs/overview/index.md)
- [Quickstart](docs/guides/getting-started.md)
- [Build pipeline](docs/guides/build-pipeline.md)
- [Diff workflow](docs/guides/diff-workflow.md)
- [Audit governance](docs/guides/audit-governance.md)
- [CLI reference](docs/reference/cli.md)

Preview the site locally with `pnpm docs:dev` and publish via the automated
[documentation workflow](https://github.com/bylapidist/dtifx/actions/workflows/docs.yml).

## Contributing to the toolkit

To work on the monorepo itself:

```bash
pnpm install
pnpm lint
pnpm lint:markdown
pnpm build
pnpm test
pnpm format:check
CI=1 pnpm docs:build
```

These gates mirror the CI pipeline and keep the documentation build healthy.

## License

The DTIFx Toolkit is released under the [MIT License](LICENSE).

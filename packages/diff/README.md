<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD033 -->
<div align="left">
  <a href="https://dtifx.lapidist.net/diff/" target="_blank" rel="noopener">
    <img src="logo.svg" alt="DTIFx Diff logomark" width="72" height="72" />
  </a>
</div>
<h1>@dtifx/diff</h1>
<!-- markdownlint-enable MD033 -->
<!-- markdownlint-enable MD041 -->

## Overview

`@dtifx/diff` analyses DTIF token snapshots and turns them into actionable change reports. It powers
human-friendly summaries, machine-readable outputs, and CI gates that understand semantic impact.

## Installation

```bash
pnpm add -D @dtifx/cli @dtifx/diff
# or
npm install --save-dev @dtifx/cli @dtifx/diff
```

The diff engine requires Node.js 22 or later. Use it through the shared CLI or embed the API in
custom tooling.

## Usage

### Command line

```bash
pnpm exec dtifx diff compare tokens/base.json tokens/feature.json --format markdown --summary
pnpm exec dtifx diff compare tokens/base.json tokens/feature.json --fail-on-breaking --filter-type color
pnpm exec dtifx diff compare tokens/base.json tokens/feature.json --format html --output report.html
```

> [!NOTE] The CLI expects concrete file paths.
>
> If you prefer comparing Git refs, wrap the command with shell helpers such as
> `pnpm exec dtifx diff compare <(git show main:tokens/index.json) tokens/index.json` or extract the
> ref contents to temporary files before invoking the CLI.

Helpful flags:

- `--format <cli|markdown|html|json|yaml|sarif|template>` – Choose the output format.
- `--output <file>` – Write the rendered diff to disk instead of stdout.
- `--filter-type <types>` / `--filter-impact <impacts>` / `--filter-path <paths>` – Narrow which
  changes appear.
- `--fail-on-breaking` / `--fail-on-changes` – Enforce quality gates for CI pipelines.
- `--summary` / `--mode <mode>` – Control the verbosity of the report.

### Node.js API

```ts
import { createRunContext, createSessionTokenSourcePort, runDiffSession } from '@dtifx/diff';

const sources = {
  previous: { kind: 'file', target: 'tokens/base.json' },
  next: { kind: 'file', target: 'tokens/feature.json' },
};

const session = await runDiffSession(
  {
    tokenSource: createSessionTokenSourcePort(sources),
    diagnostics: { emit: console.error },
  },
  {
    filter: { types: ['color'] },
    failure: { failOnBreaking: true },
  },
);

const context = createRunContext({ sources, startedAt: new Date(), durationMs: 640 });
console.log(session.filteredDiff.breaking.length, context.previous);
```

Extend the behaviour with custom rename, impact, and summary strategies when needed.

## Examples

- [Diff workflow guide](../../docs/guides/diff-workflow.md)
- [Quickstart](../../docs/guides/getting-started.md)

## Further reading

- [Diff API reference](https://dtifx.lapidist.net/reference/diff-api)
- [CLI reference](https://dtifx.lapidist.net/reference/cli)

## License

[MIT](LICENSE)

---
title: Diff workflow guide
description: Compare DTIF snapshots, filter reports, and embed the diff engine.
outline: deep
---

# Diff workflow guide

The diff engine in `@dtifx/diff` compares two token snapshots, applies filters, evaluates failure
policies, and renders human or machine-readable reports. The `dtifx diff compare` command is the
primary entry point.

## Run the CLI

```bash
dtifx diff compare [previous] [next]
```

Provide two file paths. When no arguments are supplied the CLI prints usage help.

### Output formats

- `--format cli` – Colourful terminal output (default).
- `--format json` – Structured JSON payload.
- `--format markdown` – Markdown with tables and badges.
- `--format html` – Standalone HTML report.
- `--format yaml` – YAML payload mirroring the JSON structure.
- `--format sarif` – SARIF v2.1.0 payload for code scanning.
- `--format template` – Custom Handlebars template loaded from `--template`.

Use `--output <file>` to write the rendered report to disk. When `--format template` is selected the
`--template <path>` flag becomes mandatory. Register additional partials with
`--template-partial name=path`.

### Styling and diagnostics

- `--color` / `--no-color` – Force colour usage rather than relying on TTY detection.
- `--unicode` / `--no-unicode` – Force Unicode glyphs or ASCII fallbacks.
- `--no-links` – Disable terminal hyperlinks even when supported.
- `--quiet` – Suppress parser and reporting diagnostics.

Diagnostics are de-duplicated and emitted to stderr unless `--quiet` is set.

### Filtering and verbosity

- `--mode <full|summary|condensed>` – Control report depth (`--summary` is a shortcut).
- `--filter-type <type>` – Repeatable or comma-separated token type filter.
- `--filter-path <pointer>` – Repeatable JSON pointer prefix filter.
- `--filter-group <prefix>` – Repeatable token group filter.
- `--filter-impact <impact>` – Accepts `breaking` or `non-breaking`.
- `--filter-kind <kind>` – Accepts `added`, `removed`, `changed`, or `renamed` (synonym variants
  allowed).
- `--only-breaking` – Equivalent to `--filter-impact breaking`; incompatible with other impact
  values.
- `--verbose` – Include additional metadata such as raw diffs.
- `--why` – Explain why each change appears.
- `--diff-context <n>` – Number of pointer entries to include in context lists (default `3`).
- `--top-risks <n>` – Limit high-risk summary entries (default `5`).

### Failure policies

- `--fail-on-breaking` – Exit with code `1` if breaking changes are present.
- `--fail-on-changes` – Exit with code `1` if any change is present.

Disable each policy with `--no-fail-on-breaking` or `--no-fail-on-changes`. Use exit codes to block
merges in CI.

### Custom strategies

- `--rename-strategy <module>` – Package name, filesystem path, or `file:` URL exporting a rename
  detection strategy.
- `--impact-strategy <module>` – Package name, filesystem path, or `file:` URL exporting an impact
  classification strategy.
- `--summary-strategy <module>` – Package name, filesystem path, or `file:` URL exporting a summary
  heuristic.

Modules resolve relative to the current working directory. CommonJS and ES modules are supported.

## Programmatic usage

Create a session token source, run the diff, and render a report manually:

```ts
import {
  createRunContext,
  createSessionTokenSourcePort,
  renderReport,
  runDiffSession,
} from '@dtifx/diff';

const session = await runDiffSession(
  {
    tokenSource: createSessionTokenSourcePort({
      previous: { kind: 'file', target: 'snapshots/baseline.json' },
      next: { kind: 'file', target: 'snapshots/next.json' },
    }),
  },
  {
    filter: { kinds: ['added'] },
    failure: { failOnChanges: true },
  },
);

const context = createRunContext({
  sources: {
    previous: { kind: 'file', target: 'snapshots/baseline.json' },
    next: { kind: 'file', target: 'snapshots/next.json' },
  },
  startedAt: new Date(),
  durationMs: 120,
});

const markdown = await renderReport(session.filteredDiff, {
  format: 'markdown',
  mode: 'summary',
  runContext: context,
});
console.log(markdown);
```

Pass `diagnostics` when you need structured telemetry during parsing or rendering. Custom renderers
register with `createReportRendererRegistry` and can emit diagnostics via `emitRendererDiagnostic`.

## Exit codes and automation

- Exit code `0` – Diff completed and failure policies passed.
- Exit code `1` – A `CommanderError` surfaced (invalid input) or a failure policy triggered (for
  example `--fail-on-breaking`). Runtime errors that escape the command runner also terminate the
  process with status `1` after printing the formatted error.

Combine the status with generated reports to drive release automation, dashboards, or chat
notifications.

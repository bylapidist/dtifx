---
title: '@dtifx/diff'
description: 'Token snapshot comparison and renderer orchestration for DTIF workflows.'
---

# `@dtifx/diff`

`@dtifx/diff` specialises in comparing token snapshots across delivery targets. It helps you
orchestrate renderers, publish previews, and enforce failure policies so regressions are surfaced
before reaching production.

## Key capabilities

- **Snapshot engines** — Load historical and candidate token sets to highlight breaking changes.
- **Renderer orchestration** — Trigger renderers that visualise diffs for designers and engineers.
- **Policy enforcement** — Configure failure strategies to block merges when violations are
  detected.

## Getting started

Install the package, then pair it with a runtime created by `@dtifx/core` to run diff sessions in CI
or local development:

```bash
pnpm add @dtifx/diff
```

```ts
import { createSessionTokenSourcePort, runDiffSession } from '@dtifx/diff';

const tokenSource = createSessionTokenSourcePort({
  previous: { kind: 'file', target: 'snapshots/main.json' },
  next: { kind: 'file', target: 'snapshots/feature.json' },
});

const result = await runDiffSession(
  {
    tokenSource,
  },
  {
    failure: { failOnBreaking: true },
  },
);

if (result.failure.shouldFail) {
  console.error(`Diff failed due to ${result.failure.reason}`);
  process.exit(1);
}
```

`runDiffSession` requires a `tokenSource` dependency capable of loading the previous and next
snapshots. The `createSessionTokenSourcePort` helper adapts simple file descriptors into that port
and can be given optional parser hooks for diagnostics and warnings. Additional dependencies such as
custom diff executors, filter evaluators, or diagnostics ports can be supplied to `runDiffSession`
when you need to override the defaults.

When the session runs it loads the configured snapshots, produces a `DiffSessionResult`, and returns
the raw and filtered diffs along with the resolved failure outcome. The result includes the
previously loaded tokens, the newly generated tokens, the unfiltered `diff`, the `filteredDiff` that
honours any configured filters, the filter metadata, and a `failure` object. The failure evaluation
follows the supplied `DiffFailurePolicy`. In the example above, setting `failOnBreaking: true` will
mark the session as failed whenever breaking changes are detected. Other options such as
`failOnChanges` can be combined to exit on any token movement. Use the `shouldFail` flag to decide
whether to halt your pipeline, or inspect `reason`/`matchedCount` for more granular reporting.

## Resources

- [Diff workflow guide](/guides/diff-workflow) — Recommended flow for integrating diff checks into
  delivery pipelines.
- [Diff API reference](/reference/diff-api) — Low-level API surface for sessions, renderers, and
  policies.

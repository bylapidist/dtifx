---
title: '@dtifx/cli'
description: 'Operate DTIFx modules through a unified command-line kernel.'
---

# `@dtifx/cli`

`@dtifx/cli` wraps the DTIFx runtime stack with an ergonomic command-line kernel. Shared flags, IO
adapters, and module runners mirror the programmatic APIs so teams can orchestrate builds, diffs,
and audits without writing glue code.

## Key capabilities

- **Unified entry point** — Run build, diff, audit, and governance workflows from one binary.
- **Shared flags and profiles** — Configure telemetry, logging, and environment settings
  consistently across commands.
- **Extensible module runners** — Invoke custom modules through the same scheduling infrastructure
  used by first-party commands.

## Getting started

Install the CLI globally or add it to your workspace scripts. The CLI automatically discovers DTIFx
configuration files at runtime. Install the CLI alongside its peer dependencies so build, diff, and
audit workflows resolve without additional setup.

```bash
pnpm add -D @dtifx/cli @dtifx/audit @dtifx/build @dtifx/diff
```

You can scope the peer installations to the workflows your team actively runs.

```bash
pnpm exec dtifx build generate --config dtifx.config.mjs
```

## Resources

- [CLI reference](/reference/cli) — Command catalogue, shared flags, and module runner
  documentation.
- [Quickstart guide](/guides/getting-started) — Initialise a workspace and run your first build and
  diff tasks.
- [Troubleshooting](/troubleshooting/) — Resolve common CLI issues across local and CI environments.

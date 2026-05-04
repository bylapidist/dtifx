---
title: '@dtifx/dscp'
description:
  'Generate DSCP documents from a completed DTIFx build pipeline for AI tooling and design system
  context protocols.'
---

# `@dtifx/dscp`

`@dtifx/dscp` generates
[Design System Context Protocol (DSCP)](https://raw.githubusercontent.com/bylapidist/dscp/main/spec/v1.md)
documents from a completed DTIFx build pipeline output. A DSCP document — `DESIGN_SYSTEM.md` —
describes your full token graph, component registry, deprecation ledger, violation patterns, and
active lint rules in a format structured for both human reading and AI agent consumption.

## Key capabilities

- **Token graph export** — Serialises the full DTIFx token tree into typed DSCP sections ready for
  machine parsing.
- **AI agent consumption** — The generated `DESIGN_SYSTEM.md` can be loaded by MCP servers to give
  AI coding assistants live design system context during code generation sessions.
- **CLI integration** — Exposed through the `dtifx dscp generate` command with sensible defaults and
  a composable flags interface.

## CLI workflow

Run after a completed `dtifx build generate` to produce a `DESIGN_SYSTEM.md` alongside your build
artefacts:

```bash
# Generate DESIGN_SYSTEM.md from the default build output directory
pnpm exec dtifx dscp generate

# Specify a custom build directory and output file
pnpm exec dtifx dscp generate --from tokens/build/ --out DESIGN_SYSTEM.md
```

Flags:

- `--from <dir>` — Directory containing DTIFx build output (`tokens.json`). Defaults to
  `tokens/build`.
- `--out <file>` — Output file path. Defaults to `DESIGN_SYSTEM.md`.

## Programmatic usage

Embed the generator directly when you need to orchestrate DSCP generation alongside custom build
infrastructure:

```ts
import { generate } from '@dtifx/dscp';

await generate({
  from: 'tokens/build/',
  out: 'DESIGN_SYSTEM.md',
});
```

## Output format

`@dtifx/dscp` delegates to `@lapidist/dscp`'s `generateDocument()` and `renderMarkdown()` functions.
The output is a Markdown file with typed fenced sections delimited by HTML comment markers for
machine parsing:

```markdown
<!-- dscp:tokens:color -->

| Token | Value | Deprecated | ...

<!-- /dscp:tokens:color -->

<!-- dscp:violations -->

- DO NOT use `color: #3B82F6` → use `#/color/brand/primary`
<!-- /dscp:violations -->
```

## Integration with MCP

After running `dtifx dscp generate`, load the resulting `DESIGN_SYSTEM.md` into the
`@lapidist/design-lint` MCP server to provide AI agents with live design system context during code
generation sessions.

## Resources

- [CLI reference](/reference/cli) — Full `dtifx dscp generate` flag documentation.
- [DSCP v1 specification](https://raw.githubusercontent.com/bylapidist/dscp/main/spec/v1.md) — The
  upstream specification for the Design System Context Protocol.
- [`@lapidist/dscp` reference generator](https://github.com/bylapidist/dscp) — The underlying DSCP
  document generator.

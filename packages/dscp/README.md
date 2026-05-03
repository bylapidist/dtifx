<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD033 -->
<div align="left">
  <a href="https://dtifx.lapidist.net/dscp/" target="_blank" rel="noopener">
    <img src="logo.svg" alt="DTIFx DSCP logomark" width="72" height="72" />
  </a>
</div>
<h1>@dtifx/dscp</h1>
<!-- markdownlint-enable MD033 -->
<!-- markdownlint-enable MD041 -->

## Overview

`@dtifx/dscp` generates
[Design System Context Protocol (DSCP)](https://raw.githubusercontent.com/bylapidist/dscp/main/spec/v1.md)
documents from a completed DTIFx build pipeline output. A DSCP document — `DESIGN_SYSTEM.md` —
describes your full token graph, component registry, deprecation ledger, violation patterns, and
active lint rules in a format structured for both human reading and AI agent consumption.

## Installation

```bash
pnpm add -D @dtifx/cli @dtifx/dscp
```

Use Node.js 22 or later.

## Usage

### Command line

```bash
# generate DESIGN_SYSTEM.md from the default build output directory
pnpm exec dtifx dscp generate

# specify a custom build output directory and output file
pnpm exec dtifx dscp generate --from tokens/build/ --out DESIGN_SYSTEM.md
```

Flags:

- `--from <dir>` – Directory containing DTIFx build output (`tokens.json`). Defaults to
  `tokens/build`.
- `--out <file>` – Output file path. Defaults to `DESIGN_SYSTEM.md`.

### Programmatic embedding

```ts
import { generate } from '@dtifx/dscp';

await generate({
  from: 'tokens/build/',
  out: 'DESIGN_SYSTEM.md',
});
```

## Output format

`@dtifx/dscp` delegates to `@lapidist/dscp`'s `generateDocument()` and `renderMarkdown()` functions.
The output is a Markdown file structured with typed fenced sections delimited by HTML comment
markers for machine parsing:

```markdown
<!-- dscp:tokens:color -->

| Token | Value | Deprecated | ...

<!-- /dscp:tokens:color -->

<!-- dscp:violations -->

- DO NOT use `color: #3B82F6` → use `#/color/brand/primary`
<!-- /dscp:violations -->
```

AI coding assistants that consume DSCP documents via MCP can use these sections to look up available
tokens, understand active lint rules, and avoid introducing raw values.

## Integration with design-lint

After running `dtifx dscp generate`, the resulting `DESIGN_SYSTEM.md` can be loaded by the
`@lapidist/design-lint` MCP server to provide AI agents with live design system context during code
generation sessions.

## Examples

- [DTIFx Example project](https://github.com/bylapidist/dtifx-example)
- [DSCP v1 specification](https://raw.githubusercontent.com/bylapidist/dscp/main/spec/v1.md)

## Further reading

- [DTIFx Toolkit](https://dtifx.lapidist.net/)
- [`@lapidist/dscp` reference generator](https://github.com/bylapidist/dscp)

## License

[MIT](LICENSE)

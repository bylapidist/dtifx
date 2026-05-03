---
'@dtifx/cli': minor
'@dtifx/dscp': minor
---

Add `dtifx dscp generate` CLI command

Exposes the `@dtifx/dscp` generator through the `dtifx` CLI:

```sh
dtifx dscp generate --from tokens/build/ --out DESIGN_SYSTEM.md
```

`--from` defaults to `tokens/build`, `--out` defaults to `DESIGN_SYSTEM.md`. The command reads the
`tokens.json` snapshot from the build output directory and writes a canonical DSCP v1
`DESIGN_SYSTEM.md` file.

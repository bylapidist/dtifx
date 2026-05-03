# @dtifx/dscp

## 1.0.0

### Major Changes

- c134218: Add @dtifx/dscp package — generates DESIGN_SYSTEM.md DSCP documents from a completed
  dtifx build output

### Minor Changes

- c134218: Add `dtifx dscp generate` CLI command

  Exposes the `@dtifx/dscp` generator through the `dtifx` CLI:

  ```sh
  dtifx dscp generate --from tokens/build/ --out DESIGN_SYSTEM.md
  ```

  `--from` defaults to `tokens/build`, `--out` defaults to `DESIGN_SYSTEM.md`. The command reads the
  `tokens.json` snapshot from the build output directory and writes a canonical DSCP v1
  `DESIGN_SYSTEM.md` file.

- c134218: feat(dscp): initial release — generate DSCP documents from a completed dtifx build
  pipeline output; supports token-only DSCP output via `dtifx dscp generate`

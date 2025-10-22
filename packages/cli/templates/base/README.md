# **PROJECT_NAME**

This workspace was created with `dtifx init`. It includes a minimal DTIFx configuration so you can
validate, generate, and audit design token snapshots out of the box.

## Available scripts

The `package.json` file wires convenient npm scripts so you can run DTIFx workflows quickly:

- `pnpm run build:validate` — plan token sources and verify the configuration without writing files.
- `pnpm run build:generate` — execute the full DTIFx build pipeline and emit formatter artifacts.
- `pnpm run governance:audit` — execute governance policies against resolved token snapshots.
- `pnpm run quality:diff` — compare two token snapshots and render a change report.

Replace the `pnpm` invocations with your package manager if you selected a different option while
initialising the workspace.

## Customising tokens

Add your design token files under `tokens/` and update `dtifx.config.mjs` to point at your sources.
If you scaffolded sample data you can use it as a reference implementation while integrating your
own token pipeline.

## Downstream integrations

The `integrations/` directory contains stubs for connecting DTIFx artifacts to downstream
applications. Populate these folders with the build hooks or delivery automations that your team
requires.

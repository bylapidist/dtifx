---
title: Troubleshooting
description: Common runtime errors and how to resolve them.
outline: deep
---

# Troubleshooting

This guide lists frequent error messages emitted by the DTIFx CLI and how to address them.

## Configuration not found

**Message:** `Unable to locate dtifx-build configuration file in the current directory.`

- Run commands from the directory containing `dtifx.config.*`, or pass
  `--config path/to/dtifx.config.mjs`.
- When using workspaces, set `--config` explicitly in package scripts to avoid relying on the
  working directory.

## Invalid configuration shape

**Message:** `Configuration at <path> must define a non-empty "layers" array.` (or similar for
`sources`, `audit.policies`, `transforms.entries`).

- Ensure the exported object contains the required arrays.
- Check for typos (for example `layer` vs `layers`). The loader validates each field and raises a
  `TypeError` if a value is missing or has the wrong type.

## Template format errors

- `--format template` requires `--template <file>`. Provide a readable Handlebars template file.
- `--template-partial` values must be formatted as `name=path`. Both the name and path must be
  non-empty strings.

## Numeric flag validation

- `--diff-context` and `--top-risks` must be integers. Values below zero trigger
  `--diff-context must be a non-negative integer` errors.

## Conflicting diff filters

- `--only-breaking` cannot be combined with `--filter-impact` values other than `breaking`.
- `--summary` cannot be combined with `--mode` values other than `summary`.
- When `--filter-impact` or `--filter-kind` values are unknown, the CLI throws a `TypeError`
  describing the unsupported value.

## Exit codes in CI

- Exit code `1` from `dtifx diff compare` indicates failure policies (`--fail-on-breaking` or
  `--fail-on-changes`) triggered or Commander reported invalid input.
- `dtifx audit run` and `dtifx build` subcommands set `process.exitCode = 1` when runtime errors or
  `error`-severity policy violations occur. Inspect the reporter output for details and re-run with
  `--json-logs --timings` when you need richer diagnostics.

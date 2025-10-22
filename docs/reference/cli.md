---
title: CLI reference
description: Flags, defaults, and exit codes for the `dtifx` command.
outline: deep
---

# CLI reference

The `@dtifx/cli` package publishes the `dtifx` binary. It registers the extract, diff, build, and
audit command modules with a shared kernel, providing consistent IO, telemetry, and error handling.
This reference lists every command and option.

## Programmatic APIs

In addition to the `dtifx` executable, the CLI package exports utilities for embedding the command
modules inside other Node.js applications. These helpers wire the same Commander configuration and
IO abstractions used by the binary, so downstream hosts receive identical parsing, telemetry, and
error handling behaviour.

### Kernel factory

`createCliKernel(options)` constructs a Commander-backed kernel that can register one or more
`CliCommandModule` instances and run them against an arbitrary argument vector.

| Option        | Type      | Description                                                |
| ------------- | --------- | ---------------------------------------------------------- |
| `programName` | `string`  | Display name for `--help` output and diagnostics.          |
| `version`     | `string`  | Printed when callers pass `--version`.                     |
| `description` | `string?` | Optional help banner text.                                 |
| `io`          | `CliIo?`  | Custom IO abstraction. Defaults to `createProcessCliIo()`. |

The kernel exposes two methods:

- `register(module)` registers a command module and returns the kernel for chaining.
- `run(argv?)` parses and executes the configured Commander program. When `argv` is omitted the
  current process arguments are used. The promise resolves to the exit code that should be returned
  to the caller after accounting for `process.exitCode` mutations inside handlers.

When `run` throws, the kernel normalises errors into formatted output on `stderr`, preserving any
exit code Commander or the module already configured.

#### Context and global options

Registered modules receive a `CliKernelContext` with two capabilities:

- `io` provides direct access to the resolved `CliIo` implementation. Modules can read from stdin,
  write formatted output, or forward exit codes without depending on Node globals.
- `getGlobalOptions()` returns the current `CliGlobalOptions` (telemetry preference and log format)
  resolved from kernel-wide flags.

These helpers allow modules to tailor their behaviour based on user preferences without re-parsing
flags.

### IO abstraction

`createProcessCliIo(options?)` adapts a `NodeJS.Process` into the `CliIo` contract. It exposes the
standard streams, provides convenience writers (`writeOut`, `writeErr`), and wraps `process.exit` to
respect any pre-existing non-zero exit code. Pass a custom `process` instance (such as a mocked
object in tests) via `options.process` when embedding the CLI in environments without access to the
real process globals.

### Command modules

The CLI ships reusable `CliCommandModule` instances for extract, diff, build, and audit workflows:

- `extractCommandModule`
- `diffCommandModule`
- `buildCommandModule`
- `auditCommandModule`

Each module registers its subcommands, flags, and help content when invoked with a Commander
`Command` and the shared kernel context. Consumers can pair them with their own kernel or supplement
them with bespoke modules to extend the binary.

### Convenience kernels and runners

For common embed scenarios the package provides pre-wired kernel factories and runners:

- `createExtractCliKernel(options)` and `runExtractCli(argv?)`
- `createDiffCliKernel(options)` and `runDiffCli(argv?)`
- `createBuildCliKernel(options)` and `runBuildCli(argv?)`
- `createAuditCliKernel(options)` and `runAuditCli(argv?)`

The `create*Kernel` helpers call `createCliKernel` with appropriate metadata, register the matching
command module, and return the configured kernel. The `run*Cli` functions run the same kernel and
resolve with the resulting exit code, making it easy to proxy the CLI from another script.

```ts
import { createCliKernel, createProcessCliIo, diffCommandModule, runBuildCli } from '@dtifx/cli';

const kernel = createCliKernel({
  programName: 'custom-dtifx',
  version: '0.0.1',
  description: 'Toolkit embed for bespoke automation',
  io: createProcessCliIo(),
});

kernel.register(diffCommandModule);

// Run the embedded diff commands.
await kernel.run(['node', 'custom-dtifx', 'diff', 'compare', 'prev.json', 'next.json']);

// Or delegate to a pre-configured build workflow.
const exitCode = await runBuildCli(process.argv);
process.exit(exitCode);
```

Because the runners return a numeric exit status instead of exiting directly, hosts can decide how
to propagate failures or aggregate multiple CLI invocations inside a single process.

## Global behaviour

- Running `dtifx` without arguments prints a hint directing you to `dtifx extract`, `dtifx diff`,
  `dtifx build`, or `dtifx audit`.
- Non-interactive build subcommands (`validate`, `generate`, `inspect`) and audit runs set
  `process.exitCode = 1` when runtimes fail so callers can detect errors. `dtifx build watch` logs
  failures but keeps the session alive for the next rebuild. Diff commands throw `CommanderError`
  instances so the kernel returns a non-zero status when input validation fails or failure policies
  trigger.

### Kernel global options

- `--telemetry <mode>` (default: `auto`)
  - Records the preferred telemetry usage for command modules. Accepts `auto`, `on` (aliases:
    `enable`, `enabled`), or `off` (aliases: `disable`, `disabled`). Built-in workflows expose
    dedicated telemetry flags under their respective subcommands.
- `--json-logs`
  - Switches the kernel log format preference to JSON. Build and audit commands honour this through
    their `--json-logs` options, while other integrations can read the preference via
    `context.getGlobalOptions()`.

## `dtifx extract`

### Extract entry point

- `--help`
  - Lists available providers (`figma`) and shared help options.

### `dtifx extract figma`

- `--file <key>` (required)
  - Figma file key to extract from.
- `--token <token>`
  - Personal access token. Falls back to the `FIGMA_ACCESS_TOKEN` environment variable.
- `--node <id>` (repeatable)
  - Restrict extraction to one or more node identifiers.
- `--output <file>`
  - Destination file path. Defaults to `tokens/<file-key>.figma.json` when omitted.
- `--api-base <url>`
  - Override the API host (used with recorded fixtures and mocks).
- `--no-pretty`
  - Disable pretty-printed JSON output.

The command writes a DTIF-compliant token document to the resolved output path. Provider warnings
stream to `stderr`. Extraction fails fast if credentials are missing or the provider API returns
errors.

## `dtifx diff`

### Diff entry point

- `--version`
  - Prints the installed version of `@dtifx/diff` and exits.

Without subcommands the CLI prints help.

### `dtifx diff compare [previous] [next]`

#### Output and formatting

- `--format <format>` (default: `cli`)
  - Output format. Accepts `cli`, `json`, `markdown`, `html`, `yaml`, `sarif`, or `template`.
- `--output <file>`
  - Writes the rendered report to the specified file.
- `--template <file>`
  - Handlebars template to use with `--format template` (required in that mode).
- `--template-unsafe-no-escape`
  - Disables Handlebars HTML escaping when rendering templates. Only enable this for trusted
    templates and payloads because unescaped output can introduce cross-site scripting or injection
    issues.
- `--template-partial <name=path>`
  - Repeatable partial registration for template rendering.

> **Warning:** Handlebars escapes token values by default. Only use `--template-unsafe-no-escape`
> when the template and diff data are fully trusted; disabling escaping can allow injection attacks
> in rendered output.

- `--color` / `--no-color` (default: auto)
  - Forces coloured output on or off (defaults to TTY detection).
- `--unicode` / `--no-unicode` (default: auto)
  - Forces Unicode glyphs or ASCII fallbacks.
- `--no-links` (default: auto)
  - Disables terminal hyperlinks even when supported.
- `--quiet` (default: `false`)
  - Suppresses parser and reporting diagnostics.

#### Filtering and verbosity

- `--mode <condensed\|full\|summary>` (default: `condensed`)
  - Controls report depth. `--summary` is a shortcut for `--mode summary`. `condensed` hides the Top
    risks section and truncates pointer context to the first entry per list.
- `--summary` (default: `false`)
  - Enables summary mode. Mutually exclusive with `--mode` values other than `summary`.
- `--verbose` (default: `false`)
  - Includes extended metadata and raw diff snippets.
- `--why` (default: `false`)
  - Explains why each change appears.
- `--diff-context <n>` (default: `3`)
  - Number of pointer entries to include in context lists (allows zero).
- `--top-risks <n>` (default: `5`)
  - Maximum high-risk entries shown in summaries (allows zero).
- `--filter-type <type>`
  - Repeatable or comma-separated `$type` filter.
- `--filter-path <pointer>`
  - Repeatable JSON pointer prefix filter.
- `--filter-group <prefix>`
  - Repeatable token group filter.
- `--filter-impact <impact>`
  - Filters by change impact. Accepts `breaking` or `non-breaking`.
- `--filter-kind <kind>`
  - Filters by change kind (`added`, `removed`, `changed`, `renamed` plus synonyms).
- `--only-breaking` (default: `false`)
  - Shortcut for `--filter-impact breaking`; incompatible with other impact values.

#### Failure policies

- `--fail-on-breaking` (default: `false`)
  - Exit code `1` when breaking changes are detected. `--no-fail-on-breaking` disables it.
- `--fail-on-changes` (default: `false`)
  - Exit code `1` when any change is detected. `--no-fail-on-changes` disables it.

#### Custom strategies and loading

- `--rename-strategy <module>`
  - Bare package name, filesystem path, or `file:` URL exporting a rename detection strategy. Other
    URL schemes are rejected.
- `--impact-strategy <module>`
  - Bare package name, filesystem path, or `file:` URL exporting an impact classification strategy.
    Other URL schemes are rejected.
- `--summary-strategy <module>`
  - Bare package name, filesystem path, or `file:` URL exporting a summary strategy. Other URL
    schemes are rejected.

#### Exit codes

- `0` – Completed successfully and failure policies passed.
- `1` – Failure policies triggered (`--fail-on-*`), invalid CLI input, or runtime errors surfaced by
  Commander.

## `dtifx build`

### Build command options

- `-c, --config <path>` (default: nearest `dtifx.config.*`)
  - Configuration module location.
- `--out-dir <path>` (default: `dist`)
  - Fallback formatter output directory.
- `--reporter <format>` (default: `human`)
  - Reporter format. Accepts `human`, `json`, `markdown`, or `html`.
- `--json-logs` (default: `false`)
  - Emits NDJSON structured logs.
- `--timings` (default: `false`)
  - Includes stage timings in reporter output.
- `--telemetry <mode>` (default: `none`)
  - Telemetry exporter. Accepts `none` or `stdout`.

### `dtifx build validate`

Plans sources and prints the plan size. When planning fails the reporter logs diagnostics and the
command sets `process.exitCode = 1`.

### `dtifx build generate`

Executes the full pipeline (plan, resolve, transforms, formatters, dependencies, policies). If any
stage throws the reporter logs the error and the command sets `process.exitCode = 1`.

### `dtifx build inspect`

Additional options:

- `-p, --pointer <jsonPointer>`
  - Filters tokens by pointer prefix.
- `-t, --type <tokenType>`
  - Filters by resolved `$type`.
- `--json`
  - Emits JSON payload instead of human-readable output.

Runtime errors set `process.exitCode = 1` before the command returns.

### `dtifx build watch`

Watches for file changes and reruns the build. Uses `ChokidarWatcher` and `SequentialTaskScheduler`
under the hood. Runs indefinitely until interrupted. Build failures are reported through the
configured reporter, but the process remains active so the next change can retry. Rebuild reasons
include the triggering source identifier, event type, and absolute path (for example
`design-tokens:created:/repo/tokens/button.json` when a source with ID `design-tokens` emits a
`created` event), plus `configuration update` when the config reloads.

## `dtifx audit`

Global options mirror the build command (`--config`, `--out-dir`, `--json-logs`, `--timings`,
`--telemetry`). `--out-dir` is accepted for parity but is not currently consumed by the audit
runtime. `--telemetry <mode>` defaults to `none` and accepts either `none` or `stdout`, mirroring
the build workflow defaults. Selecting `stdout` enables the OpenTelemetry console exporter so audit
runs emit span summaries to standard output alongside reporter output, which is helpful for
inspecting stage timings during local debugging.

### `dtifx audit run`

- `--reporter <format>` (default: `human`)
  - Reporter format. Accepts `human`, `json`, `markdown`, or `html`. The option is repeatable; all
    unique formats render.

The command resolves tokens using the build-aware environment, executes policies, and prints a
summary per reporter. When a policy reports at least one `error` severity result or the run throws,
the command sets `process.exitCode = 1` before returning.

## Troubleshooting invalid flags

The CLI surfaces descriptive errors when options are malformed:

- Template partials must be declared as `name=path`.
- `--diff-context` and `--top-risks` must be non-negative integers.
- Combining `--summary` with `--mode` values other than `summary` raises a `TypeError`.

Correct the input and rerun the command; the runtime does not attempt to recover from invalid CLI
usage.

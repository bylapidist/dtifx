---
title: Diff API
description:
  Programmatic interfaces for loading tokens, running diff sessions, and rendering reports.
outline: deep
---

# Diff API

`@dtifx/diff` exposes composable utilities that mirror the CLI behaviour. Use these functions to
embed diffing in custom automation or dashboards.

## Running a diff session

```ts
import {
  runDiffSession,
  type DiffSessionDependencies,
  type DiffSessionRequest,
  type DiffSessionResult,
} from '@dtifx/diff';
```

### Dependencies

```ts
interface DiffSessionDependencies {
  tokenSource: TokenSourcePort;
  diffExecutor?: DiffExecutorPort;
  filterEvaluator?: DiffFilterEvaluatorPort;
  diagnostics?: DiagnosticsPort;
}
```

- `tokenSource` – Required port that loads the previous and next snapshots.
- `diffExecutor` – Optional custom diff engine (defaults to `createDiffExecutor`).
- `filterEvaluator` – Optional filter implementation (defaults to `createDiffFilterEvaluator`).
- `diagnostics` – Optional diagnostics sink for reporting events.

### Request options

```ts
interface DiffSessionRequest {
  filter?: DiffFilterOptions; // types, paths, groups, impacts, kinds
  failure?: DiffFailurePolicy; // failOnBreaking, failOnChanges
  diff?: DiffEngineOptions; // customise rename/impact/summary strategies
}
```

`runDiffSession` returns:

```ts
interface DiffSessionResult {
  previous: TokenSet;
  next: TokenSet;
  diff: TokenDiffResult;
  filteredDiff: TokenDiffResult;
  filter?: TokenDiffFilter;
  filterApplied: boolean;
  failure: DiffFailureResult; // includes shouldFail boolean and rationale
}
```

Handle `failure.shouldFail` to decide whether to abort releases.

## Token sources

Create token source ports from files or custom loaders.

```ts
import {
  createSessionTokenSourcePort,
  describeTokenSource,
  formatTokenSourceLabel,
} from '@dtifx/diff';

const sources = createSessionTokenSourcePort({
  previous: { kind: 'file', target: 'tokens/library.json' },
  next: { kind: 'file', target: 'snapshots/next.json' },
});
```

- `createSessionTokenSourcePort(sources, options?)` returns a port with `load` and `describe`
  methods wired to the provided session configuration. Options forward parser diagnostics
  (`onDiagnostic`, `warn`). The loader emits `TOKEN_LOAD_START`, `TOKEN_LOAD_SUCCESS`, and
  `TOKEN_LOAD_ERROR` events through the diagnostics
  port.【F:packages/diff/src/adapters/token-source/session-token-source.ts†L23-L156】
- `describeTokenSource(source)` produces a normalised label for diagnostics by resolving the target
  path relative to the current working
  directory.【F:packages/diff/src/adapters/token-source/session-token-source.ts†L58-L101】
- `formatTokenSourceLabel(source, { cwd? })` mirrors the description helper but lets you supply an
  explicit working directory when formatting labels for reports or CLI
  output.【F:packages/diff/src/adapters/token-source/session-token-source.ts†L103-L133】

```ts
const cwd = '/repo/apps/tokens';
const previousSource = { kind: 'file', target: '/repo/tokens/base.json' } as const;
const nextSource = { kind: 'file', target: '/repo/tokens/next.json' } as const;

const previousLabel = formatTokenSourceLabel(previousSource, { cwd });
const nextLabel = formatTokenSourceLabel(nextSource, { cwd });
const description = describeTokenSource(previousSource);

console.log(`Comparing ${description} → ${nextLabel}`);
```

## Token-set utilities

Most diff APIs operate on hydrated `TokenSet` instances. The package surfaces helpers that let you
load DTIF documents, hydrate inline trees, or plug in alternative parser flows.

### Loading DTIF files

`loadTokenFile(filePath, options?)` parses a DTIF document from disk using the shared
`TokenSetFactory`. Provide optional hooks to relay parser diagnostics or change the label applied to
the hydrated set.【F:packages/diff/src/sources/file-loader.ts†L1-L47】

| Option         | Description                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `label`        | Overrides the source label shown in diagnostics and attached to the set. |
| `diagnostics`  | `DiagnosticsPort` that receives structured load events.                  |
| `onDiagnostic` | Callback invoked for every parser diagnostic (info, warning, error).     |
| `warn`         | Callback invoked for parser warnings after `onDiagnostic` is called.     |

The helper resolves the path relative to `process.cwd()` and throws if fatal parser diagnostics are
emitted. Wrap calls in `try/catch` when loading untrusted files.

### Hydrating inline trees

When you already have a decoded DTIF tree (for example from an API response), call
`createInlineTokenSet(tree, options?)`. Import inline helpers from the dedicated subpath
`@dtifx/diff/token-set`, which exposes the token-set utilities that are not re-exported from the
package root. The helper accepts a raw DTIF object (`RawTokenTree`) and sets up inline resolvers so
diffing and reporting work without filesystem metadata. Provide values using DTIF-compliant
primitives (for example, colour tokens must use colour objects rather than strings), and supply
optional metadata such as a `source` label, `prefix` array, or the parser hook callbacks
(`onDiagnostic`, `warn`). Inline payloads are validated against the DTIF schema before tokens are
hydrated; invalid inputs throw an error and forward diagnostics through the supplied
hooks.【F:packages/diff/src/sources/inline-builder.ts†L1-L24】【F:packages/diff/src/adapters/dtif-parser/token-set-builder.ts†L86-L217】

> Inline alias pointers must reference defined tokens. The inline builder now shares the same parser
> pipeline as file-backed documents, so missing or cyclic alias references surface as parser errors
> that are forwarded to the supplied hooks before hydration is aborted.

For lower-level control—such as prefixing a subtree or reusing parser utilities—use
`createTokenSetFromTree(tree, { prefix, source, ...hooks })`. The function mirrors the inline helper
but exposes the same parser hook callbacks defined in `TokenParserHooks`. Schema validation also
runs here so downstream callers never receive malformed inline token
snapshots.【F:packages/diff/src/adapters/dtif-parser/token-set-builder.ts†L86-L217】

```ts
import {
  createInlineTokenSet,
  createTokenSetFromTree,
  type RawTokenTree,
} from '@dtifx/diff/token-set';

const inlineTree: RawTokenTree = {
  color: {
    base: {
      $type: 'color',
      $value: {
        colorSpace: 'srgb',
        components: [0.2, 0.4, 1],
        hex: '#3366FF',
      },
    },
    accent: {
      $type: 'color',
      $ref: '#/color/base',
    },
  },
};

const inlineSet = createInlineTokenSet(inlineTree, {
  source: 'api/payload',
  onDiagnostic: (diagnostic) => console.error(diagnostic),
});
const prefixedSet = createTokenSetFromTree(inlineTree, { prefix: ['branding'] });
```

### Custom factories

Use `TokenSetFactory`—available from the `@dtifx/diff/token-set` entry—when you need to control how
parser results are hydrated (for example to replace the underlying document cache or extend parser
diagnostics). `TokenSetFactoryOptions` require a `label` and support the same parser hook callbacks
as other helpers. The default instance (`defaultTokenSetFactory`) backs `loadTokenFile`, but you can
instantiate your own factory to call `createFromInput()` with additional
behaviour.【F:packages/diff/src/sources/token-set-factory.ts†L1-L47】

```ts
import { TokenSetFactory } from '@dtifx/diff/token-set';

const factory = new TokenSetFactory();
const tokens = await factory.createFromInput('./tokens/global.dtif', {
  label: 'global tokens',
  onDiagnostic: (diagnostic) => logDiagnostic(diagnostic),
});
```

Factories throw if the parser emits fatal diagnostics or if the decoded document is not a valid
object, ensuring downstream diff utilities always receive well-formed token
graphs.【F:packages/diff/src/sources/token-set-factory.ts†L18-L43】

## Rendering reports

Use `renderReport` or specific formatter helpers:

```ts
import { createRunContext, renderReport } from '@dtifx/diff';

const report = await renderReport(diffResult, {
  format: 'markdown',
  mode: 'summary',
  topRisks: 5,
  runContext: createRunContext({
    sources,
    startedAt: new Date(),
    durationMs: 480,
  }),
});
```

`RenderReportOptions` vary per format:

| Format            | Key options                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `cli`             | `color`, `verbose`, `showWhy`, `diffContext`, `topRisks`, `links`, `mode`, `runContext`, |
|                   | optional `unicode`.                                                                      |
| `json`/`yaml`     | `mode`, `topRisks`, `runContext`.                                                        |
| `markdown`/`html` | `mode`, `topRisks`, `showWhy`, `diffContext`, `runContext`.                              |
| `sarif`           | `runContext`.                                                                            |
| `template`        | `template` string plus optional `partials`, `mode`, `topRisks`, `runContext`.            |

To build custom renderers, register them with `createReportRendererRegistry` and call `render` on
the registry. Emit structured diagnostics via `emitRendererDiagnostic` to integrate with CLI
telemetry.

## Diff primitives

Use the lower-level utilities when you need granular control over diffing:

- `diffTokenSets(previous, next, options?)` performs the core comparison and returns additions,
  removals, modifications, and renames.【F:packages/diff/src/domain/diff-engine.ts†L71-L105】
- `collectTokenChanges(diff)` flattens grouped results into a list for custom processing or
  assertions.【F:packages/diff/src/domain/diff-engine.ts†L275-L334】
- `detectTokenRenames(previous, next, strategy?)` isolates rename candidates using the supplied or
  default rename strategy.【F:packages/diff/src/domain/diff-engine.ts†L336-L352】
- `summarizeTokenDiff(diff, options?)` produces rollups for reports (counts, hotspots, and summary
  sections).【F:packages/diff/src/domain/diff-engine.ts†L355-L388】
- `recommendVersionBump(diff, options?)` infers semantic version recommendations based on change
  impact.【F:packages/diff/src/domain/diff-engine.ts†L390-L420】

All helpers accept optional strategy overrides (`createStructuralRenameStrategy`,
`createFieldImpactStrategy`, `createTokenRenameStrategy`) exported from the same
module.【F:packages/diff/src/domain/strategies/rename.ts†L1-L141】【F:packages/diff/src/domain/diff-engine.ts†L50-L60】

## Failure policies

`evaluateDiffFailure({ diff, filterApplied, policy })` implements the logic behind
`--fail-on-breaking` and `--fail-on-changes`. It returns `{ shouldFail, reasons }` so custom hosts
can surface the same exit criteria as the
CLI.【F:packages/diff/src/domain/failure-policy.ts†L1-L108】

## Utilities

- `createRunContext(options)` – Produces metadata used by renderers (source descriptions, duration,
  timestamps).
- `describeAddition` / `describeRemoval` / `describeModification` / `describeRename` – Generate
  natural language descriptions for individual changes.
- `createJsonPayload(diff, options)` – Obtain the JSON structure without stringifying manually.
- `supportsCliHyperlinks()` – Detects whether the terminal supports hyperlinks.
- Diagnostics helpers (`createTokenParserDiagnosticEvent`, `emitTokenParserDiagnostic`,
  `DiagnosticCategories`, `DiagnosticScopes`) keep custom integrations aligned with the CLI’s
  structured
  diagnostics.【F:packages/diff/src/adapters/token-source/diagnostics.ts†L1-L10】【F:packages/diff/src/reporting/index.ts†L44-L55】

## Error handling

- `TokenSourceLoadError` is thrown when snapshots fail to load (for example missing files or parse
  errors). Catch it to display user-friendly messages.
- Strategy loaders throw when modules cannot be resolved or exports are missing. Wrap in `try/catch`
  to surface actionable guidance.

## Concurrency hints

Utilities such as `detectParallelism()` and `runTaskQueue()` from `@dtifx/core` remain available
when you need to parallelise bespoke token loaders. The bundled session token source processes files
sequentially; implement a custom `TokenSourcePort` to co-ordinate concurrent work.

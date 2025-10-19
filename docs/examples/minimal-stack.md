---
title: Minimal stack example
description: Explore the dtifx-example repository for an end-to-end DTIFx workflow with design-lint.
outline: deep
---

# Minimal stack example

The [dtifx-example repository](https://github.com/bylapidist/dtifx-example) demonstrates a
production-ready DTIFx installation wired to
[design-lint](https://github.com/bylapidist/design-lint). It ships a complete catalogue of DTIF
documents, governance policies, CI configuration, and a sample React component that consumes the
generated token outputs. Clone the project when you want a reference implementation that mirrors the
workflows described throughout these docs.

## Repository layout

The example mirrors the toolkit structure so you can map directories back to the runtime guides:

- `tokens/` contains the foundational, component, and theme DTIF documents that feed the CLI.
- `ops/artifacts/` stores committed evidence from build, diff, audit, validation, and design-lint
  runs, making it easy to diff regenerated outputs in reviews.
- `src/components/` holds a React button example and stylesheet that import the generated
  `tokens.css` bundle to demonstrate product usage.
- `build/`, `audit/`, and shared lint configs (`design-lint.config.cjs`, `eslint.config.js`) wire up
  the official DTIFx commands without custom wrappers.

Review
[`ops/artifacts/README.md`](https://github.com/bylapidist/dtifx-example/blob/main/ops/artifacts/README.md)
for a directory-by-directory breakdown of the captured evidence.

## Key workflows

Install dependencies with `npm install`, then run the scripts surfaced through the repository `npm`
commands to exercise the stack end to end:

- `npm run verify` executes ESLint followed by design-lint to validate UI usage of the published
  tokens.
- `npm run dtif:validate` runs `dtifx build validate` against `build/dtif-build.config.mjs` to
  confirm the catalogue compiles successfully.
- `npm run dtif:build` invokes `dtifx build generate` and refreshes `ops/artifacts/build/tokens.css`
  and `tokens.json` for downstream consumers.
- `npm run dtif:diff` wraps `dtifx diff compare` to produce JSON and Markdown evidence comparing the
  latest catalogue to the approved baseline.
- `npm run dtif:audit` runs `dtifx audit` with the committed policies and exports reports to
  `ops/artifacts/audit/`.
- `npm run design-lint` lints the React and CSS example code against the generated token bundle.

Each command matches the toolkit guides referenced in the repository README so you can cross-check
behaviour with the build, diff, and audit documentation.

## UI token usage

The sample `Button` component pulls CSS variables directly from `ops/artifacts/build/tokens.css` to
illustrate how design teams map DTIF outputs into product code. Inspect
[`src/components/Button.jsx`](https://github.com/bylapidist/dtifx-example/blob/main/src/components/Button.jsx)
and
[`src/components/button.css`](https://github.com/bylapidist/dtifx-example/blob/main/src/components/button.css)
to follow the token references end to end.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs `npm run verify`, `npm run dtif:validate`,
`npm run dtif:build`, `npm run dtif:diff`, and `npm run dtif:audit` on every push. Use the workflow
as a template for mirroring the same gates in your projects.

## Learn more

The repository README links back to the relevant DTIFx documentation and design-lint usage guides.
Start there when you want a curated walkthrough of each workflow alongside the captured artefacts.

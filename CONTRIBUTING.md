# Contributing to DTIFx Toolkit

We welcome contributions that strengthen the DTIFx toolchain and documentation. This guide explains
how to propose changes, the required quality bars, and how to collaborate respectfully with the
maintainers and fellow contributors. By participating you agree to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Ways to contribute

- Report reproducible bugs using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).
- Suggest enhancements or request features through the
  [feature request template](.github/ISSUE_TEMPLATE/feature_request.md).
- Improve documentation and examples in `docs/` so new workflows ship with guidance.
- Tackle issues labelled "help wanted" after coordinating in the associated discussion or issue.

## Getting started

1. **Discuss first.** Open an issue or comment on an existing ticket to avoid duplicated effort and
   to confirm the proposed direction.
2. **Create a working branch.** Keep pull requests focused on a single logical change. Prefer
   descriptive branch names such as `feat/diff-cli-reporting`.
3. **Install dependencies.** Use the versions defined in [`.nvmrc`](./.nvmrc) and
   [`package.json`](./package.json). Install workspace dependencies with `pnpm install` so tooling
   stays aligned with the repository configuration.

## Development workflow

We expect contributors to validate changes locally before opening a pull request.

1. Make updates with TypeScript strictness in mind and follow the shared ESLint configuration.
2. Update or add documentation in tandem with behavioural changes.
3. Run the required quality gates from the repository root:

   ```bash
   pnpm lint
   pnpm lint:markdown
   pnpm build
   pnpm test
   pnpm format:check
   CI=1 pnpm docs:build
   ```

4. Stage changes with intent-revealing commit messages following the Angular Conventional Commit
   format (e.g., `feat(diff): add renderer warnings`).
5. Push your branch and open a pull request that:
   - References the relevant issue.
   - Summarises user-facing impact.
   - Lists the commands executed in local verification.
   - Links to any updated documentation or follow-up tasks.

## Code review expectations

- Reviews focus on correctness, maintainability, documentation, and user experience.
- Address feedback promptly; prefer follow-up commits over force pushes when responding to review
  comments.
- Keep discussions respectful and defer to the maintainers when consensus cannot be reached.

## Documentation contributions

- Preserve existing front matter in VitePress pages.
- Keep line lengths under 120 characters and respect `.markdownlint.jsonc`.
- Provide runnable examples or CLI transcripts when describing new workflows.

## Release notes and Changesets

If your change affects any published package or CLI behaviour, run `pnpm changeset` to create a new
entry describing the impact. Include the generated markdown file in your pull request.

## Recognition

Significant contributors may be invited to become maintainers after demonstrating sustained, high
quality contributions across code, documentation, and community support channels.

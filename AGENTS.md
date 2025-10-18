# Agent Operating Guidelines

## Required Quality Gates

Before committing or submitting a pull request, you **must** run all of the following commands and
ensure they succeed:

1. `pnpm lint`
2. `pnpm lint:markdown`
3. `pnpm build`
4. `pnpm test`
5. `pnpm format:check`
6. `CI=1 pnpm docs:build`

If any command fails, resolve the issue before proceeding.

## Documentation Standards

- Keep Markdown content compliant with `.markdownlint.jsonc`.
- Prefer line lengths under 120 characters and avoid trailing spaces.
- Preserve front matter headers in VitePress docs.

## Code Style Expectations

- Follow the shared ESLint configuration in `eslint.config.mjs`.
- Use TypeScript `strict` mode defaults from `tsconfig.base.json`.
- Avoid introducing runtime dependencies without justification.

## Commit Discipline

- Use Angular-style commit messages enforced by commitlint.
- Do not skip Husky hooks unless explicitly instructed.

## Changesets and releases

- When implementing a new feature or bug fix, manually add a changeset file beneath the `.changeset`
  directory so the changelog and version bump are generated.
  - Choose a descriptive kebab-case filename aligned with the scope of the change.
  - Do **not** invoke the Changesets CLI; create the file yourself.
- Structure every changeset using this template, updating the semver bump, affected package scopes,
  and summary accordingly. Add additional package lines if the change spans multiple packages in the
  monorepo:

  ```md
  ---
  '@dtifx/core': patch
  ---

  fix lintFile to handle lintFiles return format
  ```

## Testing Scope

- When modifying a specific package, prefer running `nx test <package>` as a fast feedback loop **in
  addition** to the required commands above.

Non-compliance with this document may result in follow-up revisions.

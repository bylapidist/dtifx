# Claude Agent Operating Guidelines for DTIFx

This file provides guidelines for Claude AI agents working on the DTIFx Toolkit monorepo. Following these guidelines ensures code quality, consistency, and successful CI builds.

## Project Context

DTIFx is the production suite for the Design Token Interchange Format (DTIF). It's a TypeScript monorepo using:
- **Package manager**: pnpm (v10.20.0)
- **Runtime**: Node.js 22+
- **Build system**: Nx monorepo tooling
- **Testing**: Vitest
- **Linting**: ESLint with TypeScript strict mode
- **Formatting**: Prettier
- **Commit conventions**: Angular-style (enforced by commitlint)
- **Git hooks**: Husky

## Required Quality Gates

Before committing or submitting a pull request, you **must** run all of the following commands and ensure they succeed:

1. `pnpm lint` - Runs ESLint across all packages
2. `pnpm lint:markdown` - Validates Markdown documentation
3. `pnpm build` - Builds all packages in the monorepo
4. `pnpm test` - Runs the full test suite
5. `pnpm format:check` - Verifies Prettier formatting
6. `CI=1 pnpm docs:build` - Builds documentation site

**IMPORTANT**: If any command fails, you must resolve the issue before proceeding with a commit.

### Slash Commands for Quality Gates

You can use these convenient slash commands:
- `/quality-check` - Runs all quality gates in sequence
- `/quick-check` - Runs lint, format:check, and build only (faster feedback)
- `/test-package` - Tests a specific package with Nx

## Documentation Standards

- Keep Markdown content compliant with `.markdownlint.jsonc`
- Prefer line lengths under 120 characters
- Avoid trailing spaces
- Preserve front matter headers in VitePress docs
- Do not create documentation files proactively unless explicitly requested

## Code Style Expectations

- Follow the shared ESLint configuration in `eslint.config.mjs`
- Use TypeScript `strict` mode defaults from `tsconfig.base.json`
- Avoid introducing runtime dependencies without justification
- Prefer existing packages/APIs over adding new dependencies

## Commit Discipline

- **Commit message format**: Use Angular-style commit messages enforced by commitlint
  - Examples: `feat(cli): add new extract command`, `fix(diff): handle empty token sets`, `docs: update API reference`
- **Git hooks**: Do not skip Husky hooks (no `--no-verify`) unless explicitly instructed
- **Commit timing**: Only commit when explicitly asked by the user
- **Branch naming**: Follow the pattern `claude/descriptive-name-<session-id>` for feature branches

## Changesets and Releases

When implementing a new feature or bug fix, **manually add a changeset file** beneath the `.changeset` directory:

1. Choose a descriptive kebab-case filename aligned with the scope of the change
2. Do **not** invoke the Changesets CLI; create the file yourself
3. Use this template structure:

   ```md
   ---
   '@dtifx/core': patch
   ---

   fix lintFile to handle lintFiles return format
   ```

4. Update the semver bump (`major`, `minor`, or `patch`), affected package scopes, and summary accordingly
5. Add additional package lines if the change spans multiple packages

## Testing Scope

- When modifying a specific package, prefer running `nx test <package-name>` for fast feedback **in addition to** the required quality gates
- Always run the full `pnpm test` before committing
- Ensure tests pass before marking tasks as complete

## Package Structure

The monorepo contains these packages:
- `@dtifx/audit` - Policy evaluation and governance
- `@dtifx/build` - Token layer planning and transformation
- `@dtifx/cli` - Unified CLI interface
- `@dtifx/core` - Shared runtime primitives
- `@dtifx/diff` - DTIF diffing engine
- `@dtifx/extractors` - Design provider connectors (Figma, Penpot, Sketch)

When making changes, consider cross-package impacts and run tests for affected packages.

## Common Workflows

### Running quality checks
```bash
pnpm lint && pnpm lint:markdown && pnpm build && pnpm test && pnpm format:check && CI=1 pnpm docs:build
```

### Testing a specific package
```bash
nx test <package-name>  # e.g., nx test core
```

### Running smoke tests
```bash
pnpm smoke:build
pnpm smoke:diff
pnpm smoke:audit
pnpm smoke:extractors
```

### Documentation preview
```bash
pnpm docs:dev  # Start development server
```

## Git Operations

- **Branch creation**: Create feature branches with descriptive names
- **Pushing**: Use `git push -u origin <branch-name>` for first push
- **Commit messages**: Follow Angular convention (type(scope): description)
- **Pre-commit hooks**: Let lint-staged run (handles ESLint, Prettier, Markdownlint)

## Error Handling

If you encounter failures:
1. Read error messages carefully
2. Fix linting/formatting issues using `pnpm format` (not just `format:check`)
3. Run targeted tests with `nx test <package>` for faster iteration
4. Ensure all quality gates pass before marking tasks complete
5. Keep tasks as "in_progress" if blocked by errors

## Task Management

- Use the TodoWrite tool to track multi-step tasks
- Mark tasks complete only when fully accomplished
- Keep exactly ONE task in_progress at a time
- Create new tasks for blockers or discovered work

---

**Remember**: Non-compliance with these guidelines may result in CI failures and follow-up revisions. Always verify quality gates pass before committing.

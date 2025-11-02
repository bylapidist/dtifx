# Claude Configuration for DTIFx

This directory contains configuration and commands for Claude AI agents working on the DTIFx monorepo.

## Structure

- `instructions.md` - Main operating guidelines for Claude agents (equivalent to AGENTS.md for Codex)
- `commands/` - Custom slash commands for common workflows

## Available Slash Commands

### /quality-check
Runs all required quality gates before committing:
- Linting (ESLint + Markdown)
- Build
- Tests
- Format checking
- Documentation build

Use this before committing to ensure CI will pass.

### /quick-check
Fast feedback loop with lint, format, and build checks only. Useful during development but does NOT replace full quality checks before committing.

### /test-package [package-name]
Test a specific package using Nx for faster feedback. Example: `/test-package core`

### /add-changeset
Interactive helper to create a changeset file for version bumping and changelog generation.

## How Instructions Work

The `instructions.md` file is automatically loaded by Claude when working in this repository. It provides:
- Project context and tooling overview
- Required quality gates
- Code style expectations
- Commit conventions
- Changeset workflow
- Common commands and workflows

## Comparison with AGENTS.md

While `AGENTS.md` provides guidelines for Codex agents, this `.claude/` directory provides equivalent (and enhanced) guidelines for Claude:

| AGENTS.md | .claude/ |
|-----------|----------|
| Single markdown file | Structured directory with instructions + commands |
| Manual command execution | Slash commands for convenience |
| Text-only guidelines | Interactive workflows with prompts |

Both serve the same purpose: keeping AI agents aligned with project standards and CI requirements.

## Contributing

When adding new conventions or requirements:
1. Update `instructions.md` with the new guidelines
2. Consider adding a slash command if it's a common workflow
3. Keep commands focused and single-purpose
4. Test commands before committing

## References

- Main project guidelines: `AGENTS.md` (for Codex compatibility)
- Claude documentation: https://docs.claude.com/
- DTIFx documentation: `docs/` directory

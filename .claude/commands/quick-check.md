---
description: Run fast quality checks (lint, format, build) for quick feedback
---

Run a subset of quality checks for faster feedback during development. This is useful for quick iterations but does NOT replace the full quality-check before committing.

Execute these commands:

1. `pnpm lint` - ESLint validation
2. `pnpm format:check` - Prettier format verification
3. `pnpm build` - Build all packages

Report any failures. Note that this skips tests, markdown linting, and docs build - run `/quality-check` before committing.

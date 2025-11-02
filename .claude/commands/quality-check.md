---
description: Run all required quality gates before committing (lint, markdown, build, test, format, docs)
---

Run all required quality gates for the DTIFx monorepo in sequence. This ensures the code meets all CI requirements before committing.

Execute the following commands and report any failures:

1. `pnpm lint` - ESLint validation
2. `pnpm lint:markdown` - Markdown linting
3. `pnpm build` - Build all packages
4. `pnpm test` - Run all tests
5. `pnpm format:check` - Prettier format verification
6. `CI=1 pnpm docs:build` - Documentation build

If any command fails, stop and report the error. Do not proceed to commit until all checks pass.

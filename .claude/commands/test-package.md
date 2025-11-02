---
description: Test a specific package using Nx (e.g., /test-package core)
---

Test a specific package in the DTIFx monorepo using Nx. This provides faster feedback when working on a single package.

Available packages:
- audit
- build
- cli
- core
- diff
- extractors

Usage: Provide the package name as an argument.

Example: `/test-package core` will run `nx test core`

If no package name is provided, ask the user which package to test.

After running the test, also suggest running the full test suite (`pnpm test`) before committing.

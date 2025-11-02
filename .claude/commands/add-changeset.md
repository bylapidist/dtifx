---
description: Create a changeset file for the current changes
---

Create a changeset file for version bumping and changelog generation.

Ask the user for the following information:
1. Which package(s) are affected? (audit, build, cli, core, diff, extractors)
2. What type of change is this? (major, minor, patch)
3. Brief description of the change

Then create a new file in `.changeset/` with a descriptive kebab-case filename.

Template structure:
```md
---
'@dtifx/PACKAGE': TYPE
---

DESCRIPTION
```

Example:
```md
---
'@dtifx/core': patch
---

fix lintFile to handle lintFiles return format
```

For multi-package changes, add multiple package lines:
```md
---
'@dtifx/core': patch
'@dtifx/cli': patch
---

add support for new token format
```

Do NOT invoke the Changesets CLI - create the file manually.

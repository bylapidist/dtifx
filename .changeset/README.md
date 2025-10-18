# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage versioning and
releases. When contributing, run `pnpm changeset` to document your changes. All workspace packages
participate in a fixed version group; bumping one package will bump them all. Private packages such
as `@dtifx/core` still receive version updates, ensuring the repository stays in sync while only
public packages are published to the npm registry.

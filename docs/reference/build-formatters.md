---
title: Build formatters
description:
  Reference for the built-in formatters provided by @dtifx/build, including the docs.static
  generator.
outline: deep
---

# Build formatters

`@dtifx/build` ships a formatter registry so build configurations can reference formatter instances
by name. The registry includes snapshot emitters, JavaScript/TypeScript module formatters, web
variable generators, platform bundles (SwiftUI, Android Material/Compose), and a static
documentation site builder. You can register additional factories via plugins when you need custom
output formats.

```ts
interface FormatterInstanceConfig {
  id?: string;
  name: string;
  options?: Record<string, unknown>;
  output: { directory?: string };
}
```

## Built-in formatter catalogue

| Formatter                          | Purpose                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `json.snapshot`                    | Emits flattened token JSON snapshots that honour pointer templates.           |
| `javascript.module`                | Emits ESM modules with `.d.ts` declarations for bundlers.                     |
| `typescript.module`                | Emits ESM TypeScript modules with `as const` snapshots.                       |
| `css.variables` / `sass.variables` | Emits CSS/Sass/Less variables for colour, dimension, and typography tokens.   |
| `ios.swiftui.*`                    | Emits SwiftUI colours, dimensions, typography, gradients, and shadows.        |
| `android.material.*`               | Emits Material colour, dimension, typography, gradient, and shadow resources. |
| `android.compose.*`                | Emits Jetpack Compose colour, typography, and shape bundles.                  |
| `docs.static`                      | Builds a static documentation site with grouped tokens and copied assets.     |

Combine these factories with [formatter presets](/config/formatter-presets) or list individual
instances under the build configuration’s `formatters.entries` array.

## docs.static — static documentation bundle

`docs.static` traverses resolved token snapshots and transform outputs to produce an interactive
documentation site. Tokens are grouped by type, and each entry includes metadata, context, transform
examples, and previews for any copied assets (for example SVG swatches or font files referenced by
font-face tokens).

### CLI usage

Run the formatter via the build CLI when you only need documentation output:

```bash
dtifx build generate --format docs.static
```

The command resolves tokens, runs transforms, executes the `docs.static` formatter, and writes the
bundle relative to the formatter’s `output.directory` (or the CLI `--out-dir` fallback).

### Configuration example

```ts
import type { BuildConfig } from '@dtifx/build';

export const config: BuildConfig = {
  // ...sources, transforms, and policies...
  formatters: {
    entries: [
      {
        id: 'docs',
        name: 'docs.static',
        output: { directory: 'dist/docs' },
        options: {
          title: 'Design token atlas',
          description: 'Snapshot of brand tokens, transform outputs, and asset previews.',
        },
      },
    ],
  },
};
```

Options:

- `title` – Document title rendered in the HTML `<title>` tag and hero heading (defaults to “Design
  token documentation”).
- `description` – Optional subtitle rendered beneath the heading and exposed as a `<meta>` tag for
  social/SEO snippets.

### Generated artefacts

`docs.static` writes a minimal static site bundle:

| File                  | Description                                                                    |
| --------------------- | ------------------------------------------------------------------------------ |
| `index.html`          | HTML shell with header, root container, and script/style tags.                 |
| `assets/styles.css`   | Standalone stylesheet for layout, typography, and dark-mode support.           |
| `assets/app.js`       | Client-side script that renders token groups, examples, and asset previews.    |
| `assets/docs-data.js` | Data bootstrap script (`window.__DTIFX_DOCS__`) containing the token model.    |
| `assets/media/*`      | Copied token assets (for example SVGs or font files) with stable hashed names. |

The bundle requires no build step—host the directory on any static site server. Since the formatter
copies local assets referenced by tokens or transform outputs, the documentation includes inline
previews for images and download links for other file types.

### Code snippets

`docs.static` can surface language-specific code snippets alongside transform examples. When a token
includes color transform outputs, the formatter maps them to small SwiftUI, Jetpack Compose, or CSS
snippets and renders them in an accessible tabbed interface beneath the transform payload. The UI
falls back gracefully when no snippets are available, so legacy bundles remain compatible.

To enable the snippets bundled with the formatter, ensure your build configuration runs the relevant
transforms for the tokens you want to showcase:

- `color.toCss` — enables CSS variable snippets derived from the transform metadata.
- `color.toSwiftUIColor` — generates SwiftUI initializer samples for the token’s color values.
- `color.toAndroidComposeColor` — emits Jetpack Compose `Color(...)` literals for Android
  previewers.

You can register custom snippet generators by extending the formatter or by emitting additional
transforms and mapping them to snippet templates in your own formatter entry.

### Customisation tips

- Combine the formatter with [`dtifx build watch`](/api/build-workflows#watch) during design audits
  to rebuild documentation as tokens change.
- Use multiple formatter instances (for example one per theme) by providing unique `id` values and
  output directories.
- If you expose additional transform outputs, they appear in each token’s example list
  automatically.

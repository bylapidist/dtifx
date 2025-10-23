<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD033 -->
<div align="left">
  <a href="https://dtifx.lapidist.net/core/" target="_blank" rel="noopener">
    <img src="logo.svg" alt="DTIFx Core logomark" width="72" height="72" />
  </a>
</div>
<h1>@dtifx/core</h1>
<!-- markdownlint-enable MD033 -->
<!-- markdownlint-enable MD041 -->

## Overview

`@dtifx/core` supplies the shared runtime used across the DTIFx Toolkit. It covers structured
logging, telemetry primitives, manifest utilities, and governance helpers so higher-level packages
and custom hosts share the same foundation.

## Installation

```bash
pnpm add @dtifx/core @lapidist/dtif-parser @lapidist/dtif-schema
# or
npm install @dtifx/core @lapidist/dtif-parser @lapidist/dtif-schema
```

The package targets Node.js 22 or later.

## Usage

### Structured logging

```ts
import { JsonLineLogger } from '@dtifx/core/logging';

const logger = new JsonLineLogger(process.stdout);

logger.log({
  level: 'info',
  name: 'dtifx-core-example',
  event: 'initialising-runtime',
  data: { version: '0.0.1' },
});
```

### Telemetry spans

```ts
import { createTelemetryTracer } from '@dtifx/core/telemetry';

const tracer = createTelemetryTracer({ instrumentation: { name: 'dtifx-core-example' } });
const span = tracer.startSpan('load-config', {
  attributes: { 'config.path': './dtifx.config.mjs' },
});

try {
  // perform work while the span is active
} finally {
  span.end();
}
```

### Policy evaluation

Use the policy helpers to define governance rules, validate DTIF structures, and share policy
metadata across build and audit workflows.

### Token prefabs

Prefab builders streamline the process of emitting serialisable token values with consistent
metadata handling:

```ts
import {
  FontTokenPrefab,
  ImageTokenPrefab,
  PanelTokenPrefab,
  MediaQueryTokenPrefab,
} from '@dtifx/core/prefabs';

const heading = FontTokenPrefab.fromFamily(['fonts', 'heading'], 'Inter')
  .addFallbacks('system-ui')
  .withWeight(600);

const hero = ImageTokenPrefab.responsive(['media', 'hero'], 'hero.png', { pixelRatios: [1, 2, 3] });

const surface = PanelTokenPrefab.create(['components', 'card'], {
  layers: [
    { kind: 'fill', token: 'color.surface' },
    { kind: 'shadow', token: 'shadow.raised', opacity: 0.4 },
  ],
}).withPadding([16, 24]);

const tablet = MediaQueryTokenPrefab.forWidthRange(['queries', 'tablet'], {
  mediaType: 'screen',
  min: 768,
});
```

Each prefab extends the shared `TokenPrefab` base class so you can call `toJSON()` or `toSnapshot()`
and merge the output into larger token graphs.

## Examples

- [Telemetry overview](../../docs/overview/telemetry.md)
- [Audit governance guide](../../docs/guides/audit-governance.md)

## Further reading

- [Core runtime reference](https://dtifx.lapidist.net/reference/core-runtime)
- [Architecture overview](https://dtifx.lapidist.net/overview/architecture)

## License

[MIT](LICENSE)

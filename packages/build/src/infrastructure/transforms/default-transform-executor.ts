import type { BuildTokenSnapshot } from '../../domain/models/tokens.js';
import type {
  TransformExecutorPort,
  TransformExecutorRunOptions,
} from '../../domain/ports/transforms.js';
import type { TransformCache } from '../../transform/transform-cache.js';
import {
  TransformEngine,
  type TransformRegistry,
  type TransformResult,
} from '../../transform/transform-registry.js';

export interface DefaultTransformExecutorOptions {
  readonly registry: TransformRegistry;
  readonly cache?: TransformCache;
}

export class DefaultTransformExecutor implements TransformExecutorPort {
  private readonly engine: TransformEngine;

  constructor(options: DefaultTransformExecutorOptions) {
    this.engine = new TransformEngine({
      registry: options.registry,
      ...(options.cache ? { cache: options.cache } : {}),
    });
  }

  run(
    snapshots: readonly BuildTokenSnapshot[],
    options: TransformExecutorRunOptions = {},
  ): Promise<readonly TransformResult[]> {
    return this.engine.run(snapshots, {
      ...(options.changedPointers ? { changedPointers: options.changedPointers } : {}),
      ...(options.group ? { group: options.group } : {}),
    });
  }
}

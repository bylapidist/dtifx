import { performance } from 'node:perf_hooks';

import type {
  TokenDependencyDiff,
  TokenDependencySnapshot,
} from '../../incremental/token-dependency-cache.js';
import type { BuildResolvedPlan } from '../models/tokens.js';
import type {
  BuildLifecycleObserverPort,
  DependencyDiffStrategyPort,
  DependencySnapshotBuilderPort,
  DependencyStorePort,
  DomainEventBusPort,
} from '../ports/index.js';
import { resolveLifecycleEventBus } from '../events/lifecycle-event-adapter.js';
import {
  SnapshotDependencyDiffStrategy,
  SnapshotDependencySnapshotBuilder,
} from './dependency-strategy-defaults.js';

export interface DependencyTrackingResult {
  readonly snapshot: TokenDependencySnapshot;
  readonly diff: TokenDependencyDiff;
  readonly durationMs: number;
}

export interface DependencyTrackingServiceOptions {
  readonly store?: DependencyStorePort;
  readonly builder?: DependencySnapshotBuilderPort;
  readonly diffStrategy?: DependencyDiffStrategyPort;
  readonly observers?: readonly BuildLifecycleObserverPort[];
  readonly eventBus?: DomainEventBusPort;
}

export class DependencyTrackingService {
  private readonly store: DependencyStorePort | undefined;
  private readonly builder: DependencySnapshotBuilderPort;
  private readonly diffStrategy: DependencyDiffStrategyPort;
  private readonly eventBus: DomainEventBusPort;

  constructor(options: DependencyTrackingServiceOptions = {}) {
    this.store = options.store;
    this.builder = options.builder ?? new SnapshotDependencySnapshotBuilder();
    this.diffStrategy = options.diffStrategy ?? new SnapshotDependencyDiffStrategy();
    this.eventBus = resolveLifecycleEventBus(options.eventBus, options.observers);
  }

  async evaluate(resolved: BuildResolvedPlan): Promise<DependencyTrackingResult> {
    const start = performance.now();
    await this.publishStart();
    try {
      const snapshot = await this.builder.create(resolved);
      const diff = await this.diffStrategy.diff(resolved, snapshot, {
        ...(this.store ? { store: this.store } : {}),
      });
      const durationMs = performance.now() - start;
      await this.publishComplete(durationMs, diff);
      return { snapshot, diff, durationMs } satisfies DependencyTrackingResult;
    } catch (error) {
      await this.publishError(error);
      throw error;
    }
  }

  async commit(snapshot: TokenDependencySnapshot): Promise<void> {
    if (!this.store) {
      return;
    }
    await this.store.commit(snapshot);
  }

  private async publishStart(): Promise<void> {
    await this.eventBus.publish({
      type: 'stage:start',
      payload: {
        stage: 'dependencies',
        timestamp: new Date(),
      },
    });
  }

  private async publishComplete(durationMs: number, diff: TokenDependencyDiff): Promise<void> {
    await this.eventBus.publish({
      type: 'stage:complete',
      payload: {
        stage: 'dependencies',
        timestamp: new Date(),
        attributes: {
          durationMs,
          changedCount: diff.changed.size,
          removedCount: diff.removed.size,
        },
      },
    });
  }

  private async publishError(error: unknown): Promise<void> {
    await this.eventBus.publish({
      type: 'stage:error',
      payload: {
        stage: 'dependencies',
        timestamp: new Date(),
        error,
      },
    });
  }
}

import { performance } from 'node:perf_hooks';

import type {
  BuildErrorEvent,
  BuildLifecycleObserverPort,
  BuildStageEvent,
  DomainEventBusPort,
  TransformExecutorPort,
  TransformationPort,
  TransformationRequest,
  TransformationResponse,
} from '../ports/index.js';
import { resolveLifecycleEventBus } from '../events/lifecycle-event-adapter.js';

export interface TransformationServiceOptions {
  readonly executor: TransformExecutorPort;
  readonly observers?: readonly BuildLifecycleObserverPort[];
  readonly eventBus?: DomainEventBusPort;
}

export type TransformationRunResult = TransformationResponse;

export class TransformationService implements TransformationPort {
  private readonly executor: TransformExecutorPort;
  private readonly eventBus: DomainEventBusPort;

  constructor(options: TransformationServiceOptions) {
    this.executor = options.executor;
    this.eventBus = resolveLifecycleEventBus(options.eventBus, options.observers);
  }

  async run(request: TransformationRequest): Promise<TransformationRunResult> {
    const start = performance.now();
    await this.publishStart();
    try {
      const results = await this.executor.run(request.snapshots, {
        ...(request.changedPointers ? { changedPointers: request.changedPointers } : {}),
        ...(request.group ? { group: request.group } : {}),
      });
      const durationMs = performance.now() - start;
      await this.publishComplete(durationMs, results.length);
      return { results, durationMs } satisfies TransformationRunResult;
    } catch (error) {
      await this.publishError(error);
      throw error;
    }
  }

  private async publishStart(): Promise<void> {
    const event: BuildStageEvent = {
      stage: 'transformation',
      timestamp: new Date(),
    };
    await this.eventBus.publish({ type: 'stage:start', payload: event });
  }

  private async publishComplete(durationMs: number, resultCount: number): Promise<void> {
    const event: BuildStageEvent = {
      stage: 'transformation',
      timestamp: new Date(),
      attributes: { durationMs, resultCount },
    };
    await this.eventBus.publish({ type: 'stage:complete', payload: event });
  }

  private async publishError(error: unknown): Promise<void> {
    const event: BuildErrorEvent = {
      stage: 'transformation',
      timestamp: new Date(),
      error,
    };
    await this.eventBus.publish({ type: 'stage:error', payload: event });
  }
}

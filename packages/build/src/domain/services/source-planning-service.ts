import type { TokenSourcePlanningConfig } from '@dtifx/core/sources';
import { planTokenSources } from '@dtifx/core/sources';

import type { BuildConfig, SourcePlan } from '../../config/index.js';
import type {
  BuildLifecycleObserverPort,
  DomainEventBusPort,
  SchemaValidationPort,
  SourceIssue,
  SourceRepositoryPort,
} from '../ports/index.js';
import { resolveLifecycleEventBus } from '../events/lifecycle-event-adapter.js';

export interface SourcePlanningServiceOptions {
  readonly repository: SourceRepositoryPort;
  readonly validator?: SchemaValidationPort;
  readonly eventBus?: DomainEventBusPort;
  readonly observers?: readonly BuildLifecycleObserverPort[];
}

export interface SourcePlanningResult {
  readonly plan: SourcePlan;
  readonly issues: readonly SourceIssue[];
  readonly durationMs: number;
}

export { UnknownLayerError } from '@dtifx/core/sources';

export class SourcePlanningService {
  private readonly repository: SourceRepositoryPort;
  private readonly validator: SchemaValidationPort | undefined;
  private readonly eventBus: DomainEventBusPort;

  constructor(options: SourcePlanningServiceOptions) {
    this.repository = options.repository;
    this.validator = options.validator;
    this.eventBus = resolveLifecycleEventBus(options.eventBus, options.observers);
  }

  async plan(config: BuildConfig): Promise<SourcePlanningResult> {
    await this.notifyStart();
    try {
      const planningConfig: TokenSourcePlanningConfig = {
        layers: config.layers,
        sources: config.sources,
      } satisfies TokenSourcePlanningConfig;

      const result = await planTokenSources(planningConfig, {
        repository: this.repository,
        ...(this.validator ? { validator: this.validator } : {}),
      });

      await this.notifyComplete(result.durationMs, result.plan.entries.length);

      return {
        plan: result.plan as SourcePlan,
        issues: result.issues as readonly SourceIssue[],
        durationMs: result.durationMs,
      } satisfies SourcePlanningResult;
    } catch (error) {
      await this.notifyError(error);
      throw error;
    }
  }

  private async notifyError(error: unknown): Promise<void> {
    await this.eventBus.publish({
      type: 'stage:error',
      payload: {
        stage: 'planning',
        timestamp: new Date(),
        error,
      },
    });
  }

  private async notifyStart(): Promise<void> {
    await this.eventBus.publish({
      type: 'stage:start',
      payload: {
        stage: 'planning',
        timestamp: new Date(),
      },
    });
  }

  private async notifyComplete(durationMs: number, entryCount: number): Promise<void> {
    await this.eventBus.publish({
      type: 'stage:complete',
      payload: {
        stage: 'planning',
        timestamp: new Date(),
        attributes: { durationMs, entryCount },
      },
    });
  }
}

import { performance } from 'node:perf_hooks';
import type {
  ArtifactWriterPort,
  FormatterExecutorPort,
  FormatterExecution,
  FormatterPlannerPort,
  FormattingRequest,
  FormattingResponse,
} from '../ports/formatters.js';
import type { BuildLifecycleObserverPort, DomainEventBusPort } from '../ports/index.js';
import { resolveLifecycleEventBus } from '../events/lifecycle-event-adapter.js';

export interface FormattingServiceOptions {
  readonly planner: FormatterPlannerPort;
  readonly executor: FormatterExecutorPort;
  readonly writer?: ArtifactWriterPort;
  readonly observers?: readonly BuildLifecycleObserverPort[];
  readonly eventBus?: DomainEventBusPort;
}

export class FormattingService {
  private readonly planner: FormatterPlannerPort;
  private readonly executor: FormatterExecutorPort;
  private readonly writer: ArtifactWriterPort | undefined;
  private readonly eventBus: DomainEventBusPort;

  constructor(options: FormattingServiceOptions) {
    this.planner = options.planner;
    this.executor = options.executor;
    this.writer = options.writer;
    this.eventBus = resolveLifecycleEventBus(options.eventBus, options.observers);
  }

  async run(request: FormattingRequest): Promise<FormattingResponse> {
    const start = performance.now();
    await this.publishStart();
    try {
      const transforms = request.transforms ?? [];
      const plans = request.plans ?? this.planner.plan(request.formatters);
      const { executions, artifacts } = await this.executor.execute({
        plans,
        snapshots: request.snapshots,
        transforms,
      });
      let writes: ReadonlyMap<string, readonly string[]> = new Map();
      if (this.writer && executions.length > 0) {
        writes = await this.writer.write(executions);
      }

      const enrichedExecutions = executions.map((execution) => {
        const written = writes.get(execution.id);
        if (!written || written.length === 0) {
          return execution;
        }
        return {
          ...execution,
          writtenPaths: [...written],
        } satisfies FormatterExecution;
      });

      const durationMs = performance.now() - start;
      await this.publishComplete(durationMs, enrichedExecutions.length, artifacts.length);
      return {
        durationMs,
        executions: enrichedExecutions,
        artifacts,
        writes,
      } satisfies FormattingResponse;
    } catch (error) {
      await this.publishError(error);
      throw error;
    }
  }

  private async publishStart(): Promise<void> {
    await this.eventBus.publish({
      type: 'stage:start',
      payload: {
        stage: 'formatting',
        timestamp: new Date(),
      },
    });
  }

  private async publishComplete(
    durationMs: number,
    formatterCount: number,
    artifactCount: number,
  ): Promise<void> {
    await this.eventBus.publish({
      type: 'stage:complete',
      payload: {
        stage: 'formatting',
        timestamp: new Date(),
        attributes: { durationMs, formatterCount, artifactCount },
      },
    });
  }

  private async publishError(error: unknown): Promise<void> {
    await this.eventBus.publish({
      type: 'stage:error',
      payload: {
        stage: 'formatting',
        timestamp: new Date(),
        error,
      },
    });
  }
}

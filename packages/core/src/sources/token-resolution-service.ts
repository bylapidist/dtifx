import { performance } from 'node:perf_hooks';

import type { TokenSourcePlan } from './config.js';
import type { TokenResolvedPlan } from './resolution-types.js';
import type { ParserExecutionOptions, ParserMetrics, ParserPort, ParserResult } from './parser.js';
import type { BuildLifecycleObserverPort, DomainEventBusPort } from '../runtime/index.js';
import { resolveLifecycleEventBus } from '../runtime/lifecycle-event-adapter.js';

export interface TokenResolutionServiceOptions
  extends Omit<ParserExecutionOptions, 'documentCache' | 'tokenCache'> {
  readonly parser: ParserPort;
  readonly documentCache?: ParserExecutionOptions['documentCache'];
  readonly tokenCache?: ParserExecutionOptions['tokenCache'];
  readonly observers?: readonly BuildLifecycleObserverPort[];
  readonly eventBus?: DomainEventBusPort;
}

export class TokenResolutionService {
  private readonly parser: ParserPort;
  private readonly parserOptions: ParserExecutionOptions;
  private readonly eventBus: DomainEventBusPort;
  private readonly consumeParserMetrics: (() => ParserMetrics | undefined) | undefined;
  private lastMetrics: ParserMetrics | undefined;

  constructor(options: TokenResolutionServiceOptions) {
    this.parser = options.parser;
    this.parserOptions = {
      flatten: options.flatten ?? true,
      includeGraphs: options.includeGraphs ?? true,
      ...(options.sessionOptions ? { sessionOptions: options.sessionOptions } : {}),
      ...(options.documentCache ? { documentCache: options.documentCache } : {}),
      ...(options.tokenCache ? { tokenCache: options.tokenCache } : {}),
      ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
    } satisfies ParserExecutionOptions;
    this.eventBus = resolveLifecycleEventBus(options.eventBus, options.observers);
    this.consumeParserMetrics = this.createMetricsConsumer(options.parser);
    this.lastMetrics = undefined;
  }

  async resolve(plan: TokenSourcePlan): Promise<TokenResolvedPlan> {
    const start = performance.now();
    await this.eventBus.publish({
      type: 'stage:start',
      payload: {
        stage: 'resolution',
        timestamp: new Date(),
      },
    });
    let parserResult: ParserResult;
    try {
      this.lastMetrics = undefined;
      parserResult = await this.parser.parse(plan, this.parserOptions);
    } catch (error) {
      await this.eventBus.publish({
        type: 'stage:error',
        payload: {
          stage: 'resolution',
          timestamp: new Date(),
          error,
        },
      });
      throw error;
    }
    const resolved: TokenResolvedPlan = {
      entries: parserResult.sources,
      diagnostics: parserResult.diagnostics,
      resolvedAt: new Date(),
      snapshots: parserResult.snapshots,
      metadata: parserResult.metadata,
      resolutions: parserResult.resolutions,
    } satisfies TokenResolvedPlan;
    const parserMetrics = this.consumeParserMetrics?.();
    if (parserMetrics) {
      this.lastMetrics = parserMetrics;
    }
    const durationMs = performance.now() - start;
    await this.eventBus.publish({
      type: 'stage:complete',
      payload: {
        stage: 'resolution',
        timestamp: new Date(),
        attributes: {
          durationMs,
          entryCount: resolved.entries.length,
          ...(this.lastMetrics ? { parserMetrics: this.lastMetrics } : {}),
        },
      },
    });
    return resolved;
  }

  consumeMetrics(): ParserMetrics | undefined {
    if (this.lastMetrics) {
      const metrics = this.lastMetrics;
      this.lastMetrics = undefined;
      return metrics;
    }

    return undefined;
  }

  private createMetricsConsumer(parser: ParserPort): (() => ParserMetrics | undefined) | undefined {
    const candidate = parser as ParserPort & {
      readonly consumeMetrics?: () => ParserMetrics | undefined;
    };
    if (typeof candidate.consumeMetrics === 'function') {
      return () => candidate.consumeMetrics?.();
    }

    return undefined;
  }
}

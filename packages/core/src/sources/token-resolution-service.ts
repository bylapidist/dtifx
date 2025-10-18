import { performance } from 'node:perf_hooks';

import type { TokenSourcePlan } from './config.js';
import type { TokenResolvedPlan } from './resolution-types.js';
import type { ParserExecutionOptions, ParserPort, ParserResult } from './parser.js';
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
    } satisfies TokenResolvedPlan;
    const durationMs = performance.now() - start;
    await this.eventBus.publish({
      type: 'stage:complete',
      payload: {
        stage: 'resolution',
        timestamp: new Date(),
        attributes: { durationMs, entryCount: resolved.entries.length },
      },
    });
    return resolved;
  }
}

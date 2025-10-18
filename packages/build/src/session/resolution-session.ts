import type { ParseSessionOptions } from '@lapidist/dtif-parser';

import type { SourcePlan } from '../config/index.js';
import type {
  BuildResolvedPlan,
  BuildResolvedSource,
  BuildTokenSnapshot,
  ResolutionCacheStatus as DomainResolutionCacheStatus,
} from '../domain/models/tokens.js';
import type {
  BuildLifecycleObserverPort,
  DocumentCachePort,
  DomainEventBusPort,
  ParserPort,
  TokenCachePort,
} from '../domain/ports/index.js';
import { TokenResolutionService } from '../domain/services/token-resolution-service.js';
import type { TokenResolutionServiceOptions } from '../domain/services/token-resolution-service.js';
import {
  DefaultParserAdapter,
  type DefaultParserAdapterOptions,
  type ParserMetrics,
} from '../infrastructure/resolution/default-parser.js';

export type TokenSnapshot = BuildTokenSnapshot;
export type ResolvedSourceEntry = BuildResolvedSource;
export type ResolvedPlan = BuildResolvedPlan;
export type ResolutionCacheStatus = DomainResolutionCacheStatus;
export type ResolutionMetrics = ParserMetrics;

export interface ResolutionSessionOptions {
  readonly parser?: ParserPort;
  readonly documentCache?: DocumentCachePort;
  readonly tokenCache?: TokenCachePort;
  readonly session?: ParseSessionOptions;
  readonly includeGraphs?: boolean;
  readonly flatten?: boolean;
  readonly observers?: readonly BuildLifecycleObserverPort[];
  readonly eventBus?: DomainEventBusPort;
}

export class ResolutionSession {
  private readonly service: TokenResolutionService;
  private readonly consumeMetricsFn: () => ParserMetrics | undefined;

  constructor(options: ResolutionSessionOptions = {}) {
    const parser = options.parser ?? this.createDefaultParser(options);
    this.consumeMetricsFn = this.createMetricsConsumer(parser);
    const serviceOptions: TokenResolutionServiceOptions = {
      parser,
      ...(options.flatten === undefined ? {} : { flatten: options.flatten }),
      ...(options.includeGraphs === undefined ? {} : { includeGraphs: options.includeGraphs }),
      ...(options.session ? { sessionOptions: options.session } : {}),
      ...(options.documentCache ? { documentCache: options.documentCache } : {}),
      ...(options.tokenCache ? { tokenCache: options.tokenCache } : {}),
      ...(options.observers ? { observers: options.observers } : {}),
      ...(options.eventBus ? { eventBus: options.eventBus } : {}),
    } satisfies TokenResolutionServiceOptions;
    this.service = new TokenResolutionService(serviceOptions);
  }

  async resolve(plan: SourcePlan): Promise<ResolvedPlan> {
    return this.service.resolve(plan);
  }

  consumeMetrics(): ResolutionMetrics | undefined {
    return this.consumeMetricsFn();
  }

  private createDefaultParser(options: ResolutionSessionOptions): DefaultParserAdapter {
    const adapterOptions: DefaultParserAdapterOptions = {
      ...(options.documentCache ? { documentCache: options.documentCache } : {}),
      ...(options.tokenCache ? { tokenCache: options.tokenCache } : {}),
      ...(options.session ? { sessionOptions: options.session } : {}),
      ...(options.includeGraphs === undefined ? {} : { includeGraphs: options.includeGraphs }),
      ...(options.flatten === undefined ? {} : { flatten: options.flatten }),
    } satisfies DefaultParserAdapterOptions;
    return new DefaultParserAdapter(adapterOptions);
  }

  private createMetricsConsumer(parser: ParserPort): () => ParserMetrics | undefined {
    const candidate = parser as ParserPort & {
      readonly consumeMetrics?: () => ParserMetrics | undefined;
    };
    if (typeof candidate.consumeMetrics === 'function') {
      return () => candidate.consumeMetrics?.();
    }
    return () => undefined as ParserMetrics | undefined;
  }
}

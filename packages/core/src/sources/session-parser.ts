import { performance } from 'node:perf_hooks';

import {
  JSON_POINTER_ROOT,
  appendJsonPointer,
  application,
  createDocumentResolver,
  createSession,
  InMemoryDocumentCache,
  InMemoryTokenCache,
  splitJsonPointer,
  type DocumentCache,
  type DocumentGraph,
  type DocumentResolver,
  type DtifFlattenedToken,
  type GraphTokenNode,
  type JsonPointer,
  type ParseSessionOptions,
  type TokenCache,
  type TokenId,
  type TokenPointer as DtifTokenPointer,
  type ResolvedTokenView,
} from '@lapidist/dtif-parser';
import type { domain as dtifDomain } from '@lapidist/dtif-parser';
import { sanitizeDiagnosticMessage } from '../instrumentation/parser-hooks.js';
import type { DiagnosticEvent, DiagnosticsPort } from '../instrumentation/diagnostics.js';
import { DiagnosticScopes } from '../instrumentation/diagnostics.js';
import { convertParserDiagnostic } from '../instrumentation/parser-diagnostics.js';
import {
  cloneTokenExtensions,
  cloneTokenValue,
  createDefaultSourceLocation,
  createTokenSetFromParseResult,
  createTokenPointer,
  type TokenPointer as CoreTokenPointer,
  type TokenResolution,
  type TokenSet,
  type TokenSetResolver,
  type TokenSnapshotContext,
  type TokenSnapshotDraft,
} from '../tokens/index.js';
import type { TokenSourcePlan } from './config.js';
import type {
  ParserExecutionOptions,
  ParserMetrics,
  ParserPort,
  ParserResult,
  SessionTokenParserOptions,
} from './parser-ports.js';
import type {
  TokenMetadataSnapshot,
  TokenResolutionCacheStatus,
  TokenResolutionSnapshot,
  TokenResolvedSource,
} from './resolution-types.js';

interface SnapshotMeta {
  readonly planned: TokenSourcePlan['entries'][number];
  readonly pointerPrefix: JsonPointer;
  readonly baseUri: URL;
  readonly flattenedByPointer: ReadonlyMap<JsonPointer, DtifFlattenedToken>;
  readonly metadataIndex: ReadonlyMap<TokenId, TokenMetadataSnapshot>;
  readonly resolutionIndex: ReadonlyMap<TokenId, ResolvedTokenView>;
}

type TokensUseCaseInstance = ReturnType<typeof application.createParseTokensUseCase>;
type TokensExecution = Awaited<ReturnType<TokensUseCaseInstance['execute']>>;

interface BuildTokenSetOptions {
  readonly planned: TokenSourcePlan['entries'][number];
  readonly execution: TokensExecution;
  readonly pointerPrefix: JsonPointer;
  readonly exposeGraphs: boolean;
  readonly flatten: boolean;
  readonly diagnostics?: DiagnosticsPort | undefined;
}

function normaliseUri(value: string): URL {
  try {
    return new URL(value);
  } catch {
    return new URL(value, 'file:///');
  }
}

function normaliseUriWithBase(value: string, base: URL): URL {
  try {
    return new URL(value);
  } catch {
    return new URL(value, base);
  }
}

function combinePointer(prefix: JsonPointer, pointer: JsonPointer): JsonPointer {
  if (prefix === JSON_POINTER_ROOT) {
    return pointer;
  }

  if (pointer === JSON_POINTER_ROOT) {
    return prefix;
  }

  const segments = splitJsonPointer(pointer);
  if (segments.length === 0) {
    return prefix;
  }

  return appendJsonPointer(prefix, ...segments);
}

function convertTokenPointer(pointer: DtifTokenPointer, baseUri: URL): CoreTokenPointer {
  const targetUri = normaliseUriWithBase(pointer.uri, baseUri);
  const external = targetUri.href !== baseUri.href;
  return createTokenPointer(pointer.pointer, targetUri, external);
}

function convertTokenPointers(
  pointers: readonly DtifTokenPointer[] | undefined,
  baseUri: URL,
): readonly CoreTokenPointer[] {
  if (!pointers || pointers.length === 0) {
    return [];
  }
  return pointers.map((pointer) => convertTokenPointer(pointer, baseUri));
}

function extendMetadataWithNodeFields(
  metadata: TokenMetadataSnapshot,
  nodeMetadata: GraphTokenNode['metadata'],
): TokenMetadataSnapshot {
  const additions: {
    lastModified?: string;
    lastUsed?: string;
    usageCount?: number;
    author?: string;
    tags?: readonly string[];
    hash?: string;
  } = {};

  const lastModified = nodeMetadata.lastModified?.value;
  if (lastModified !== undefined) {
    additions.lastModified = lastModified;
  }

  const lastUsed = nodeMetadata.lastUsed?.value;
  if (lastUsed !== undefined) {
    additions.lastUsed = lastUsed;
  }

  const usageCount = nodeMetadata.usageCount?.value;
  if (usageCount !== undefined) {
    additions.usageCount = usageCount;
  }

  const author = nodeMetadata.author?.value;
  if (author !== undefined) {
    additions.author = author;
  }

  const tags = nodeMetadata.tags?.value;
  if (tags !== undefined) {
    additions.tags = tags;
  }

  const hash = nodeMetadata.hash?.value;
  if (hash !== undefined) {
    additions.hash = hash;
  }

  if (Object.keys(additions).length === 0) {
    return metadata;
  }

  return { ...metadata, ...additions } satisfies TokenMetadataSnapshot;
}

function dedupeDiagnostics(diagnostics: readonly DiagnosticEvent[]): DiagnosticEvent[] {
  const map = new Map<string, DiagnosticEvent>();

  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.level,
      diagnostic.code,
      diagnostic.message,
      diagnostic.pointer ?? '',
      diagnostic.span?.start?.line ?? -1,
      diagnostic.span?.start?.column ?? -1,
      diagnostic.span?.end?.line ?? -1,
      diagnostic.span?.end?.column ?? -1,
    ].join('|');
    map.set(key, diagnostic);
  }

  return [...map.values()];
}

export class SessionTokenParser implements ParserPort {
  private readonly baseDocumentCache: DocumentCache;
  private readonly baseTokenCache: TokenCache;
  private readonly defaultSessionOptions: ParseSessionOptions;
  private readonly defaultIncludeGraphs: boolean;
  private readonly defaultFlatten: boolean;
  private lastMetrics: ParserMetrics | undefined;

  constructor(options: SessionTokenParserOptions = {}) {
    this.baseDocumentCache = options.documentCache ?? new InMemoryDocumentCache();
    this.baseTokenCache = options.tokenCache ?? new InMemoryTokenCache();
    this.defaultSessionOptions = options.sessionOptions ? { ...options.sessionOptions } : {};
    this.defaultIncludeGraphs = options.includeGraphs ?? true;
    this.defaultFlatten = options.flatten ?? true;
  }

  async parse(plan: TokenSourcePlan, options: ParserExecutionOptions): Promise<ParserResult> {
    const includeGraphs = options.includeGraphs ?? this.defaultIncludeGraphs;
    const flatten = options.flatten ?? this.defaultFlatten;
    const exposeGraphs = includeGraphs || flatten;

    const documentCache = options.documentCache ?? this.baseDocumentCache;
    const tokenCache = options.tokenCache ?? this.baseTokenCache;

    const sessionOptions: ParseSessionOptions = {
      ...this.defaultSessionOptions,
      ...options.sessionOptions,
      ...(documentCache ? { documentCache } : {}),
    } satisfies ParseSessionOptions;

    const session = createSession(sessionOptions);
    const resolvedOptions = session.options;
    const documents = application.createParseDocumentUseCase({
      ...resolvedOptions,
      ...(documentCache ? { documentCache } : {}),
    });
    const tokens = application.createParseTokensUseCase(documents, resolvedOptions, tokenCache);

    const sources: TokenResolvedSource[] = [];
    const snapshots: TokenResolutionSnapshot[] = [];
    const aggregatedDiagnostics: DiagnosticEvent[] = [];
    const metadataIndex = new Map<TokenId, TokenMetadataSnapshot>();
    const resolutionIndex = new Map<TokenId, ResolvedTokenView>();
    const totalStart = performance.now();
    let parseMs = 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    let cacheSkipped = 0;

    for (const planned of plan.entries) {
      const entryParseStart = performance.now();
      const execution = await tokens.execute({
        request: {
          uri: planned.uri,
          inlineData: planned.document,
          contentTypeHint: 'application/json',
        },
        flatten,
        includeGraphs: exposeGraphs,
      });
      parseMs += performance.now() - entryParseStart;

      const diagnostics = this.collectDiagnostics(execution, {
        diagnostics: options.diagnostics,
      });
      aggregatedDiagnostics.push(...diagnostics);

      const { tokens: resolvedTokens, tokenSet } = this.buildTokenArtifacts({
        planned,
        execution,
        pointerPrefix: planned.pointerPrefix,
        exposeGraphs,
        flatten,
        diagnostics: options.diagnostics,
      });

      for (const snapshot of resolvedTokens) {
        snapshots.push(snapshot);
        if (snapshot.metadata) {
          metadataIndex.set(snapshot.id, snapshot.metadata);
        }
        if (snapshot.resolution) {
          resolutionIndex.set(snapshot.id, snapshot.resolution);
        }
      }

      if (execution.tokens?.token.metadataIndex) {
        for (const [tokenId, metadata] of execution.tokens.token.metadataIndex) {
          if (!metadataIndex.has(tokenId)) {
            metadataIndex.set(tokenId, metadata as TokenMetadataSnapshot);
          }
        }
      }

      if (execution.tokens?.token.resolutionIndex) {
        for (const [tokenId, resolution] of execution.tokens.token.resolutionIndex) {
          if (!resolutionIndex.has(tokenId)) {
            resolutionIndex.set(tokenId, resolution);
          }
        }
      }

      let cacheStatus: TokenResolutionCacheStatus = 'skip';
      if (tokenCache) {
        cacheStatus = execution.tokensFromCache ? 'hit' : 'miss';
      }

      if (cacheStatus === 'hit') {
        cacheHits += 1;
      } else if (cacheStatus === 'miss') {
        cacheMisses += 1;
      } else {
        cacheSkipped += 1;
      }

      sources.push({
        sourceId: planned.id,
        pointerPrefix: planned.pointerPrefix,
        layer: planned.layer,
        layerIndex: planned.layerIndex,
        uri: planned.uri,
        context: planned.context,
        tokens: resolvedTokens,
        tokenSet,
        diagnostics,
        metadataIndex: execution.tokens?.token.metadataIndex ?? new Map(),
        resolutionIndex: execution.tokens?.token.resolutionIndex ?? new Map(),
        ...(exposeGraphs && execution.document ? { document: execution.document } : {}),
        ...(exposeGraphs && execution.graph ? { graph: execution.graph.graph } : {}),
        ...(exposeGraphs && execution.resolution ? { resolver: execution.resolution.result } : {}),
        cacheStatus,
      });
    }

    const totalMs = performance.now() - totalStart;
    this.lastMetrics = {
      entryCount: plan.entries.length,
      totalMs,
      parseMs,
      cache: {
        hits: cacheHits,
        misses: cacheMisses,
        skipped: cacheSkipped,
      },
    } satisfies ParserMetrics;

    return {
      sources,
      snapshots,
      diagnostics: dedupeDiagnostics(aggregatedDiagnostics),
      metadata: metadataIndex,
      resolutions: resolutionIndex,
    } satisfies ParserResult;
  }

  consumeMetrics(): ParserMetrics | undefined {
    const metrics = this.lastMetrics;
    this.lastMetrics = undefined;
    return metrics;
  }

  private collectDiagnostics(
    execution: TokensExecution,
    context: { readonly diagnostics?: DiagnosticsPort | undefined },
  ): DiagnosticEvent[] {
    const diagnostics = [...execution.diagnostics];

    const tokenDiagnostics = execution.tokens?.token.diagnostics ?? [];
    if (tokenDiagnostics.length > 0) {
      diagnostics.push(...tokenDiagnostics);
    }

    const converted = diagnostics.map((diagnostic) =>
      convertParserDiagnostic(
        typeof diagnostic.message === 'string'
          ? { ...diagnostic, message: sanitizeDiagnosticMessage(diagnostic.message) }
          : diagnostic,
      ),
    );

    if (context.diagnostics) {
      for (const event of converted) {
        void context.diagnostics.emit({
          ...event,
          scope: event.scope ?? DiagnosticScopes.tokenSourceSession,
        });
      }
    }

    return converted;
  }

  private buildTokenArtifacts(options: BuildTokenSetOptions): {
    readonly tokens: TokenResolutionSnapshot[];
    readonly tokenSet: TokenSet;
  } {
    const { planned, execution, pointerPrefix, exposeGraphs, flatten, diagnostics } = options;
    const flattenedTokens = flatten ? (execution.tokens?.token.flattened ?? []) : [];
    const metadataIndex = execution.tokens?.token.metadataIndex ?? new Map();
    const resolutionIndex = execution.tokens?.token.resolutionIndex ?? new Map();
    const baseUri = normaliseUri(planned.uri);
    const flattenedByPointer = new Map<JsonPointer, DtifFlattenedToken>();

    for (const token of flattenedTokens) {
      flattenedByPointer.set(token.pointer, token);
    }

    const tokenSetFromResult = createTokenSetFromParseResult<TokenResolutionSnapshot, SnapshotMeta>(
      this.toParseDocumentResult(execution, exposeGraphs),
      {
        source: planned.uri,
        meta: {
          planned,
          pointerPrefix,
          baseUri,
          flattenedByPointer,
          metadataIndex: metadataIndex as ReadonlyMap<TokenId, TokenMetadataSnapshot>,
          resolutionIndex,
        },
        extendSnapshot: (
          snapshot: TokenSnapshotDraft,
          context: TokenSnapshotContext<SnapshotMeta>,
        ) => this.extendSnapshotWithMeta(snapshot, context),
        ...(diagnostics
          ? {
              onDiagnostic: (diagnostic: dtifDomain.DiagnosticEvent) => {
                const sanitized =
                  typeof diagnostic.message === 'string'
                    ? { ...diagnostic, message: sanitizeDiagnosticMessage(diagnostic.message) }
                    : diagnostic;
                void diagnostics.emit({
                  ...convertParserDiagnostic(sanitized),
                  scope: DiagnosticScopes.tokenSourceSession,
                });
              },
            }
          : {}),
        createDocumentResolver: createDocumentResolver,
      },
    );

    const tokens: TokenResolutionSnapshot[] = [];

    for (const token of flattenedTokens) {
      const snapshot = tokenSetFromResult.tokens.get(token.id);
      if (snapshot) {
        tokens.push(snapshot as TokenResolutionSnapshot);
      }
    }

    const tokenSet = this.createTokenSet(planned, tokens, {
      ...(exposeGraphs && execution.document ? { document: execution.document } : {}),
      ...(exposeGraphs && execution.graph ? { graph: execution.graph.graph } : {}),
      ...(exposeGraphs && execution.resolution ? { resolver: execution.resolution.result } : {}),
    });

    return { tokens, tokenSet };
  }

  private extendSnapshotWithMeta(
    snapshot: TokenSnapshotDraft,
    context: TokenSnapshotContext<SnapshotMeta>,
  ): TokenResolutionSnapshot | void {
    const flattenedToken = context.meta.flattenedByPointer.get(context.node.pointer as JsonPointer);

    if (!flattenedToken) {
      return undefined;
    }

    const metadata = context.meta.metadataIndex.get(flattenedToken.id) as
      | TokenMetadataSnapshot
      | undefined;
    const resolvedMetadata = metadata
      ? extendMetadataWithNodeFields(metadata, context.node.metadata)
      : undefined;
    const resolution = context.meta.resolutionIndex.get(flattenedToken.id);
    const pointer = combinePointer(context.meta.pointerPrefix, flattenedToken.pointer);
    const references = convertTokenPointers(resolution?.references, context.meta.baseUri);
    const resolutionPath = convertTokenPointers(resolution?.resolutionPath, context.meta.baseUri);
    const appliedAliases = convertTokenPointers(resolution?.appliedAliases, context.meta.baseUri);
    const deprecated = resolvedMetadata?.deprecated
      ? {
          ...resolvedMetadata.deprecated,
          ...(resolvedMetadata.deprecated.supersededBy
            ? {
                supersededBy: convertTokenPointer(
                  resolvedMetadata.deprecated.supersededBy,
                  context.meta.baseUri,
                ),
              }
            : {}),
        }
      : snapshot.deprecated;
    const source =
      resolvedMetadata?.source ??
      snapshot.source ??
      createDefaultSourceLocation(context.meta.baseUri);

    return {
      ...snapshot,
      value: cloneTokenValue(resolution?.value ?? flattenedToken.value ?? snapshot.value),
      raw: cloneTokenValue(resolution?.raw ?? flattenedToken.raw ?? snapshot.raw),
      extensions: cloneTokenExtensions(resolvedMetadata?.extensions ?? snapshot.extensions),
      ...(resolvedMetadata?.description && !snapshot.description
        ? { description: resolvedMetadata.description }
        : {}),
      ...(deprecated ? { deprecated } : {}),
      references: references.length > 0 ? references : snapshot.references,
      resolutionPath: resolutionPath.length > 0 ? resolutionPath : snapshot.resolutionPath,
      appliedAliases: appliedAliases.length > 0 ? appliedAliases : snapshot.appliedAliases,
      source,
      pointer,
      sourcePointer: flattenedToken.pointer,
      token: flattenedToken,
      ...(resolvedMetadata ? { metadata: resolvedMetadata } : {}),
      ...(resolution ? { resolution } : {}),
      provenance: {
        sourceId: context.meta.planned.id,
        layer: context.meta.planned.layer,
        layerIndex: context.meta.planned.layerIndex,
        uri: context.meta.planned.uri,
        pointerPrefix: context.meta.pointerPrefix,
      },
      context: context.meta.planned.context,
    } satisfies TokenResolutionSnapshot;
  }

  private createTokenSet(
    planned: TokenSourcePlan['entries'][number],
    tokens: readonly TokenResolutionSnapshot[],
    context: {
      readonly document?: TokensExecution['document'];
      readonly graph?: DocumentGraph;
      readonly resolver?: DocumentResolver;
    },
  ): TokenSet {
    const entries = tokens.map((token) => [token.id, token] as const);
    const baseSet: TokenSet = {
      tokens: new Map(entries),
      source: planned.uri,
      ...(context.document ? { document: context.document } : {}),
      ...(context.graph ? { graph: context.graph } : {}),
    } satisfies TokenSet;

    if (!context.resolver) {
      return baseSet;
    }

    return {
      ...baseSet,
      resolver: this.createTokenSetResolver(context.resolver),
    } satisfies TokenSet;
  }

  private createTokenSetResolver(resolver: DocumentResolver): TokenSetResolver {
    return {
      resolve: (pointer: string): TokenResolution => {
        const result = resolver.resolve(pointer as JsonPointer);
        const token = result.token;
        const diagnostics = result.diagnostics.map((diagnostic) =>
          convertParserDiagnostic(
            typeof diagnostic.message === 'string'
              ? { ...diagnostic, message: sanitizeDiagnosticMessage(diagnostic.message) }
              : diagnostic,
          ),
        );

        return {
          ...(token
            ? {
                token: {
                  pointer: token.pointer,
                  uri: token.uri,
                  ...(token.type === undefined ? {} : { type: token.type }),
                  ...(token.value === undefined ? {} : { value: cloneTokenValue(token.value) }),
                  ...(token.source
                    ? {
                        source: {
                          uri: token.source.uri,
                          ...(token.source.pointer === undefined
                            ? {}
                            : { pointer: token.source.pointer }),
                        },
                      }
                    : {}),
                  warnings: [...token.warnings],
                  overridesApplied: token.overridesApplied.map((override) => ({ ...override })),
                  trace: token.trace.map((step) => ({ pointer: step.pointer, kind: step.kind })),
                  toJSON: () => token.toJSON(),
                },
              }
            : {}),
          diagnostics,
          transforms: [...result.transforms],
        } satisfies TokenResolution;
      },
    } satisfies TokenSetResolver;
  }

  private toParseDocumentResult(
    execution: TokensExecution,
    exposeGraphs: boolean,
  ): Parameters<typeof createTokenSetFromParseResult>[0] {
    return {
      ...(exposeGraphs && execution.document ? { document: execution.document } : {}),
      ...(exposeGraphs && execution.graph ? { graph: execution.graph } : {}),
      ...(exposeGraphs && execution.resolution ? { resolution: execution.resolution } : {}),
    } as Parameters<typeof createTokenSetFromParseResult>[0];
  }
}

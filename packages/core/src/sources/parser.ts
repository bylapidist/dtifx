import { performance } from 'node:perf_hooks';

import type {
  DocumentCache,
  DocumentGraph,
  DocumentResolverOptions,
  DtifFlattenedToken,
  AstField,
  GraphAliasNode,
  GraphCollectionNode,
  GraphNode,
  GraphOverrideFallbackNode,
  GraphOverrideNode,
  GraphReferenceField,
  GraphReferenceTarget,
  GraphTokenNode,
  JsonPointer,
  ParseSessionOptions,
  ParseTokensResult,
  RawDocument,
  ResolvedTokenView,
  TokenCache,
  TokenCacheKey,
  TokenCacheSnapshot,
  TokenId,
  TokenPointer as DtifTokenPointer,
  ParseTokensInput,
} from '@lapidist/dtif-parser';
import {
  DefaultDocumentLoader,
  DocumentResolver,
  JSON_POINTER_ROOT,
  InMemoryDocumentCache,
  InMemoryTokenCache,
  appendJsonPointer,
  createDocumentResolver,
  parseTokens,
  splitJsonPointer,
} from '@lapidist/dtif-parser';
import type { domain as dtifDomain } from '@lapidist/dtif-parser';
import type { DiagnosticEvent, DiagnosticsPort } from '../instrumentation/diagnostics.js';
import { DiagnosticScopes } from '../instrumentation/diagnostics.js';
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
  type TokenSnapshot,
  type TokenSnapshotContext,
  type TokenSnapshotDraft,
} from '../tokens/index.js';
import {
  createDiagnosticsAwareParserHooks,
  sanitizeDiagnosticMessage,
} from '../instrumentation/parser-hooks.js';
import { convertParserDiagnostic } from '../instrumentation/parser-diagnostics.js';

import type { TokenSourcePlan } from './config.js';
import type {
  TokenResolvedSource,
  TokenResolutionCacheStatus,
  TokenResolutionSnapshot,
  TokenMetadataSnapshot,
} from './resolution-types.js';

const CACHE_STATUS_HIT = 'hit';
const CACHE_STATUS_MISS = 'miss';
const CACHE_STATUS_SKIP = 'skip';

type ParserDiagnostic = dtifDomain.DiagnosticEvent;

interface BuildSnapshotMeta {
  readonly planned: TokenSourcePlan['entries'][number];
  readonly pointerPrefix: JsonPointer;
  readonly baseUri: URL;
  readonly flattenedByPointer: ReadonlyMap<JsonPointer, DtifFlattenedToken>;
  readonly metadataIndex: ReadonlyMap<TokenId, TokenMetadataSnapshot>;
  readonly resolutionIndex: ReadonlyMap<TokenId, ResolvedTokenView>;
}

interface ParseResultContext {
  readonly document?: RawDocument;
  readonly graph?: DocumentGraph;
  readonly resolver?: DocumentResolver;
  readonly resolverFactory?: (
    graph: DocumentGraph,
    options: DocumentResolverOptions,
  ) => DocumentResolver;
  readonly pointerIndex?: ReadonlyMap<JsonPointer, PointerIndexEntry>;
  readonly metadataIndex?: ReadonlyMap<TokenId, TokenMetadataSnapshot>;
  readonly resolutionIndex?: ReadonlyMap<TokenId, ResolvedTokenView>;
  readonly cacheStatuses?: readonly TokenResolutionCacheStatus[];
}

interface PointerIndexEntry {
  readonly uri: URL;
  readonly external: boolean;
}

interface ExternalDocumentArtifacts {
  readonly graph: DocumentGraph;
  readonly metadataIndex: ReadonlyMap<TokenId, TokenMetadataSnapshot>;
  readonly resolutionIndex: ReadonlyMap<TokenId, ResolvedTokenView>;
}

class CompositeDocumentResolver extends DocumentResolver {
  constructor(
    graph: DocumentGraph,
    options: DocumentResolverOptions,
    private readonly pointerIndex: ReadonlyMap<JsonPointer, PointerIndexEntry>,
  ) {
    super(graph, options);
  }

  getPointerIndex(): ReadonlyMap<JsonPointer, PointerIndexEntry> {
    return this.pointerIndex;
  }
}

export interface DefaultParserAdapterOptions {
  readonly documentCache?: DocumentCache;
  readonly tokenCache?: TokenCache;
  readonly sessionOptions?: ParseSessionOptions;
  readonly includeGraphs?: boolean;
  readonly flatten?: boolean;
}

export interface ParserMetrics {
  readonly entryCount: number;
  readonly totalMs: number;
  readonly parseMs: number;
  readonly cache: {
    readonly hits: number;
    readonly misses: number;
    readonly skipped: number;
  };
}

export type DocumentCachePort = DocumentCache;

export type TokenCachePort = TokenCache;

export interface ParserExecutionOptions {
  readonly flatten?: boolean;
  readonly includeGraphs?: boolean;
  readonly sessionOptions?: ParseSessionOptions;
  readonly documentCache?: DocumentCachePort;
  readonly tokenCache?: TokenCachePort;
  readonly diagnostics?: DiagnosticsPort;
}

export interface ParserResult {
  readonly sources: readonly TokenResolvedSource[];
  readonly snapshots: readonly TokenResolutionSnapshot[];
  readonly diagnostics: readonly DiagnosticEvent[];
  readonly metadata: ReadonlyMap<TokenId, TokenMetadataSnapshot>;
  readonly resolutions: ReadonlyMap<TokenId, ResolvedTokenView>;
}

export interface ParserPort {
  parse(plan: TokenSourcePlan, options: ParserExecutionOptions): Promise<ParserResult>;
}

class InstrumentedCache implements TokenCache {
  private lastStatus: TokenResolutionCacheStatus = CACHE_STATUS_MISS;
  private accessed = false;

  constructor(private readonly inner: TokenCache) {}

  async get(key: TokenCacheKey): Promise<TokenCacheSnapshot | undefined> {
    const value = await this.ensureAsync(this.inner.get(key));
    this.accessed = true;
    this.lastStatus = value ? CACHE_STATUS_HIT : CACHE_STATUS_MISS;
    return value ?? undefined;
  }

  async set(key: TokenCacheKey, value: TokenCacheSnapshot): Promise<void> {
    this.accessed = true;
    await this.ensureAsync(this.inner.set(key, value));
  }

  consumeStatus(): TokenResolutionCacheStatus {
    const status = this.accessed ? this.lastStatus : CACHE_STATUS_SKIP;
    this.lastStatus = CACHE_STATUS_MISS;
    this.accessed = false;
    return status;
  }

  private async ensureAsync<T>(value: T | Promise<T>): Promise<T> {
    return value instanceof Promise ? await value : value;
  }
}

export class DefaultParserAdapter implements ParserPort {
  private readonly baseDocumentCache: DocumentCache;
  private readonly baseTokenCache: TokenCache;
  private readonly defaultSessionOptions: ParseSessionOptions;
  private readonly defaultIncludeGraphs: boolean;
  private readonly defaultFlatten: boolean;
  private lastMetrics: ParserMetrics | undefined;
  private readonly externalDocumentArtifacts = new Map<string, ExternalDocumentArtifacts>();

  constructor(options: DefaultParserAdapterOptions = {}) {
    this.baseDocumentCache = options.documentCache ?? new InMemoryDocumentCache();
    this.baseTokenCache = options.tokenCache ?? new InMemoryTokenCache();
    this.defaultSessionOptions = options.sessionOptions ? { ...options.sessionOptions } : {};
    this.defaultIncludeGraphs = options.includeGraphs ?? true;
    this.defaultFlatten = options.flatten ?? true;
  }

  async parse(plan: TokenSourcePlan, options: ParserExecutionOptions): Promise<ParserResult> {
    const start = performance.now();
    const includeGraphs = options.includeGraphs ?? this.defaultIncludeGraphs;
    const flatten = options.flatten ?? this.defaultFlatten;
    const documentCache = options.documentCache ?? this.baseDocumentCache;
    const tokenCache = new InstrumentedCache(options.tokenCache ?? this.baseTokenCache);
    const sessionOptions: ParseSessionOptions = {
      ...this.defaultSessionOptions,
    } satisfies ParseSessionOptions;
    if (options.sessionOptions) {
      Object.assign(sessionOptions, options.sessionOptions);
    }

    const entries: TokenResolvedSource[] = [];
    const aggregatedDiagnostics: DiagnosticEvent[] = [];
    const snapshots: TokenResolutionSnapshot[] = [];
    const metadataIndex = new Map<TokenId, TokenMetadataSnapshot>();
    const resolutionIndex = new Map<TokenId, ResolvedTokenView>();
    let parseMs = 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    let cacheSkipped = 0;
    const recordCacheStatus = (status: TokenResolutionCacheStatus): void => {
      switch (status) {
        case CACHE_STATUS_HIT: {
          cacheHits += 1;
          break;
        }
        case CACHE_STATUS_MISS: {
          cacheMisses += 1;
          break;
        }
        case CACHE_STATUS_SKIP: {
          cacheSkipped += 1;
          break;
        }
        default: {
          const exhaustive: never = status;
          void exhaustive;
        }
      }
    };

    for (const planned of plan.entries) {
      const entryStart = performance.now();
      const diagnosticsBuffer: ParserDiagnostic[] = [];
      const parserHooks = createDiagnosticsAwareParserHooks<ParserDiagnostic>({
        ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
        scope: DiagnosticScopes.tokenSourceSession,
        sourceLabel: planned.uri,
        hooks: {
          onDiagnostic: (diagnostic: ParserDiagnostic) => diagnosticsBuffer.push(diagnostic),
          warn: (diagnostic: ParserDiagnostic) => diagnosticsBuffer.push(diagnostic),
        },
      });
      const parseIncludeGraphs = includeGraphs || flatten;
      const result = await parseTokens(
        {
          uri: planned.uri,
          data: planned.document,
          contentType: 'application/json',
        },
        {
          flatten,
          includeGraphs: parseIncludeGraphs,
          tokenCache,
          documentCache,
          ...parserHooks,
          ...sessionOptions,
        },
      );

      const parserDiagnostics = this.dedupeDiagnostics([
        ...diagnosticsBuffer,
        ...result.diagnostics,
      ]);
      const diagnostics = parserDiagnostics.map((diagnostic) => {
        const sanitisedDiagnostic =
          typeof diagnostic.message === 'string'
            ? { ...diagnostic, message: sanitizeDiagnosticMessage(diagnostic.message) }
            : diagnostic;
        return convertParserDiagnostic(sanitisedDiagnostic);
      });
      const cacheStatus = tokenCache.consumeStatus();
      recordCacheStatus(cacheStatus);

      for (const [tokenId, metadata] of result.metadataIndex) {
        metadataIndex.set(tokenId, metadata);
      }
      for (const [tokenId, resolution] of result.resolutionIndex) {
        resolutionIndex.set(tokenId, resolution);
      }

      let context: ParseResultContext = {
        ...(includeGraphs && result.document !== undefined ? { document: result.document } : {}),
        ...(includeGraphs && result.graph !== undefined ? { graph: result.graph } : {}),
        ...(includeGraphs && result.resolver !== undefined ? { resolver: result.resolver } : {}),
      } satisfies ParseResultContext;

      if (includeGraphs && context.graph && context.resolver) {
        context = await this.extendResolverContext(planned, context, {
          documentCache,
          tokenCache,
          sessionOptions,
        });
        if (context.metadataIndex) {
          for (const [tokenId, metadata] of context.metadataIndex) {
            metadataIndex.set(tokenId, metadata);
          }
        }
        if (context.resolutionIndex) {
          for (const [tokenId, resolution] of context.resolutionIndex) {
            resolutionIndex.set(tokenId, resolution);
          }
        }
        if (context.cacheStatuses) {
          for (const status of context.cacheStatuses) {
            recordCacheStatus(status);
          }
        }
      }

      const document = includeGraphs ? context.document : undefined;
      const graph = includeGraphs ? context.graph : undefined;
      const resolver = includeGraphs ? context.resolver : undefined;
      const pointerIndex = includeGraphs ? context.pointerIndex : undefined;
      const { tokens, tokenSet } = flatten
        ? await this.hydrateTokenArtifacts(planned, result, {
            pointerPrefix: planned.pointerPrefix,
            exposeGraphs: includeGraphs,
            onDiagnostic: (diagnostic) => {
              parserHooks.onDiagnostic?.(diagnostic);

              const sanitisedDiagnostic =
                typeof diagnostic.message === 'string'
                  ? { ...diagnostic, message: sanitizeDiagnosticMessage(diagnostic.message) }
                  : diagnostic;

              diagnostics.push(convertParserDiagnostic(sanitisedDiagnostic));
            },
            ...(context.document === undefined ? {} : { document: context.document }),
            ...(context.graph === undefined ? {} : { graph: context.graph }),
            ...(context.resolver === undefined ? {} : { resolver: context.resolver }),
            ...(context.pointerIndex === undefined ? {} : { pointerIndex: context.pointerIndex }),
          })
        : {
            tokens: [] as TokenResolutionSnapshot[],
            tokenSet: this.createTokenSet(planned, [], {
              ...(document === undefined ? {} : { document }),
              ...(graph === undefined ? {} : { graph }),
              ...(resolver === undefined ? {} : { resolver }),
              ...(pointerIndex === undefined ? {} : { pointerIndex }),
            }),
          };

      snapshots.push(...tokens);
      aggregatedDiagnostics.push(...diagnostics);

      const elapsedMs = performance.now() - entryStart;
      parseMs += elapsedMs;

      entries.push({
        sourceId: planned.id,
        pointerPrefix: planned.pointerPrefix,
        layer: planned.layer,
        layerIndex: planned.layerIndex,
        uri: planned.uri,
        context: planned.context,
        tokens,
        tokenSet,
        diagnostics,
        metadataIndex: result.metadataIndex,
        resolutionIndex: result.resolutionIndex,
        ...(document ? { document } : {}),
        ...(graph ? { graph } : {}),
        ...(resolver ? { resolver } : {}),
        cacheStatus,
      });
    }

    const totalMs = performance.now() - start;
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
      sources: entries,
      snapshots,
      diagnostics: aggregatedDiagnostics,
      metadata: metadataIndex,
      resolutions: resolutionIndex,
    } satisfies ParserResult;
  }

  consumeMetrics(): ParserMetrics | undefined {
    const metrics = this.lastMetrics;
    this.lastMetrics = void 0;
    return metrics;
  }

  private createTokenSet(
    planned: TokenSourcePlan['entries'][number],
    tokens: readonly TokenResolutionSnapshot[],
    result: {
      readonly document?: RawDocument;
      readonly graph?: DocumentGraph;
      readonly resolver?: DocumentResolver;
      readonly pointerIndex?: ReadonlyMap<JsonPointer, PointerIndexEntry>;
    },
  ): TokenSet {
    const tokenEntries = tokens.map((snapshot) => [snapshot.id, snapshot] as const);
    const baseSet: TokenSet = {
      tokens: new Map<string, TokenSnapshot>(tokenEntries),
      source: planned.uri,
      ...(result.document ? { document: result.document } : {}),
      ...(result.graph ? { graph: result.graph } : {}),
    } satisfies TokenSet;
    if (result.resolver) {
      return {
        ...baseSet,
        resolver: this.createTokenSetResolver(result.resolver, result.pointerIndex),
      } satisfies TokenSet;
    }
    return baseSet;
  }

  private async extendResolverContext(
    planned: TokenSourcePlan['entries'][number],
    context: ParseResultContext,
    options: {
      readonly documentCache: DocumentCache;
      readonly tokenCache: InstrumentedCache;
      readonly sessionOptions: ParseSessionOptions;
    },
  ): Promise<ParseResultContext> {
    if (!context.graph || !context.resolver) {
      return context;
    }

    const baseGraph = context.graph;
    const baseUri = this.normaliseUri(planned.uri);
    const loader = new DefaultDocumentLoader(
      baseUri.protocol === 'file:' ? { cwd: baseUri } : undefined,
    );
    const loadResult = await this.loadDocumentGraphs(baseGraph, loader, {
      baseUri,
      documentCache: options.documentCache,
      tokenCache: options.tokenCache,
      sessionOptions: options.sessionOptions,
    });
    const { graphs, cacheStatuses, metadataIndex, resolutionIndex } = loadResult;

    if (graphs.size <= 1) {
      if (cacheStatuses.length === 0 && metadataIndex.size === 0 && resolutionIndex.size === 0) {
        return context;
      }

      return {
        ...(context.document ? { document: context.document } : {}),
        ...(context.graph ? { graph: context.graph } : {}),
        ...(context.resolver ? { resolver: context.resolver } : {}),
        ...(context.resolverFactory ? { resolverFactory: context.resolverFactory } : {}),
        ...(context.pointerIndex ? { pointerIndex: context.pointerIndex } : {}),
        ...(cacheStatuses.length > 0 ? { cacheStatuses: [...cacheStatuses] } : {}),
        ...(metadataIndex.size > 0 ? { metadataIndex } : {}),
        ...(resolutionIndex.size > 0 ? { resolutionIndex } : {}),
      } satisfies ParseResultContext;
    }

    const combined = this.combineDocumentGraphs(baseGraph, graphs, baseUri);
    const factory = (
      graph: DocumentGraph,
      resolverOptions: DocumentResolverOptions,
    ): DocumentResolver =>
      new CompositeDocumentResolver(graph, resolverOptions, combined.pointerIndex);

    const resolver = factory(combined.graph, {} as DocumentResolverOptions);

    return {
      ...(context.document ? { document: context.document } : {}),
      graph: combined.graph,
      resolver,
      resolverFactory: factory,
      pointerIndex: combined.pointerIndex,
      ...(cacheStatuses.length > 0 ? { cacheStatuses: [...cacheStatuses] } : {}),
      ...(metadataIndex.size > 0 ? { metadataIndex } : {}),
      ...(resolutionIndex.size > 0 ? { resolutionIndex } : {}),
    } satisfies ParseResultContext;
  }

  private async loadDocumentGraphs(
    baseGraph: DocumentGraph,
    loader: DefaultDocumentLoader,
    options: {
      readonly baseUri: URL;
      readonly documentCache: DocumentCache;
      readonly tokenCache: InstrumentedCache;
      readonly sessionOptions: ParseSessionOptions;
    },
  ): Promise<{
    readonly graphs: Map<string, ExternalDocumentArtifacts>;
    readonly cacheStatuses: TokenResolutionCacheStatus[];
    readonly metadataIndex: Map<TokenId, TokenMetadataSnapshot>;
    readonly resolutionIndex: Map<TokenId, ResolvedTokenView>;
  }> {
    const baseKey = this.normaliseUri(baseGraph.uri.href).href;
    const graphs = new Map<string, ExternalDocumentArtifacts>();
    graphs.set(baseKey, {
      graph: baseGraph,
      metadataIndex: new Map(),
      resolutionIndex: new Map(),
    });

    const cacheStatuses: TokenResolutionCacheStatus[] = [];
    const metadataIndex = new Map<TokenId, TokenMetadataSnapshot>();
    const resolutionIndex = new Map<TokenId, ResolvedTokenView>();
    const queue: DocumentGraph[] = [baseGraph];
    const visited = new Set<string>([baseKey]);

    while (queue.length > 0) {
      const current = queue.shift() as DocumentGraph;
      const targets = this.collectExternalReferenceTargets(current);

      for (const target of targets) {
        const key = this.normaliseUri(target.uri.href).href;

        if (visited.has(key)) {
          continue;
        }

        const { artifacts, cacheStatus } = await this.loadExternalDocumentGraph(
          target.uri,
          loader,
          options,
        );

        const artifactKey = this.normaliseUri(artifacts.graph.uri.href).href;
        graphs.set(artifactKey, artifacts);
        visited.add(key);
        visited.add(artifactKey);
        queue.push(artifacts.graph);

        if (cacheStatus) {
          cacheStatuses.push(cacheStatus);
        }

        for (const [tokenId, metadata] of artifacts.metadataIndex) {
          metadataIndex.set(tokenId, metadata);
        }

        for (const [tokenId, resolution] of artifacts.resolutionIndex) {
          resolutionIndex.set(tokenId, resolution);
        }
      }
    }

    return { graphs, cacheStatuses, metadataIndex, resolutionIndex };
  }

  private collectExternalReferenceTargets(graph: DocumentGraph): GraphReferenceTarget[] {
    const targets: GraphReferenceTarget[] = [];

    const visitField = (field: GraphReferenceField | undefined): void => {
      if (field && field.value.external) {
        targets.push(field.value);
      }
    };

    for (const node of graph.nodes.values()) {
      if (node.kind === 'alias') {
        visitField(node.ref);
      }
    }

    for (const override of graph.overrides) {
      visitField(override.token);
      visitField(override.ref);

      if (override.fallback) {
        for (const entry of override.fallback) {
          this.visitOverrideFallbackReferences(entry, visitField);
        }
      }
    }

    return targets;
  }

  private visitOverrideFallbackReferences(
    fallback: GraphOverrideFallbackNode,
    visit: (field: GraphReferenceField | undefined) => void,
  ): void {
    visit(fallback.ref);

    if (fallback.fallback) {
      for (const entry of fallback.fallback) {
        this.visitOverrideFallbackReferences(entry, visit);
      }
    }
  }

  private async loadExternalDocumentGraph(
    uri: URL,
    loader: DefaultDocumentLoader,
    options: {
      readonly baseUri: URL;
      readonly documentCache: DocumentCache;
      readonly tokenCache: InstrumentedCache;
      readonly sessionOptions: ParseSessionOptions;
    },
  ): Promise<{
    readonly artifacts: ExternalDocumentArtifacts;
    readonly cacheStatus?: TokenResolutionCacheStatus;
  }> {
    const cacheKey = this.normaliseUri(uri.href).href;
    const cached = this.externalDocumentArtifacts.get(cacheKey);

    if (cached) {
      return { artifacts: cached, cacheStatus: CACHE_STATUS_HIT };
    }

    const handle = await loader.load(uri, { baseUri: options.baseUri });

    const input: ParseTokensInput =
      handle.text === undefined
        ? { uri: handle.uri, content: handle.bytes, contentType: handle.contentType }
        : { uri: handle.uri, content: handle.text, contentType: handle.contentType };

    const result = await parseTokens(input, {
      includeGraphs: true,
      flatten: false,
      documentCache: options.documentCache,
      tokenCache: options.tokenCache,
      ...options.sessionOptions,
    });

    if (result.graph === undefined) {
      throw new Error(`Failed to load external DTIF graph for ${uri.href}`);
    }

    const artifacts: ExternalDocumentArtifacts = {
      graph: result.graph,
      metadataIndex: result.metadataIndex,
      resolutionIndex: result.resolutionIndex,
    } satisfies ExternalDocumentArtifacts;

    const resolvedKey = this.normaliseUri(result.graph.uri.href).href;
    this.externalDocumentArtifacts.set(resolvedKey, artifacts);
    if (resolvedKey !== cacheKey) {
      this.externalDocumentArtifacts.set(cacheKey, artifacts);
    }

    const cacheStatus = options.tokenCache.consumeStatus();

    return { artifacts, cacheStatus };
  }

  private combineDocumentGraphs(
    baseGraph: DocumentGraph,
    graphs: Map<string, ExternalDocumentArtifacts>,
    baseUri: URL,
  ): {
    readonly graph: DocumentGraph;
    readonly pointerIndex: ReadonlyMap<JsonPointer, PointerIndexEntry>;
  } {
    const pointerIndex = new Map<JsonPointer, PointerIndexEntry>();
    const namespaces = new Map<string, readonly string[]>();
    const baseKey = this.normaliseUri(baseGraph.uri.href).href;
    namespaces.set(baseKey, []);

    let externalIndex = 0;

    for (const [uri] of graphs) {
      if (uri === baseKey) {
        continue;
      }

      const namespace = ['__external', String(externalIndex++)] as const;
      namespaces.set(uri, namespace);
    }

    const nodes = new Map<JsonPointer, GraphNode>();
    const overrides: GraphOverrideNode[] = [];
    const rootPointers: JsonPointer[] = [];

    for (const { graph } of graphs.values()) {
      const graphKey = this.normaliseUri(graph.uri.href).href;
      const segments = namespaces.get(graphKey) ?? [];
      const remapped = this.namespaceGraph(graph, {
        segments,
        pointerIndex,
        namespaceMap: namespaces,
        baseUri,
        sourceUri: graph.uri,
      });

      for (const [pointer, node] of remapped.nodes) {
        nodes.set(pointer, node);
      }

      overrides.push(...remapped.overrides);
      rootPointers.push(...remapped.rootPointers);
    }

    const combinedGraph: DocumentGraph = {
      kind: 'document-graph',
      uri: baseGraph.uri,
      ast: baseGraph.ast,
      nodes,
      rootPointers,
      overrides,
    } satisfies DocumentGraph;

    return { graph: combinedGraph, pointerIndex };
  }

  private namespaceGraph(
    graph: DocumentGraph,
    context: {
      readonly segments: readonly string[];
      readonly pointerIndex: Map<JsonPointer, PointerIndexEntry>;
      readonly namespaceMap: ReadonlyMap<string, readonly string[]>;
      readonly baseUri: URL;
      readonly sourceUri: URL;
    },
  ): {
    readonly nodes: Map<JsonPointer, GraphNode>;
    readonly overrides: GraphOverrideNode[];
    readonly rootPointers: JsonPointer[];
  } {
    const nodes = new Map<JsonPointer, GraphNode>();

    for (const node of graph.nodes.values()) {
      const pointer = this.namespacePointer(node.pointer, context.segments);
      const parent = node.parent ? this.namespacePointer(node.parent, context.segments) : undefined;
      const path =
        context.segments.length > 0 ? [...context.segments, ...node.path] : [...node.path];

      this.registerPointerIndex(pointer, {
        pointerIndex: context.pointerIndex,
        sourceUri: graph.uri,
        baseUri: context.baseUri,
      });

      switch (node.kind) {
        case 'collection': {
          const children = node.children.map((child) =>
            this.namespacePointer(child as JsonPointer, context.segments),
          );
          const mapped = {
            kind: node.kind,
            name: node.name,
            pointer,
            ...(node.span ? { span: node.span } : {}),
            ...(parent ? { parent } : {}),
            path,
            metadata: this.namespaceMetadata(node.metadata, context.segments),
            children,
          } satisfies GraphCollectionNode;
          nodes.set(pointer, mapped);
          break;
        }
        case 'token': {
          const mapped = {
            kind: node.kind,
            name: node.name,
            pointer,
            ...(node.span ? { span: node.span } : {}),
            ...(parent ? { parent } : {}),
            path,
            metadata: this.namespaceMetadata(node.metadata, context.segments),
            ...(node.type ? { type: this.namespaceField(node.type, context.segments)! } : {}),
            ...(node.value ? { value: this.namespaceField(node.value, context.segments)! } : {}),
          } satisfies GraphTokenNode;
          nodes.set(pointer, mapped);
          break;
        }
        case 'alias': {
          const mapped = {
            kind: node.kind,
            name: node.name,
            pointer,
            ...(node.span ? { span: node.span } : {}),
            ...(parent ? { parent } : {}),
            path,
            metadata: this.namespaceMetadata(node.metadata, context.segments),
            type: this.namespaceField(node.type, context.segments)!,
            ref: this.namespaceReferenceField(node.ref, context.segments, context),
          } satisfies GraphAliasNode;
          nodes.set(pointer, mapped);
          break;
        }
        default: {
          const exhaustive: never = node;
          void exhaustive;
        }
      }
    }

    const overrides = graph.overrides.map((override) =>
      this.namespaceOverrideNode(override, context),
    );
    const rootPointers = graph.rootPointers.map((pointer) =>
      this.namespacePointer(pointer, context.segments),
    );

    return { nodes, overrides, rootPointers };
  }

  private namespacePointer(pointer: JsonPointer, segments: readonly string[]): JsonPointer {
    if (segments.length === 0) {
      return pointer;
    }

    const tail = pointer === JSON_POINTER_ROOT ? [] : splitJsonPointer(pointer);
    return appendJsonPointer(JSON_POINTER_ROOT, ...segments, ...tail);
  }

  private namespaceField<T>(
    field: AstField<T> | undefined,
    segments: readonly string[],
  ): AstField<T> | undefined {
    if (field === undefined) {
      return undefined;
    }

    return {
      ...field,
      pointer: this.namespacePointer(field.pointer as JsonPointer, segments),
    } satisfies AstField<T>;
  }

  private namespaceMetadata(
    metadata: GraphNode['metadata'],
    segments: readonly string[],
  ): GraphNode['metadata'] {
    return {
      ...metadata,
      ...(metadata.description
        ? { description: this.namespaceField(metadata.description, segments)! }
        : {}),
      ...(metadata.extensions
        ? { extensions: this.namespaceField(metadata.extensions, segments)! }
        : {}),
      ...(metadata.deprecated
        ? { deprecated: this.namespaceField(metadata.deprecated, segments)! }
        : {}),
      ...(metadata.lastModified
        ? { lastModified: this.namespaceField(metadata.lastModified, segments)! }
        : {}),
      ...(metadata.lastUsed ? { lastUsed: this.namespaceField(metadata.lastUsed, segments)! } : {}),
      ...(metadata.usageCount
        ? { usageCount: this.namespaceField(metadata.usageCount, segments)! }
        : {}),
      ...(metadata.author ? { author: this.namespaceField(metadata.author, segments)! } : {}),
      ...(metadata.tags ? { tags: this.namespaceField(metadata.tags, segments)! } : {}),
      ...(metadata.hash ? { hash: this.namespaceField(metadata.hash, segments)! } : {}),
    } satisfies GraphNode['metadata'];
  }

  private namespaceReferenceField(
    field: GraphReferenceField,
    segments: readonly string[],
    context: {
      readonly namespaceMap: ReadonlyMap<string, readonly string[]>;
      readonly baseUri: URL;
      readonly pointerIndex: Map<JsonPointer, PointerIndexEntry>;
      readonly sourceUri: URL;
    },
  ): GraphReferenceField {
    const pointer = this.namespacePointer(field.pointer as JsonPointer, segments);
    this.registerPointerIndex(pointer, {
      pointerIndex: context.pointerIndex,
      sourceUri: context.sourceUri,
      baseUri: context.baseUri,
    });

    return {
      ...field,
      pointer,
      value: this.namespaceReferenceTarget(field.value, context),
    } satisfies GraphReferenceField;
  }

  private namespaceReferenceTarget(
    target: GraphReferenceTarget,
    context: {
      readonly namespaceMap: ReadonlyMap<string, readonly string[]>;
      readonly baseUri: URL;
    },
  ): GraphReferenceTarget {
    const targetKey = this.normaliseUri(target.uri.href).href;
    const targetSegments = context.namespaceMap.get(targetKey) ?? [];
    const pointer = this.namespacePointer(target.pointer, targetSegments);

    return {
      uri: target.uri,
      pointer,
      external: false,
    } satisfies GraphReferenceTarget;
  }

  private namespaceOverrideNode(
    override: GraphOverrideNode,
    context: {
      readonly segments: readonly string[];
      readonly namespaceMap: ReadonlyMap<string, readonly string[]>;
      readonly baseUri: URL;
      readonly pointerIndex: Map<JsonPointer, PointerIndexEntry>;
      readonly sourceUri: URL;
    },
  ): GraphOverrideNode {
    const pointer = this.namespacePointer(override.pointer, context.segments);
    this.registerPointerIndex(pointer, context);

    return {
      ...override,
      pointer,
      token: this.namespaceReferenceField(override.token, context.segments, context),
      when: this.namespaceField(override.when, context.segments) as AstField<
        Readonly<Record<string, unknown>>
      >,
      ...(override.ref
        ? { ref: this.namespaceReferenceField(override.ref, context.segments, context) }
        : {}),
      ...(override.value ? { value: this.namespaceField(override.value, context.segments)! } : {}),
      ...(override.fallback
        ? { fallback: this.namespaceOverrideFallbackList(override.fallback, context) }
        : {}),
    } satisfies GraphOverrideNode;
  }

  private namespaceOverrideFallbackList(
    fallback: readonly GraphOverrideFallbackNode[],
    context: {
      readonly segments: readonly string[];
      readonly namespaceMap: ReadonlyMap<string, readonly string[]>;
      readonly baseUri: URL;
      readonly pointerIndex: Map<JsonPointer, PointerIndexEntry>;
      readonly sourceUri: URL;
    },
  ): readonly GraphOverrideFallbackNode[] {
    return fallback.map((entry) =>
      this.namespaceOverrideFallback(entry, {
        segments: context.segments,
        namespaceMap: context.namespaceMap,
        baseUri: context.baseUri,
        pointerIndex: context.pointerIndex,
        sourceUri: context.sourceUri,
      }),
    );
  }

  private namespaceOverrideFallback(
    fallback: GraphOverrideFallbackNode,
    context: {
      readonly segments: readonly string[];
      readonly namespaceMap: ReadonlyMap<string, readonly string[]>;
      readonly baseUri: URL;
      readonly pointerIndex: Map<JsonPointer, PointerIndexEntry>;
      readonly sourceUri: URL;
    },
  ): GraphOverrideFallbackNode {
    const pointer = this.namespacePointer(fallback.pointer, context.segments);
    this.registerPointerIndex(pointer, context);

    return {
      ...fallback,
      pointer,
      ...(fallback.ref
        ? { ref: this.namespaceReferenceField(fallback.ref, context.segments, context) }
        : {}),
      ...(fallback.value ? { value: this.namespaceField(fallback.value, context.segments)! } : {}),
      ...(fallback.fallback
        ? { fallback: this.namespaceOverrideFallbackList(fallback.fallback, context) }
        : {}),
    } satisfies GraphOverrideFallbackNode;
  }

  private registerPointerIndex(
    pointer: JsonPointer,
    context: {
      readonly pointerIndex: Map<JsonPointer, PointerIndexEntry>;
      readonly sourceUri: URL;
      readonly baseUri: URL;
    },
  ): void {
    context.pointerIndex.set(pointer, {
      uri: context.sourceUri,
      external: context.sourceUri.href !== context.baseUri.href,
    });
  }

  private async hydrateTokenArtifacts(
    planned: TokenSourcePlan['entries'][number],
    result: ParseTokensResult,
    context: ParseResultContext & {
      readonly pointerPrefix: JsonPointer;
      readonly exposeGraphs: boolean;
      readonly onDiagnostic?: (diagnostic: ParserDiagnostic) => void;
    },
  ): Promise<{ readonly tokens: TokenResolutionSnapshot[]; readonly tokenSet: TokenSet }> {
    const baseUri = this.normaliseUri(planned.uri);
    const flattenedByPointer = new Map<JsonPointer, DtifFlattenedToken>();

    for (const token of result.flattened) {
      flattenedByPointer.set(token.pointer, token);
    }

    const tokenSetFromResult = createTokenSetFromParseResult<
      TokenResolutionSnapshot,
      BuildSnapshotMeta
    >(this.toParseDocumentResult(context), {
      source: planned.uri,
      meta: {
        planned,
        pointerPrefix: context.pointerPrefix,
        baseUri,
        flattenedByPointer,
        metadataIndex: result.metadataIndex,
        resolutionIndex: result.resolutionIndex,
      },
      extendSnapshot: (snapshot, extendContext) =>
        this.extendSnapshotWithBuildFields(snapshot, extendContext),
      ...(context.onDiagnostic === undefined ? {} : { onDiagnostic: context.onDiagnostic }),
      createDocumentResolver:
        context.resolverFactory === undefined
          ? createDocumentResolver
          : (graph, options) => context.resolverFactory!(graph, options),
    });

    const tokens: TokenResolutionSnapshot[] = [];

    for (const token of result.flattened) {
      const snapshot = tokenSetFromResult.tokens.get(token.id) as
        | TokenResolutionSnapshot
        | undefined;

      if (snapshot) {
        tokens.push(snapshot);
      }
    }

    const tokenSet = this.createTokenSet(planned, tokens, {
      ...(context.exposeGraphs && context.document ? { document: context.document } : {}),
      ...(context.exposeGraphs && context.graph ? { graph: context.graph } : {}),
      ...(context.exposeGraphs && context.resolver ? { resolver: context.resolver } : {}),
      ...(context.pointerIndex ? { pointerIndex: context.pointerIndex } : {}),
    });

    return { tokens, tokenSet };
  }

  private toParseDocumentResult(
    context: ParseResultContext,
  ): Parameters<typeof createTokenSetFromParseResult>[0] {
    return {
      ...(context.document === undefined ? {} : { document: context.document }),
      ...(context.graph === undefined ? {} : { graph: { graph: context.graph } }),
      ...(context.resolver === undefined ? {} : { resolution: { result: context.resolver } }),
    } as Parameters<typeof createTokenSetFromParseResult>[0];
  }

  private extendSnapshotWithBuildFields(
    snapshot: TokenSnapshotDraft,
    context: TokenSnapshotContext<BuildSnapshotMeta>,
  ): TokenResolutionSnapshot | void {
    const flattenedToken = context.meta.flattenedByPointer.get(context.node.pointer as JsonPointer);

    if (flattenedToken === undefined) {
      return undefined;
    }

    const metadata = context.meta.metadataIndex.get(flattenedToken.id);
    const resolvedMetadata =
      metadata === undefined
        ? undefined
        : this.extendMetadataWithNodeFields(metadata, context.node.metadata);
    const resolution = context.meta.resolutionIndex.get(flattenedToken.id);
    const pointer = this.combinePointer(context.meta.pointerPrefix, flattenedToken.pointer);
    const references = this.convertTokenPointers(resolution?.references, context.meta.baseUri);
    const resolutionPath = this.convertTokenPointers(
      resolution?.resolutionPath,
      context.meta.baseUri,
    );
    const appliedAliases = this.convertTokenPointers(
      resolution?.appliedAliases,
      context.meta.baseUri,
    );
    const deprecated = resolvedMetadata?.deprecated
      ? {
          ...resolvedMetadata.deprecated,
          ...(resolvedMetadata.deprecated.supersededBy
            ? {
                supersededBy: this.convertTokenPointer(
                  resolvedMetadata.deprecated.supersededBy,
                  context.meta.baseUri,
                ),
              }
            : {}),
        }
      : snapshot.deprecated;
    const source = resolvedMetadata
      ? { ...resolvedMetadata.source }
      : (snapshot.source ?? createDefaultSourceLocation(context.meta.baseUri));

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

  private extendMetadataWithNodeFields(
    metadata: TokenMetadataSnapshot,
    nodeMetadata: TokenSnapshotContext<BuildSnapshotMeta>['node']['metadata'],
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

    return {
      ...metadata,
      ...additions,
    } satisfies TokenMetadataSnapshot;
  }

  private createTokenSetResolver(
    resolver: DocumentResolver,
    pointerIndex?: ReadonlyMap<JsonPointer, PointerIndexEntry>,
  ): TokenSetResolver {
    const compositeIndex =
      pointerIndex ??
      (resolver instanceof CompositeDocumentResolver ? resolver.getPointerIndex() : undefined);

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
                  uri: this.resolvePointerUri(token.pointer, token.uri, compositeIndex),
                  ...(token.type === undefined ? {} : { type: token.type }),
                  ...(token.value === undefined ? {} : { value: cloneTokenValue(token.value) }),
                  ...(token.source
                    ? {
                        source: {
                          uri: this.resolvePointerUri(
                            token.source.pointer ?? token.pointer,
                            token.source.uri,
                            compositeIndex,
                          ),
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

  private convertTokenPointers(
    pointers: readonly DtifTokenPointer[] | undefined,
    baseUri: URL,
  ): readonly CoreTokenPointer[] {
    if (pointers === undefined || pointers.length === 0) {
      return [];
    }
    return pointers.map((pointer) => this.convertTokenPointer(pointer, baseUri));
  }

  private convertTokenPointer(pointer: DtifTokenPointer, baseUri: URL): CoreTokenPointer {
    const targetUri = this.normaliseUriWithBase(pointer.uri, baseUri);
    const external = targetUri.href !== baseUri.href;
    return createTokenPointer(pointer.pointer, targetUri, external);
  }

  private resolvePointerUri(
    pointer: JsonPointer,
    fallback: URL,
    pointerIndex?: ReadonlyMap<JsonPointer, PointerIndexEntry>,
  ): URL {
    const entry = pointerIndex?.get(pointer);
    return entry?.uri ?? fallback;
  }

  private normaliseUri(uri: string): URL {
    try {
      return new URL(uri);
    } catch {
      return new URL(uri, 'file:///');
    }
  }

  private normaliseUriWithBase(uri: string, baseUri: URL): URL {
    try {
      return new URL(uri);
    } catch {
      return new URL(uri, baseUri);
    }
  }

  private dedupeDiagnostics(diagnostics: readonly ParserDiagnostic[]): ParserDiagnostic[] {
    const map = new Map<string, ParserDiagnostic>();
    for (const diagnostic of diagnostics) {
      const key = this.createDiagnosticKey(diagnostic);
      map.set(key, diagnostic);
    }
    return [...map.values()];
  }

  private createDiagnosticKey(diagnostic: ParserDiagnostic): string {
    const span = diagnostic.span;
    const pointer = diagnostic.pointer ?? '';
    return [
      diagnostic.severity,
      diagnostic.code,
      diagnostic.message,
      pointer,
      span?.start.line ?? -1,
      span?.start.column ?? -1,
      span?.end.line ?? -1,
      span?.end.column ?? -1,
    ].join('|');
  }

  private combinePointer(prefix: JsonPointer, pointer: JsonPointer): JsonPointer {
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
}

export type { TokenCacheKey, TokenCacheSnapshot } from '@lapidist/dtif-parser';

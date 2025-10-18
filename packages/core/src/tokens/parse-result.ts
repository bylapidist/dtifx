import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  DocumentResolverOptions,
  DocumentGraph,
  DocumentResolver,
  GraphAliasNode,
  GraphNode,
  GraphTokenNode,
  JsonPointer,
  ParseDocumentResult,
  RawDocument,
  ResolutionResult,
  SourceSpan,
  TokenMetadataSnapshot,
  ResolvedTokenView,
} from '@lapidist/dtif-parser';
import type { domain as dtifDomain } from '@lapidist/dtif-parser';
import { createMetadataSnapshot, createResolutionSnapshot } from '@lapidist/dtif-parser';

import {
  INLINE_SOURCE_URI,
  cloneTokenExtensions,
  cloneTokenValue,
  createDefaultSourceLocation,
  createTokenPointer,
  createTokenPointerFromTarget,
  createTokenId,
  type TokenDeprecation,
  type TokenPointer,
  type TokenSet,
  type TokenSetResolver,
  type TokenSnapshot,
  type TokenSourceLocation,
} from './types.js';

const { resolve: resolvePath } = path;

type LegacyRawDocument = RawDocument & {
  readonly uri: URL;
  readonly contentType: RawDocument['identity']['contentType'];
};

type MutableTokenSnapshotBase = {
  -readonly [Property in keyof TokenSnapshot]: TokenSnapshot[Property];
};

export interface TokenSnapshotDraft extends MutableTokenSnapshotBase {
  value?: unknown;
  raw?: unknown;
  ref?: string;
  type?: string;
  description?: string;
  $lastModified?: string;
  $lastUsed?: string;
  $usageCount?: number;
  $author?: string;
  $tags?: readonly string[];
  $hash?: string;
  deprecated?: TokenDeprecation;
  extensions: Record<string, unknown>;
  references: TokenPointer[];
  resolutionPath: TokenPointer[];
  appliedAliases: TokenPointer[];
}

export interface TokenSnapshotContext<TMeta = undefined> {
  readonly node: GraphTokenNode | GraphAliasNode;
  readonly document?: LegacyRawDocument;
  readonly fallbackUri: URL;
  readonly resolution: ResolutionResult;
  readonly resolver: DocumentResolver;
  readonly meta: TMeta;
}

export interface CreateTokenSetFromParseResultOptions<
  TSnapshot extends TokenSnapshot = TokenSnapshot,
  TMeta = undefined,
> {
  readonly source?: string;
  readonly meta?: TMeta;
  readonly extendSnapshot?: (
    snapshot: TokenSnapshotDraft,
    context: TokenSnapshotContext<TMeta>,
  ) => TSnapshot | void;
  readonly onDiagnostic?: (diagnostic: dtifDomain.DiagnosticEvent) => void;
  readonly createDocumentResolver?: (
    graph: DocumentGraph,
    options: DocumentResolverOptions,
  ) => DocumentResolver;
}

/**
 * Hydrates a token set from a DTIF parser result, optionally allowing callers to extend
 * individual token snapshots with additional metadata.
 *
 * @param result - The parser output containing the decoded document and dependency graph.
 * @param options - Customisation hooks that can extend each hydrated snapshot.
 * @returns A token set backed by the parser's document graph.
 */
export function createTokenSetFromParseResult<
  TSnapshot extends TokenSnapshot = TokenSnapshot,
  TMeta = undefined,
>(
  result: ParseDocumentResult,
  options: CreateTokenSetFromParseResultOptions<TSnapshot, TMeta> = {},
): TokenSet & { readonly tokens: ReadonlyMap<string, TSnapshot> } {
  const graphSnapshot = result.graph;
  const graph = graphSnapshot?.graph;

  if (!graph) {
    const document = toLegacyRawDocument(result.document);
    const label = options.source ?? document?.uri.href ?? '<unknown>';
    throw new Error(`DTIF document did not produce a graph: ${label}`);
  }

  const document = toLegacyRawDocument(result.document);
  const documentResolver = ensureDocumentResolver(
    result.resolution?.result,
    graph,
    options.createDocumentResolver,
    result.decoded,
  );

  const tokens = new Map<string, TSnapshot>();
  const fallbackUri = resolveDocumentUri(options.source, document);
  const metadataSnapshot = createMetadataSnapshot(graph);
  const resolutionSnapshot = createResolutionSnapshot(graph, documentResolver, {
    onDiagnostic: (diagnostic) => options.onDiagnostic?.(diagnostic),
  });
  const graphUri = graph.uri;

  for (const node of graph.nodes.values()) {
    if (!isGraphTokenLike(node)) {
      continue;
    }

    const tokenId = createTokenId(node.path);
    const metadataView = metadataSnapshot.get(tokenId);
    const resolutionView = resolutionSnapshot.get(tokenId);
    const snapshot = createSnapshotFromCanonicalViews(node, tokenId, metadataView, resolutionView, {
      fallbackUri,
      graphUri,
    });
    const resolution = documentResolver.resolve(toJsonPointer(node.pointer));

    const extendedSnapshot = options.extendSnapshot?.(snapshot, {
      node,
      ...(document ? { document } : {}),
      fallbackUri,
      resolution,
      resolver: documentResolver,
      meta: options.meta as TMeta,
    });

    const finalSnapshot = (extendedSnapshot ?? snapshot) as TSnapshot;
    tokens.set(finalSnapshot.id, finalSnapshot);
  }

  const tokenSet: TokenSet & { readonly tokens: ReadonlyMap<string, TSnapshot> } = {
    tokens,
    ...(options.source ? { source: options.source } : {}),
    ...(document ? { document } : {}),
    graph,
    resolver: createDocumentResolverAdapter(documentResolver),
  };

  return tokenSet;
}

function ensureDocumentResolver(
  existing: DocumentResolver | undefined,
  graph: DocumentGraph,
  factory:
    | ((graph: DocumentGraph, options: DocumentResolverOptions) => DocumentResolver)
    | undefined,
  decoded: unknown,
): DocumentResolver {
  if (existing) {
    return existing;
  }

  if (factory) {
    return factory(graph, createResolverOptions(decoded));
  }

  throw new Error(
    'Parse result did not provide a resolver and no createDocumentResolver option was supplied.',
  );
}

function createResolverOptions(decoded: unknown): DocumentResolverOptions {
  if (decoded === undefined) {
    return {} as DocumentResolverOptions;
  }

  return {
    document: decoded as DocumentResolverOptions['document'],
  } as DocumentResolverOptions;
}

/**
 * Normalises a token source label into a URL, falling back to an in-memory sentinel when the
 * value cannot be resolved.
 *
 * @param source - The optional source label supplied by the caller.
 * @returns A URL that can be associated with hydrated token snapshots.
 */
export function resolveSourceUri(source?: string): URL {
  if (source) {
    const parsed = tryParseUrl(source);

    if (parsed) {
      return parsed;
    }

    try {
      return pathToFileURL(resolvePath(source));
    } catch {
      // fall through to inline source URI below
    }
  }

  return INLINE_SOURCE_URI;
}

/**
 * Determines the canonical document URI given explicit source information and parser metadata.
 *
 * @param source - The caller supplied source string.
 * @param document - The parser document metadata when available.
 * @returns The resolved document URI used for diagnostics and provenance.
 */
export function resolveDocumentUri(source: string | undefined, document?: LegacyRawDocument): URL {
  if (document?.uri) {
    return document.uri;
  }

  return resolveSourceUri(source);
}

/**
 * Converts a parser source span into the token source location structure consumed by downstream
 * tooling.
 *
 * @param span - The parser span describing the source coordinates.
 * @returns The normalised token source location.
 */
export function createSourceLocation(span: SourceSpan): TokenSourceLocation {
  return {
    uri: span.uri.href,
    line: span.start.line,
    column: span.start.column,
  };
}

function tryParseUrl(value: string): URL | undefined {
  try {
    const parsed = new URL(value);
    if (!isLocalProtocol(parsed.protocol)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function isLocalProtocol(protocol: string): boolean {
  return protocol === 'file:' || protocol === 'virtual:' || protocol === 'memory:';
}

function createSnapshotFromCanonicalViews(
  node: GraphTokenNode | GraphAliasNode,
  tokenId: string,
  metadataView: TokenMetadataSnapshot | undefined,
  resolutionView: ResolvedTokenView | undefined,
  context: {
    readonly fallbackUri: URL;
    readonly graphUri: URL;
  },
): TokenSnapshotDraft {
  const baseSource = node.span
    ? createSourceLocation(node.span)
    : createDefaultSourceLocation(context.fallbackUri);
  const extensions = cloneTokenExtensions(metadataView?.extensions);
  const references = resolutionView
    ? resolutionView.references.map((entry) =>
        createTokenPointerFromSnapshot(entry, context.graphUri, context.fallbackUri),
      )
    : [];

  if (!resolutionView && node.kind === 'alias') {
    references.push(createTokenPointerFromTarget(node.ref.value));
  }
  const resolutionPath = resolutionView
    ? resolutionView.resolutionPath.map((entry) =>
        createTokenPointerFromSnapshot(entry, context.graphUri, context.fallbackUri),
      )
    : [];
  const appliedAliases = resolutionView
    ? resolutionView.appliedAliases.map((entry) =>
        createTokenPointerFromSnapshot(entry, context.graphUri, context.fallbackUri),
      )
    : [];

  const snapshot: TokenSnapshotDraft = {
    id: tokenId,
    path: node.path,
    extensions,
    source: metadataView?.source ?? baseSource,
    references,
    resolutionPath,
    appliedAliases,
  };

  if (resolutionView?.type !== undefined) {
    snapshot.type = resolutionView.type;
  } else if (node.type?.value !== undefined) {
    snapshot.type = node.type.value;
  }

  if (resolutionView?.value !== undefined) {
    snapshot.value = cloneTokenValue(resolutionView.value);
  }

  if (resolutionView?.raw !== undefined) {
    snapshot.raw = cloneTokenValue(resolutionView.raw);
  } else if (node.kind === 'token' && node.value?.value !== undefined) {
    snapshot.raw = cloneTokenValue(node.value.value);
  }

  if (metadataView?.description !== undefined) {
    snapshot.description = metadataView.description;
  } else if (node.metadata.description?.value !== undefined) {
    snapshot.description = node.metadata.description.value;
  }

  const deprecated = metadataView?.deprecated;
  if (deprecated) {
    snapshot.deprecated = createDeprecatedSnapshot(
      deprecated,
      context.graphUri,
      context.fallbackUri,
    );
  }

  if (node.kind === 'alias') {
    snapshot.ref = node.ref.value.pointer;
  }

  const lastModified = node.metadata.lastModified?.value;
  if (lastModified !== undefined) {
    snapshot.$lastModified = lastModified;
  }

  const lastUsed = node.metadata.lastUsed?.value;
  if (lastUsed !== undefined) {
    snapshot.$lastUsed = lastUsed;
  }

  const usageCount = node.metadata.usageCount?.value;
  if (usageCount !== undefined) {
    snapshot.$usageCount = usageCount;
  }

  const author = node.metadata.author?.value;
  if (author !== undefined) {
    snapshot.$author = author;
  }

  const tags = node.metadata.tags?.value;
  if (tags !== undefined) {
    snapshot.$tags = cloneTokenValue(tags) as readonly string[];
  }

  const hash = node.metadata.hash?.value;
  if (hash !== undefined) {
    snapshot.$hash = hash;
  }

  return snapshot;
}

function createDocumentResolverAdapter(resolver: DocumentResolver): TokenSetResolver {
  return {
    resolve(pointer: string) {
      return resolver.resolve(toJsonPointer(pointer)) as ReturnType<TokenSetResolver['resolve']>;
    },
  };
}

function createDeprecatedSnapshot(
  deprecated: NonNullable<TokenMetadataSnapshot['deprecated']>,
  graphUri: URL,
  fallbackUri: URL,
): TokenDeprecation {
  const supersededBy = deprecated.supersededBy
    ? createTokenPointerFromSnapshot(deprecated.supersededBy, graphUri, fallbackUri)
    : undefined;

  return {
    ...(supersededBy ? { supersededBy } : {}),
    ...(deprecated.since ? { since: deprecated.since } : {}),
    ...(deprecated.reason ? { reason: deprecated.reason } : {}),
  } satisfies TokenDeprecation;
}

function createTokenPointerFromSnapshot(
  entry: { readonly uri: string; readonly pointer: string },
  graphUri: URL,
  fallbackUri: URL,
): TokenPointer {
  const resolvedUri = resolveSnapshotUri(entry.uri, graphUri, fallbackUri);
  const external = resolvedUri.href !== graphUri.href;
  return createTokenPointer(entry.pointer, resolvedUri, external);
}

function resolveSnapshotUri(uri: string, graphUri: URL, fallbackUri: URL): URL {
  try {
    return new URL(uri);
  } catch {
    try {
      return new URL(uri, graphUri);
    } catch {
      return fallbackUri;
    }
  }
}

function toLegacyRawDocument(document: RawDocument | undefined): LegacyRawDocument | undefined {
  if (!document) {
    return undefined;
  }

  return {
    ...document,
    uri: document.identity.uri,
    contentType: document.identity.contentType,
  } satisfies LegacyRawDocument;
}

function toJsonPointer(pointer: string): JsonPointer {
  if (pointer.startsWith('#/')) {
    return pointer as JsonPointer;
  }

  throw new Error(`Invalid token pointer: ${pointer}`);
}

function isGraphTokenLike(node: GraphNode): node is GraphTokenNode | GraphAliasNode {
  return node.kind === 'token' || node.kind === 'alias';
}

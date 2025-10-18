import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

const parseTokensMock = vi.hoisted(() => vi.fn());
const actualParseTokens = vi.hoisted(() => ({ current: undefined as ParseTokensFn }));

vi.mock('@lapidist/dtif-parser', async () => {
  const actual = await vi.importActual<DtifParserModule>('@lapidist/dtif-parser');
  parseTokensMock.mockImplementation(actual.parseTokens);
  actualParseTokens.current = actual.parseTokens;
  return {
    ...actual,
    parseTokens: parseTokensMock,
  } satisfies DtifParserModule;
});

import * as dtifParser from '@lapidist/dtif-parser';
import type {
  DocumentAst,
  DocumentGraph,
  DocumentResolverOptions,
  DocumentResolver as DocumentResolverType,
  DtifFlattenedToken,
  GraphAliasNode,
  GraphCollectionNode,
  GraphReferenceField,
  JsonPointer,
  NodeMetadata,
  ResolutionResult,
  ResolvedTokenView,
  TokenId,
  Diagnostic as DtifDiagnostic,
  parseTokens as ParseTokensFn,
} from '@lapidist/dtif-parser';
import { DefaultDocumentLoader, DocumentResolver, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import type { DesignTokenInterchangeFormat } from '@lapidist/dtif-schema';
import type * as DtifParserModule from '@lapidist/dtif-parser';

import { DefaultParserAdapter } from './parser.js';
import type { TokenSourcePlan } from './config.js';
import type { TokenMetadataSnapshot, TokenResolutionSnapshot } from './resolution-types.js';
import type { TokenSnapshotContext, TokenSnapshotDraft } from '../tokens/index.js';

interface BuildSnapshotMeta {
  readonly planned: TokenSourcePlan['entries'][number];
  readonly pointerPrefix: JsonPointer;
  readonly baseUri: URL;
  readonly flattenedByPointer: ReadonlyMap<JsonPointer, DtifFlattenedToken>;
  readonly metadataIndex: ReadonlyMap<TokenId, TokenMetadataSnapshot>;
  readonly resolutionIndex: ReadonlyMap<TokenId, ResolvedTokenView>;
}

type ExtendSnapshotWithBuildFields = (
  snapshot: TokenSnapshotDraft,
  context: TokenSnapshotContext<BuildSnapshotMeta>,
) => TokenResolutionSnapshot | void;

describe('DefaultParserAdapter', () => {
  it('preserves extended metadata fields on token snapshots', () => {
    const adapter = new DefaultParserAdapter();
    const extendSnapshot = (
      adapter as unknown as {
        extendSnapshotWithBuildFields: ExtendSnapshotWithBuildFields;
      }
    ).extendSnapshotWithBuildFields.bind(adapter) as ExtendSnapshotWithBuildFields;

    const planned: TokenSourcePlan['entries'][number] = {
      id: 'virtual-test',
      layer: 'base',
      layerIndex: 0,
      pointerPrefix: '#/tokens' as JsonPointer,
      uri: 'virtual:memory',
      context: {},
      document: {} as unknown,
    };

    const flattenedToken: DtifFlattenedToken = {
      id: 'token-id',
      pointer: '#/color' as JsonPointer,
      name: 'color',
      path: ['color'],
      type: 'color',
      value: '#336699',
      raw: '#336699',
    };

    const baseMetadata: TokenMetadataSnapshot = {
      description: 'Brand primary colour.',
      extensions: { existing: true },
      source: { uri: 'virtual:memory', line: 4, column: 2 },
    } satisfies TokenMetadataSnapshot;

    const metadataIndex = new Map<TokenId, TokenMetadataSnapshot>([
      [flattenedToken.id, baseMetadata],
    ]);
    const resolutionIndex = new Map<TokenId, ResolvedTokenView>();

    const snapshotDraft: TokenSnapshotDraft = {
      id: flattenedToken.id,
      path: flattenedToken.path,
      type: flattenedToken.type,
      value: flattenedToken.value,
      raw: flattenedToken.raw,
      $lastModified: '2023-12-31T09:00:00Z',
      $lastUsed: '2024-01-07T10:00:00Z',
      $usageCount: 5,
      $author: 'UX Platform',
      $tags: ['legacy'],
      $hash: 'abc123',
      extensions: {},
      references: [],
      resolutionPath: [],
      appliedAliases: [],
      source: { uri: 'virtual:memory', line: 1, column: 1 },
    };

    const nodeMetadata = {
      lastModified: { value: '2024-01-01T10:00:00Z' },
      lastUsed: { value: '2024-01-08T10:00:00Z' },
      usageCount: { value: 7 },
      author: { value: 'Design Systems' },
      tags: { value: Object.freeze(['brand', 'primary']) },
      hash: { value: 'f5a4c1b2' },
    };

    const meta: BuildSnapshotMeta = {
      planned,
      pointerPrefix: planned.pointerPrefix,
      baseUri: new URL(planned.uri),
      flattenedByPointer: new Map<JsonPointer, DtifFlattenedToken>([
        [flattenedToken.pointer as JsonPointer, flattenedToken],
      ]),
      metadataIndex,
      resolutionIndex,
    };

    const resolution: ResolutionResult = {
      token: undefined,
      diagnostics: [],
      transforms: [],
    };

    const resolver: DocumentResolverType = {
      resolve: () => resolution,
    } satisfies DocumentResolverType;

    const context = {
      node: {
        pointer: flattenedToken.pointer,
        metadata: nodeMetadata,
      },
      fallbackUri: new URL(planned.uri),
      resolution,
      resolver,
      meta,
    } as unknown as TokenSnapshotContext<BuildSnapshotMeta>;

    const snapshot = extendSnapshot(snapshotDraft, context);

    expect(snapshot).toBeDefined();
    if (!snapshot) {
      throw new Error('Expected snapshot to be defined.');
    }

    expect(snapshot.metadata).toBeDefined();
    if (!snapshot.metadata) {
      throw new Error('Expected metadata to be defined.');
    }

    expect(snapshot.metadata).toMatchObject({
      lastModified: '2024-01-01T10:00:00Z',
      lastUsed: '2024-01-08T10:00:00Z',
      usageCount: 7,
      author: 'Design Systems',
      tags: ['brand', 'primary'],
      hash: 'f5a4c1b2',
    });

    expect(snapshot).toMatchObject({
      $lastModified: '2023-12-31T09:00:00Z',
      $lastUsed: '2024-01-07T10:00:00Z',
      $usageCount: 5,
      $author: 'UX Platform',
      $tags: ['legacy'],
      $hash: 'abc123',
    });
  });

  it('resolves tokens across external documents and caches loaded graphs', async () => {
    const adapter = new DefaultParserAdapter();
    const primaryUrl = new URL('__fixtures__/external/primary.tokens.json', import.meta.url);
    const otherUrl = new URL('other.tokens.json', primaryUrl);
    const document = JSON.parse(await readFile(primaryUrl, 'utf8')) as DesignTokenInterchangeFormat;
    const plan: TokenSourcePlan = {
      entries: [
        {
          id: 'external-primary-fixture',
          layer: 'base',
          layerIndex: 0,
          pointerPrefix: JSON_POINTER_ROOT as JsonPointer,
          uri: primaryUrl.href,
          context: {},
          document,
        },
      ],
      createdAt: new Date(),
    } satisfies TokenSourcePlan;

    const createParseTokensResult = (): Awaited<ReturnType<typeof dtifParser.parseTokens>> => {
      const colorPointer = '#/color' as JsonPointer;
      const aliasPointer = '#/color/alias' as JsonPointer;
      const typePointer = '#/color/alias/$type' as JsonPointer;
      const refPointer = '#/color/alias/$ref' as JsonPointer;
      const emptyMetadata = {} as NodeMetadata;
      const graphRef: GraphReferenceField = {
        pointer: refPointer,
        value: {
          uri: otherUrl,
          pointer: '#/color/base' as JsonPointer,
          external: true,
        },
      } satisfies GraphReferenceField;
      const aliasNode: GraphAliasNode = {
        kind: 'alias',
        name: 'alias',
        pointer: aliasPointer,
        path: ['color', 'alias'],
        metadata: emptyMetadata,
        type: { pointer: typePointer, value: 'color' },
        ref: graphRef,
      } satisfies GraphAliasNode;
      const collectionNode: GraphCollectionNode = {
        kind: 'collection',
        name: 'color',
        pointer: colorPointer,
        path: ['color'],
        metadata: emptyMetadata,
        children: [aliasPointer],
      } satisfies GraphCollectionNode;
      const nodes = new Map<JsonPointer, GraphAliasNode | GraphCollectionNode>([
        [colorPointer, collectionNode],
        [aliasPointer, aliasNode],
      ]);
      const graph: DocumentGraph = {
        kind: 'document-graph',
        uri: primaryUrl,
        ast: {
          kind: 'document',
          uri: primaryUrl,
          pointer: JSON_POINTER_ROOT,
          metadata: emptyMetadata,
          children: [],
          overrides: [],
        } satisfies DocumentAst,
        nodes,
        rootPointers: [colorPointer],
        overrides: [],
      } satisfies DocumentGraph;
      const resolver = new DocumentResolver(graph, {} as DocumentResolverOptions);
      const aliasValue = {
        colorSpace: 'srgb',
        components: [0.1, 0.2, 0.3],
        hex: '#1A334C',
      } as const;
      const flattened: DtifFlattenedToken[] = [
        {
          id: aliasPointer,
          pointer: aliasPointer,
          name: 'alias',
          path: ['color', 'alias'],
          type: 'color',
          raw: 'other.tokens.json#/color/base',
        },
      ];
      const metadataIndex = new Map<TokenId, TokenMetadataSnapshot>([
        [
          aliasPointer,
          {
            extensions: {},
            source: { uri: primaryUrl.href, line: 1, column: 1 },
          } satisfies TokenMetadataSnapshot,
        ],
      ]);
      const resolutionIndex = new Map<TokenId, ResolvedTokenView>([
        [
          aliasPointer,
          {
            id: aliasPointer,
            type: 'color',
            value: aliasValue,
            raw: aliasValue,
            references: [
              {
                uri: otherUrl.href,
                pointer: '#/color/base' as JsonPointer,
              },
            ],
            resolutionPath: [],
            appliedAliases: [],
          },
        ],
      ]);
      const diagnostics: DtifDiagnostic[] = [
        {
          code: 'resolver.EXTERNAL_REFERENCE',
          message: `Alias "${aliasPointer}" references external pointer "${otherUrl.href}#/color/base" which is not yet supported.`,
          severity: 'error',
          pointer: aliasPointer,
        },
      ];
      return {
        document: undefined,
        graph,
        resolver,
        flattened,
        metadataIndex,
        resolutionIndex,
        diagnostics,
      } satisfies Awaited<ReturnType<typeof dtifParser.parseTokens>>;
    };

    const loadSpy = vi.spyOn(DefaultDocumentLoader.prototype, 'load');
    const parseTokensSpy = vi.mocked(dtifParser.parseTokens);
    parseTokensSpy.mockImplementation(async (input, options) => {
      const uri = (() => {
        if (typeof input !== 'object' || !input) {
          return;
        }

        if ('uri' in input) {
          return (input as { uri?: string | URL }).uri;
        }

        if ('data' in input) {
          const data = (input as { data?: { uri?: string | URL } }).data;
          return data?.uri;
        }

        return;
      })();
      const href = uri instanceof URL ? uri.href : uri;
      if (href === primaryUrl.href) {
        return createParseTokensResult();
      }
      return actualParseTokens.current(input as never, options as never);
    });

    try {
      const firstResult = await adapter.parse(plan, {});

      expect(firstResult.diagnostics).toHaveLength(1);
      expect(firstResult.diagnostics[0]?.message).toBe(
        `Alias "#/color/alias" references external pointer "${otherUrl.href}#/color/base" which is not yet supported.`,
      );
      expect(firstResult.sources).toHaveLength(1);

      const [source] = firstResult.sources;
      expect(source.diagnostics).toEqual(firstResult.diagnostics);
      expect(source.tokens).toHaveLength(1);
      expect(source.tokenSet.resolver).toBeDefined();

      const snapshot = source.tokens[0];
      expect(snapshot.value).toEqual({
        colorSpace: 'srgb',
        components: [0.1, 0.2, 0.3],
        hex: '#1A334C',
      });
      expect(snapshot.references).toHaveLength(1);

      const [reference] = snapshot.references;
      expect(reference.pointer).toBe('#/color/base');
      expect(reference.uri).toBe(otherUrl.href);
      expect(reference.external).toBe(true);

      const resolver = source.tokenSet.resolver!;
      const resolution = resolver.resolve('#/color/alias');

      expect(resolution.diagnostics).toHaveLength(0);
      expect(resolution.token).toBeDefined();

      const token = resolution.token!;
      expect(token.value).toEqual({
        colorSpace: 'srgb',
        components: [0.1, 0.2, 0.3],
        hex: '#1A334C',
      });
      expect(token.trace.at(-1)?.pointer).toBe('#/__external/0/color/base');

      const firstLoadCount = loadSpy.mock.calls.length;
      expect(firstLoadCount).toBeGreaterThan(0);

      loadSpy.mockClear();

      const secondResult = await adapter.parse(plan, {});

      expect(secondResult.diagnostics).toEqual(firstResult.diagnostics);
      expect(secondResult.sources).toHaveLength(1);

      const secondResolution = secondResult.sources[0]?.tokenSet.resolver?.resolve('#/color/alias');

      expect(secondResolution?.diagnostics ?? []).toHaveLength(0);
      expect(secondResolution?.token?.value).toEqual({
        colorSpace: 'srgb',
        components: [0.1, 0.2, 0.3],
        hex: '#1A334C',
      });

      expect(loadSpy).not.toHaveBeenCalled();
    } finally {
      parseTokensSpy.mockImplementation(actualParseTokens.current);
      loadSpy.mockRestore();
    }
  });
});

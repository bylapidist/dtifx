import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveSourceUri, createTokenSetFromParseResult } from './index.js';
import { INLINE_SOURCE_URI } from './types.js';
import {
  DocumentResolver,
  type DocumentAst,
  type DocumentGraph,
  type GraphAliasNode,
  type GraphCollectionNode,
  type GraphNode,
  type GraphSnapshot,
  type GraphTokenNode,
  type JsonPointer,
  type ParseDocumentResult,
  type RawDocument,
  type ResolutionOutcome,
  type SourceSpan,
  type DiagnosticEvent,
} from '@lapidist/dtif-parser';

type DeprecatedMetadataField = NonNullable<GraphTokenNode['metadata']['deprecated']>;
type DeprecatedReplacementField = NonNullable<DeprecatedMetadataField['value']['replacement']>;

describe('resolveSourceUri', () => {
  it('returns the inline sentinel when no source is provided', () => {
    const uri = resolveSourceUri();
    expect(uri.href).toBe(INLINE_SOURCE_URI.href);
  });

  it('converts filesystem paths into file URLs', () => {
    const uri = resolveSourceUri('tokens.json');
    expect(uri.protocol).toBe('file:');
    expect(uri.pathname.endsWith('tokens.json')).toBe(true);
  });

  it('passes through existing file URLs', () => {
    const fileUrl = pathToFileURL(path.resolve('tokens.json'));
    const uri = resolveSourceUri(fileUrl.href);
    expect(uri.href).toBe(fileUrl.href);
  });
});

describe('createTokenSetFromParseResult', () => {
  it('includes valid replacement pointers without diagnostics', () => {
    const result = createParseResultWithDeprecatedReplacement();
    const diagnostics: DiagnosticEvent[] = [];
    const tokenSet = createTokenSetFromParseResult(result, {
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const snapshot = tokenSet.tokens.get('#/palette/primary');

    expect(snapshot?.deprecated?.supersededBy).toEqual({
      pointer: '#/palette/secondary',
      uri: 'memory://test.tokens.json',
    });
    expect(snapshot?.deprecated?.diagnostics).toBeUndefined();
    expect(diagnostics).toHaveLength(0);
  });

  it('omits invalid replacement pointers and reports diagnostics', () => {
    const result = createParseResultWithDeprecatedReplacement({
      replacementValue: '  ',
    });
    const diagnostics: DiagnosticEvent[] = [];
    const tokenSet = createTokenSetFromParseResult(result, {
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const snapshot = tokenSet.tokens.get('#/palette/primary');

    expect(snapshot?.deprecated?.supersededBy).toBeUndefined();
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'DTIF1010', severity: 'error' })]),
    );
  });

  it('marks tokens as deprecated when replacement metadata is omitted', () => {
    const result = createParseResultWithDeprecatedReplacement({
      includeReplacementField: false,
    });
    const diagnostics: DiagnosticEvent[] = [];
    const tokenSet = createTokenSetFromParseResult(result, {
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const snapshot = tokenSet.tokens.get('#/palette/primary');

    expect(snapshot?.deprecated).toEqual({});
    expect(diagnostics).toHaveLength(0);
  });

  it('retains replacement pointers and reports type mismatch diagnostics', () => {
    const result = createParseResultWithDeprecatedReplacement({
      targetType: 'dimension',
    });
    const diagnostics: DiagnosticEvent[] = [];
    const tokenSet = createTokenSetFromParseResult(result, {
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    const snapshot = tokenSet.tokens.get('#/palette/primary');

    expect(snapshot?.deprecated?.supersededBy).toEqual({
      pointer: '#/palette/secondary',
      uri: 'memory://test.tokens.json',
    });
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'DTIF1021', severity: 'error' })]),
    );
  });

  it('populates canonical references, resolution paths, and alias trails', () => {
    const result = createParseResultWithAliasGraph();
    const tokenSet = createTokenSetFromParseResult(result);

    const baseSnapshot = tokenSet.tokens.get('#/palette/primary');
    expect(baseSnapshot?.references).toEqual([
      { pointer: '#/palette/primary/$value', uri: 'memory://test.tokens.json' },
    ]);
    expect(baseSnapshot?.resolutionPath).toEqual([
      { pointer: '#/palette/primary', uri: 'memory://test.tokens.json' },
    ]);
    expect(baseSnapshot?.appliedAliases).toEqual([]);

    const aliasSnapshot = tokenSet.tokens.get('#/palette/primaryAlias');
    expect(aliasSnapshot?.references).toEqual([
      { pointer: '#/palette/primary', uri: 'memory://test.tokens.json' },
      { pointer: '#/palette/primary/$value', uri: 'memory://test.tokens.json' },
    ]);
    expect(aliasSnapshot?.resolutionPath).toEqual([
      { pointer: '#/palette/primaryAlias', uri: 'memory://test.tokens.json' },
      { pointer: '#/palette/primary', uri: 'memory://test.tokens.json' },
    ]);
    expect(aliasSnapshot?.appliedAliases).toEqual([
      { pointer: '#/palette/primaryAlias', uri: 'memory://test.tokens.json' },
    ]);
  });
});

function createParseResultWithDeprecatedReplacement(
  options: {
    readonly replacementPointer?: string;
    readonly replacementValue?: unknown;
    readonly includeReplacementField?: boolean;
    readonly targetType?: string;
    readonly tokenType?: string;
  } = {},
): ParseDocumentResult {
  const uri = new URL('memory://test.tokens.json');
  const identity = { uri, contentType: 'application/json' as const };
  const createSpan = (line: number, column: number): SourceSpan => ({
    uri,
    start: { line, column, offset: 0 },
    end: { line, column, offset: 0 },
  });

  const includeReplacementField = options.includeReplacementField ?? true;
  const replacementPointer = options.replacementPointer ?? '#/palette/secondary';
  const replacementValue = options.replacementValue ?? replacementPointer;

  const replacementField: DeprecatedReplacementField | undefined = includeReplacementField
    ? {
        value: replacementValue as DeprecatedReplacementField['value'],
        pointer: '#/palette/primary/$deprecated/$replacement',
        span: createSpan(1, 20),
      }
    : undefined;

  const deprecatedField = {
    value: {
      active: true,
      ...(replacementField ? { replacement: replacementField } : {}),
    },
    pointer: '#/palette/primary/$deprecated',
    span: createSpan(1, 10),
  } satisfies DeprecatedMetadataField;

  const primaryToken = {
    kind: 'token',
    name: 'primary',
    pointer: '#/palette/primary' as JsonPointer,
    path: ['palette', 'primary'],
    parent: '#/palette' as JsonPointer,
    span: createSpan(1, 1),
    metadata: {
      deprecated: deprecatedField,
    },
    type: {
      value: options.tokenType ?? 'color',
      pointer: '#/palette/primary/$type',
      span: createSpan(1, 5),
    },
    value: {
      value: '#ff0000',
      pointer: '#/palette/primary/$value',
      span: createSpan(1, 6),
    },
  } satisfies GraphTokenNode;

  const secondaryToken = {
    kind: 'token',
    name: 'secondary',
    pointer: '#/palette/secondary' as JsonPointer,
    path: ['palette', 'secondary'],
    parent: '#/palette' as JsonPointer,
    span: createSpan(2, 1),
    metadata: {},
    type: {
      value: options.targetType ?? 'color',
      pointer: '#/palette/secondary/$type',
      span: createSpan(2, 5),
    },
    value: {
      value: '#00ff00',
      pointer: '#/palette/secondary/$value',
      span: createSpan(2, 6),
    },
  } satisfies GraphTokenNode;

  const paletteCollection = {
    kind: 'collection',
    name: 'palette',
    pointer: '#/palette' as JsonPointer,
    path: ['palette'],
    span: createSpan(3, 1),
    metadata: {},
    children: [primaryToken.pointer, secondaryToken.pointer],
  } satisfies GraphCollectionNode;

  const nodes = new Map<JsonPointer, GraphNode>([
    [paletteCollection.pointer, paletteCollection],
    [primaryToken.pointer, primaryToken],
    [secondaryToken.pointer, secondaryToken],
  ]);

  const documentAst = {
    kind: 'document',
    uri,
    pointer: '#',
    metadata: {},
    children: [],
    overrides: [],
  } satisfies DocumentAst;

  const graph = {
    kind: 'document-graph',
    uri,
    ast: documentAst,
    nodes,
    rootPointers: ['#/palette'],
    overrides: [],
  } satisfies DocumentGraph;

  const resolver = new DocumentResolver(graph);

  const rawDocument = {
    identity,
    bytes: new Uint8Array(),
  } satisfies RawDocument;

  const graphSnapshot = {
    identity,
    graph,
  } satisfies GraphSnapshot<DocumentGraph>;

  const resolution = {
    identity,
    result: resolver,
    diagnostics: [],
  } satisfies ResolutionOutcome<DocumentResolver>;

  return {
    document: rawDocument,
    decoded: undefined,
    normalized: undefined,
    graph: graphSnapshot,
    resolution,
    diagnostics: [],
    fromCache: false,
  } satisfies ParseDocumentResult;
}

function createParseResultWithAliasGraph(): ParseDocumentResult {
  const uri = new URL('memory://test.tokens.json');
  const identity = { uri, contentType: 'application/json' as const };
  const createSpan = (line: number, column: number): SourceSpan => ({
    uri,
    start: { line, column, offset: 0 },
    end: { line, column, offset: 0 },
  });

  const primaryToken = {
    kind: 'token',
    name: 'primary',
    pointer: '#/palette/primary' as JsonPointer,
    path: ['palette', 'primary'],
    parent: '#/palette' as JsonPointer,
    span: createSpan(1, 1),
    metadata: {},
    type: {
      value: 'color',
      pointer: '#/palette/primary/$type',
      span: createSpan(1, 5),
    },
    value: {
      value: '#ff0000',
      pointer: '#/palette/primary/$value',
      span: createSpan(1, 6),
    },
  } satisfies GraphTokenNode;

  const aliasToken = {
    kind: 'alias',
    name: 'primaryAlias',
    pointer: '#/palette/primaryAlias' as JsonPointer,
    path: ['palette', 'primaryAlias'],
    parent: '#/palette' as JsonPointer,
    span: createSpan(2, 1),
    metadata: {},
    type: {
      value: 'color',
      pointer: '#/palette/primaryAlias/$type',
      span: createSpan(2, 5),
    },
    ref: {
      value: {
        pointer: '#/palette/primary' as JsonPointer,
        uri,
        external: false,
      },
      pointer: '#/palette/primaryAlias/$ref',
      span: createSpan(2, 10),
    },
  } satisfies GraphAliasNode;

  const paletteCollection = {
    kind: 'collection',
    name: 'palette',
    pointer: '#/palette' as JsonPointer,
    path: ['palette'],
    span: createSpan(3, 1),
    metadata: {},
    children: [primaryToken.pointer, aliasToken.pointer],
  } satisfies GraphCollectionNode;

  const nodes = new Map<JsonPointer, GraphNode>([
    [paletteCollection.pointer, paletteCollection],
    [primaryToken.pointer, primaryToken],
    [aliasToken.pointer, aliasToken],
  ]);

  const documentAst = {
    kind: 'document',
    uri,
    pointer: '#',
    metadata: {},
    children: [],
    overrides: [],
  } satisfies DocumentAst;

  const graph = {
    kind: 'document-graph',
    uri,
    ast: documentAst,
    nodes,
    rootPointers: ['#/palette'],
    overrides: [],
  } satisfies DocumentGraph;

  const resolver = new DocumentResolver(graph);

  const rawDocument = {
    identity,
    bytes: new Uint8Array(),
  } satisfies RawDocument;

  const graphSnapshot = {
    identity,
    graph,
  } satisfies GraphSnapshot<DocumentGraph>;

  const resolution = {
    identity,
    result: resolver,
    diagnostics: [],
  } satisfies ResolutionOutcome<DocumentResolver>;

  return {
    document: rawDocument,
    decoded: undefined,
    normalized: undefined,
    graph: graphSnapshot,
    resolution,
    diagnostics: [],
    fromCache: false,
  } satisfies ParseDocumentResult;
}

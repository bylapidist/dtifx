import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { JsonPointer } from '@lapidist/dtif-parser';
import type { TokenMetadataSnapshot } from '@dtifx/core';

import type { FormatterToken } from '../../formatter-registry.js';
import { getDecodedPointerSegments } from '../../../infrastructure/formatting/token-pointer.js';

const SUPPORTED_ASSET_EXTENSIONS = new Set<string>([
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'ico',
  'bmp',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  'mp4',
  'webm',
  'ogg',
  'mp3',
  'wav',
  'flac',
  'txt',
  'json',
  'csv',
  'pdf',
  'webmanifest',
]);

export type DocsAssetStatus = 'copied' | 'missing';

export type DocsAssetKind = 'image' | 'font' | 'data' | 'unknown';

export interface DocsTokenExample {
  readonly name: string;
  readonly kind: 'value' | 'raw' | 'resolution' | 'transform';
  readonly payload: unknown;
  readonly transform?: string;
  readonly assets?: readonly string[];
}

export interface DocsTokenEntry {
  readonly pointer: JsonPointer;
  readonly path: readonly string[];
  readonly name: string;
  readonly type?: string;
  readonly metadata?: TokenMetadataSnapshot;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly source: {
    readonly sourceId: string;
    readonly layer: string;
    readonly layerIndex: number;
    readonly pointerPrefix: JsonPointer;
    readonly uri: string;
  };
  readonly examples: readonly DocsTokenExample[];
}

export interface DocsTokenGroup {
  readonly type: string;
  readonly tokenCount: number;
  readonly tokens: readonly DocsTokenEntry[];
}

export interface DocsAsset {
  readonly outputPath: string;
  readonly sourceUri: string;
  readonly fileName: string;
  readonly originalReferences: readonly string[];
  readonly pointers: readonly string[];
  readonly kind: DocsAssetKind;
  readonly status: DocsAssetStatus;
  readonly size?: number;
  readonly lastModified?: string;
}

export interface DocsDocumentationModelBase {
  readonly title: string;
  readonly description?: string;
  readonly generatedAt: string;
  readonly tokenCount: number;
  readonly groupCount: number;
  readonly transformCount: number;
  readonly groups: readonly DocsTokenGroup[];
  readonly transforms: readonly string[];
}

export interface DocsDocumentationModel extends DocsDocumentationModelBase {
  readonly assets: readonly DocsAsset[];
  readonly warnings: readonly string[];
}

export interface DocumentationAssetPlan {
  readonly key: string;
  readonly sourceUri: string;
  readonly filePath: string;
  readonly outputPath: string;
  readonly fileName: string;
  readonly originalReferences: readonly string[];
  readonly pointers: readonly string[];
}

export interface DocumentationPlan {
  readonly model: DocsDocumentationModelBase;
  readonly assets: readonly DocumentationAssetPlan[];
  readonly warnings: readonly string[];
}

export interface DocumentationModelOptions {
  readonly title: string;
  readonly description?: string;
}

interface AssetBuilderEntry {
  readonly key: string;
  readonly sourceUri: string;
  readonly filePath: string;
  readonly outputPath: string;
  readonly fileName: string;
  readonly references: Set<string>;
  readonly pointers: Set<JsonPointer>;
}

/**
 * Builds a documentation plan for the supplied formatter tokens, capturing grouped token metadata
 * and referenced asset descriptors.
 *
 * @param {readonly FormatterToken[]} tokens - Tokens emitted by the formatter engine.
 * @param {DocumentationModelOptions} options - Display options for the resulting documentation.
 * @returns {DocumentationPlan} The documentation plan containing grouped token data and asset plans.
 */
export function createDocumentationPlan(
  tokens: readonly FormatterToken[],
  options: DocumentationModelOptions,
): DocumentationPlan {
  const builder = new DocumentationModelBuilder(options);
  for (const token of tokens) {
    builder.addToken(token);
  }
  return builder.build();
}

class DocumentationModelBuilder {
  private readonly options: DocumentationModelOptions;

  private readonly groups = new Map<string, DocsTokenEntry[]>();

  private readonly transformNames = new Set<string>();

  private readonly assetEntries = new Map<string, AssetBuilderEntry>();

  private readonly warnings = new Set<string>();

  private tokenCount = 0;

  constructor(options: DocumentationModelOptions) {
    this.options = options;
  }

  addToken(token: FormatterToken): void {
    this.tokenCount += 1;
    const groupKey = token.type ?? 'unknown';
    const group = this.resolveGroup(groupKey);
    const entry = this.createTokenEntry(token);
    group.push(entry);
  }

  build(): DocumentationPlan {
    const groups = [...this.groups.entries()]
      .map(([type, tokens]) => ({
        type,
        tokenCount: tokens.length,
        tokens: tokens.toSorted((left, right) => left.pointer.localeCompare(right.pointer)),
      }))
      .toSorted((left, right) => left.type.localeCompare(right.type));

    const transforms = [...this.transformNames].toSorted((left, right) =>
      left.localeCompare(right),
    );

    const assets = [...this.assetEntries.values()].map((entry) => ({
      key: entry.key,
      sourceUri: entry.sourceUri,
      filePath: entry.filePath,
      outputPath: entry.outputPath,
      fileName: entry.fileName,
      originalReferences: [...entry.references].toSorted((left, right) =>
        left.localeCompare(right),
      ),
      pointers: [...entry.pointers].toSorted((left, right) => left.localeCompare(right)),
    }));

    const description = this.options.description;
    const model: DocsDocumentationModelBase = {
      title: this.options.title,
      ...(description === undefined ? {} : { description }),
      generatedAt: new Date().toISOString(),
      tokenCount: this.tokenCount,
      groupCount: groups.length,
      transformCount: transforms.length,
      groups,
      transforms,
    } satisfies DocsDocumentationModelBase;

    return {
      model,
      assets,
      warnings: [...this.warnings],
    } satisfies DocumentationPlan;
  }

  private resolveGroup(type: string): DocsTokenEntry[] {
    const group = this.groups.get(type);
    if (group) {
      return group;
    }
    const created: DocsTokenEntry[] = [];
    this.groups.set(type, created);
    return created;
  }

  private createTokenEntry(token: FormatterToken): DocsTokenEntry {
    const pointer = token.pointer;
    const path = getDecodedPointerSegments(pointer);
    const name = path.length === 0 ? pointer : (path.at(-1) ?? pointer);
    const metadata = token.metadata ? structuredClone(token.metadata) : undefined;
    const context = token.snapshot.context ? structuredClone(token.snapshot.context) : undefined;
    const source = {
      sourceId: token.snapshot.provenance.sourceId,
      layer: token.snapshot.provenance.layer,
      layerIndex: token.snapshot.provenance.layerIndex,
      pointerPrefix: token.snapshot.provenance.pointerPrefix,
      uri: token.snapshot.provenance.uri,
    } satisfies DocsTokenEntry['source'];
    const examples = this.createExamples(token);

    const entry: DocsTokenEntry = {
      pointer,
      path,
      name,
      source,
      examples,
      ...(token.type === undefined ? {} : { type: token.type }),
      ...(metadata === undefined ? {} : { metadata }),
      ...(context === undefined ? {} : { context }),
    } satisfies DocsTokenEntry;

    return entry;
  }

  private createExamples(token: FormatterToken): readonly DocsTokenExample[] {
    const examples: DocsTokenExample[] = [];
    const valueAssets = this.collectAssets(token, token.value);
    examples.push({
      name: 'value',
      kind: 'value',
      payload: cloneJson(token.value),
      ...(valueAssets === undefined ? {} : { assets: valueAssets }),
    });

    if (token.raw !== undefined) {
      const rawAssets = this.collectAssets(token, token.raw);
      examples.push({
        name: 'raw',
        kind: 'raw',
        payload: cloneJson(token.raw),
        ...(rawAssets === undefined ? {} : { assets: rawAssets }),
      });
    }

    if (token.snapshot.resolution !== undefined) {
      const resolutionAssets = this.collectAssets(token, token.snapshot.resolution);
      examples.push({
        name: 'resolution',
        kind: 'resolution',
        payload: cloneJson(token.snapshot.resolution),
        ...(resolutionAssets === undefined ? {} : { assets: resolutionAssets }),
      });
    }

    const transformEntries = [...token.transforms.entries()].toSorted(([left], [right]) =>
      left.localeCompare(right),
    );
    for (const [transform, output] of transformEntries) {
      this.transformNames.add(transform);
      const transformAssets = this.collectAssets(token, output);
      examples.push({
        name: transform,
        kind: 'transform',
        transform,
        payload: cloneJson(output),
        ...(transformAssets === undefined ? {} : { assets: transformAssets }),
      });
    }

    return examples;
  }

  private collectAssets(token: FormatterToken, value: unknown): readonly string[] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const seen = new Set<unknown>();
    const queue: unknown[] = [value];
    const assets = new Set<string>();

    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined || current === null) {
        continue;
      }
      if (typeof current === 'string') {
        this.extractAssetReferences(token, current, assets);
        continue;
      }
      if (typeof current !== 'object') {
        continue;
      }
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);
      if (Array.isArray(current)) {
        for (const entry of current) {
          queue.push(entry);
        }
        continue;
      }
      for (const entry of Object.values(current as Record<string, unknown>)) {
        queue.push(entry);
      }
    }

    if (assets.size === 0) {
      return undefined;
    }
    return [...assets].toSorted((left, right) => left.localeCompare(right));
  }

  private extractAssetReferences(
    token: FormatterToken,
    candidate: string,
    assets: Set<string>,
  ): void {
    const register = (reference: string) => {
      if (!this.looksLikeAssetReference(reference)) {
        return;
      }
      const outputPath = this.resolveAssetReference(token, reference);
      if (outputPath) {
        assets.add(outputPath);
      }
    };

    const urlPattern = /url\(([^)]+)\)/gi;
    let match: RegExpExecArray | null;
    while ((match = urlPattern.exec(candidate)) !== null) {
      const raw = match[1]!.trim();
      register(stripWrappingQuotes(raw));
    }

    const trimmed = candidate.trim();
    register(trimmed);
  }

  private looksLikeAssetReference(value: string): boolean {
    if (value.length === 0) {
      return false;
    }
    if (value.startsWith('#')) {
      return false;
    }
    if (value.startsWith('data:')) {
      return false;
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return false;
    }
    if (value.startsWith('file://')) {
      return true;
    }
    if (value.startsWith('./') || value.startsWith('../') || value.startsWith('/')) {
      return true;
    }
    const normalised = stripQueryAndFragment(value);
    const extensionWithDot = path.extname(normalised).toLowerCase();
    const extension = extensionWithDot.startsWith('.')
      ? extensionWithDot.slice(1)
      : extensionWithDot;
    if (extension.length > 0 && SUPPORTED_ASSET_EXTENSIONS.has(extension)) {
      return true;
    }
    return false;
  }

  private resolveAssetReference(token: FormatterToken, reference: string): string | undefined {
    const baseUri = token.snapshot.provenance.uri;
    if (!baseUri) {
      this.warnings.add(
        `Unable to resolve asset reference "${reference}" for token ${token.pointer} because provenance URI is missing.`,
      );
      return undefined;
    }
    let resolved: URL;
    try {
      resolved = new URL(reference, baseUri);
    } catch (error) {
      this.warnings.add(
        `Unable to resolve asset reference "${reference}" for token ${token.pointer}: ${String(
          error,
        )}.`,
      );
      return undefined;
    }
    if (resolved.protocol !== 'file:') {
      return undefined;
    }
    const key = resolved.toString();
    let entry = this.assetEntries.get(key);
    if (!entry) {
      const filePath = fileURLToPath(resolved);
      const fileName = path.basename(filePath) || 'asset';
      const hash = createHash('sha1').update(filePath).digest('hex').slice(0, 10);
      const outputName = `${hash}-${fileName}`;
      const outputPath = path.posix.join('assets', 'media', outputName);
      entry = {
        key,
        sourceUri: key,
        filePath,
        outputPath,
        fileName,
        references: new Set<string>(),
        pointers: new Set<JsonPointer>(),
      } satisfies AssetBuilderEntry;
      this.assetEntries.set(key, entry);
    }
    entry.references.add(reference);
    entry.pointers.add(token.pointer);
    return entry.outputPath;
  }
}

function stripQueryAndFragment(value: string): string {
  const [sanitised] = value.split(/[?#]/, 1);
  return sanitised ?? value;
}

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) {
    return value;
  }
  const startsWithSingle = value.startsWith("'");
  const startsWithDouble = value.startsWith('"');
  if (startsWithSingle || startsWithDouble) {
    const quote = value[0]!;
    if (value.endsWith(quote)) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function cloneJson<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

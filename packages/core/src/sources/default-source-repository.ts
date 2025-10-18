import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { DesignTokenInterchangeFormat } from '@lapidist/dtif-schema';
import { JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import type { JsonPointer } from '@lapidist/dtif-parser';
import fg from 'fast-glob';

import type { TokenSourceRepositoryIssue } from '../token-sources/issues.js';
import {
  PointerTemplateError,
  resolvePointerTemplate,
  type PointerTemplateContext,
} from './pointer-template-resolver.js';
import type {
  TokenSourceDiscoveryContext,
  TokenSourceDiscoveryOutcome,
  TokenSourceDocument,
  TokenSourceRepositoryPort,
} from './repository.js';

export interface DefaultSourceRepositoryOptions {
  readonly readFile?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  readonly glob?: (patterns: readonly string[], options: fg.Options) => Promise<string[]>;
  readonly cwd?: () => string;
  readonly lstat?: typeof lstat;
}

export class DefaultSourceRepository implements TokenSourceRepositoryPort {
  private readonly readFileImpl: Required<DefaultSourceRepositoryOptions>['readFile'];
  private readonly globImpl: Required<DefaultSourceRepositoryOptions>['glob'];
  private readonly cwdImpl: Required<DefaultSourceRepositoryOptions>['cwd'];
  private readonly lstatImpl: Required<DefaultSourceRepositoryOptions>['lstat'];

  constructor(options: DefaultSourceRepositoryOptions = {}) {
    this.readFileImpl = options.readFile ?? readFile;
    this.globImpl = options.glob ?? defaultGlob;
    this.cwdImpl = options.cwd ?? process.cwd.bind(process);
    this.lstatImpl = options.lstat ?? lstat;
  }

  async discover(context: TokenSourceDiscoveryContext): Promise<TokenSourceDiscoveryOutcome> {
    switch (context.source.kind) {
      case 'file': {
        return this.discoverFile(context as FileDiscoveryContext);
      }
      case 'virtual': {
        return this.discoverVirtual(context as VirtualDiscoveryContext);
      }
      default: {
        const source = context.source as { kind: string };
        throw new Error(`Unsupported source kind "${source.kind}"`);
      }
    }
  }

  private async discoverFile(context: FileDiscoveryContext): Promise<TokenSourceDiscoveryOutcome> {
    const rootDir = path.resolve(this.cwdImpl(), context.source.rootDir ?? '.');
    const matches = await this.globImpl([...context.source.patterns], {
      absolute: true,
      onlyFiles: true,
      dot: false,
      followSymbolicLinks: false,
      ...(context.source.ignore ? { ignore: [...context.source.ignore] } : {}),
      cwd: rootDir,
    });
    const sortedMatches = [...matches].toSorted((left, right) =>
      this.toPosix(left).localeCompare(this.toPosix(right)),
    );

    const documents: TokenSourceDocument[] = [];
    const issues: TokenSourceRepositoryIssue[] = [];

    for (const filePath of sortedMatches) {
      const posixFile = this.toPosix(filePath);
      const relative = this.toPosix(path.relative(rootDir, filePath));
      const segments = relative.split(path.posix.sep).filter((segment) => segment.length > 0);
      const basename = segments.at(-1) ?? relative;
      const stem = this.extractStem(basename);
      const uri = pathToFileURL(filePath).toString();

      try {
        const stats = await this.lstatImpl(filePath);
        if (stats.isSymbolicLink()) {
          continue;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to stat file';
        issues.push(
          this.createRepositoryIssue(context, {
            uri,
            pointerPrefix: context.source.pointerTemplate.base ?? JSON_POINTER_ROOT,
            code: 'parse-error',
            message,
            details: { file: posixFile },
          }),
        );
        continue;
      }

      let pointerPrefix: JsonPointer;
      try {
        const templateContext: PointerTemplateContext = {
          sourceId: context.source.id,
          relativeSegments: segments,
          basename,
          stem,
        };
        pointerPrefix = resolvePointerTemplate(context.source.pointerTemplate, templateContext);
      } catch (error) {
        if (error instanceof PointerTemplateError) {
          issues.push(
            this.createRepositoryIssue(context, {
              uri,
              pointerPrefix: context.source.pointerTemplate.base ?? JSON_POINTER_ROOT,
              code: 'pointer-template',
              message: error.message,
              details: { file: posixFile },
            }),
          );
          continue;
        }
        throw error;
      }

      let document: DesignTokenInterchangeFormat | undefined;
      try {
        const raw = await this.readFileImpl(posixFile, 'utf8');
        document = JSON.parse(raw) as DesignTokenInterchangeFormat;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to parse JSON file';
        issues.push(
          this.createRepositoryIssue(context, {
            uri,
            pointerPrefix,
            code: 'parse-error',
            message,
            details: { file: posixFile },
          }),
        );
        continue;
      }

      documents.push({
        uri,
        pointerPrefix,
        document,
        context: this.createDocumentContext(context, pointerPrefix, uri),
      });
    }

    return { documents, issues } satisfies TokenSourceDiscoveryOutcome;
  }

  private async discoverVirtual(
    context: VirtualDiscoveryContext,
  ): Promise<TokenSourceDiscoveryOutcome> {
    let pointerPrefix: JsonPointer;
    try {
      pointerPrefix = resolvePointerTemplate(context.source.pointerTemplate, {
        sourceId: context.source.id,
      });
    } catch (error) {
      if (error instanceof PointerTemplateError) {
        return {
          documents: [],
          issues: [
            this.createRepositoryIssue(context, {
              uri: `virtual:${context.source.id}`,
              pointerPrefix: context.source.pointerTemplate.base ?? JSON_POINTER_ROOT,
              code: 'pointer-template',
              message: error.message,
            }),
          ],
        } satisfies TokenSourceDiscoveryOutcome;
      }
      throw error;
    }

    const uri = `virtual:${context.source.id}`;
    const documents: TokenSourceDocument[] = [];
    const issues: TokenSourceRepositoryIssue[] = [];

    try {
      const result = await context.source.document();
      documents.push({
        uri,
        pointerPrefix,
        document: result,
        context: this.createDocumentContext(context, pointerPrefix, uri),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown virtual source failure';
      issues.push(
        this.createRepositoryIssue(context, {
          uri,
          pointerPrefix,
          code: 'virtual-error',
          message,
        }),
      );
    }

    return { documents, issues } satisfies TokenSourceDiscoveryOutcome;
  }

  private createDocumentContext(
    context: TokenSourceDiscoveryContext,
    pointerPrefix: JsonPointer,
    uri: string,
  ): Readonly<Record<string, unknown>> {
    return {
      pointerPrefix,
      uri,
      sourceId: context.source.id,
    };
  }

  private createRepositoryIssue(
    context: TokenSourceDiscoveryContext,
    issue: {
      readonly uri: string;
      readonly pointerPrefix: JsonPointer;
      readonly code: string;
      readonly message: string;
      readonly details?: Readonly<Record<string, unknown>>;
      readonly severity?: 'error' | 'warning';
    },
  ): TokenSourceRepositoryIssue {
    return {
      kind: 'repository',
      sourceId: context.source.id,
      uri: issue.uri,
      pointerPrefix: issue.pointerPrefix,
      code: issue.code,
      message: issue.message,
      ...(issue.details ? { details: issue.details } : {}),
      ...(issue.severity ? { severity: issue.severity } : {}),
    } satisfies TokenSourceRepositoryIssue;
  }

  private toPosix(filePath: string): string {
    return filePath.split(path.sep).join(path.posix.sep);
  }

  private extractStem(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
  }
}

type FileDiscoveryContext = TokenSourceDiscoveryContext & {
  readonly source: Extract<TokenSourceDiscoveryContext['source'], { kind: 'file' }>;
};

type VirtualDiscoveryContext = TokenSourceDiscoveryContext & {
  readonly source: Extract<TokenSourceDiscoveryContext['source'], { kind: 'virtual' }>;
};

async function defaultGlob(patterns: readonly string[], options: fg.Options): Promise<string[]> {
  return fg([...patterns], options);
}

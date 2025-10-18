import { DiagnosticCodes, type Diagnostic } from '@lapidist/dtif-parser';

export type { DesignTokenInterchangeFormat } from '@lapidist/dtif-schema';

export type TokenPath = readonly string[];

export interface TokenPointer {
  readonly pointer: string;
  readonly uri: string;
  readonly external?: boolean;
}

export interface TokenDeprecation {
  readonly supersededBy?: TokenPointer;
  readonly since?: string;
  readonly reason?: string;
  readonly diagnostics?: readonly Diagnostic[];
}

export interface TokenSourceLocation {
  readonly uri: string;
  readonly line: number;
  readonly column: number;
}

export interface TokenSnapshot {
  readonly id: string;
  readonly path: TokenPath;
  readonly type?: string;
  readonly value?: unknown;
  readonly raw?: unknown;
  readonly ref?: string;
  readonly description?: string;
  readonly $lastModified?: string;
  readonly $lastUsed?: string;
  readonly $usageCount?: number;
  readonly $author?: string;
  readonly $tags?: readonly string[];
  readonly $hash?: string;
  readonly extensions: Record<string, unknown>;
  readonly deprecated?: TokenDeprecation;
  readonly source: TokenSourceLocation;
  readonly references: readonly TokenPointer[];
  readonly resolutionPath: readonly TokenPointer[];
  readonly appliedAliases: readonly TokenPointer[];
}

export interface TokenResolutionTraceStep {
  readonly pointer: string;
  readonly kind: string;
}

export interface TokenResolutionToken {
  readonly pointer: string;
  readonly uri: URL;
  readonly type?: string;
  readonly value?: unknown;
  readonly source?: {
    readonly uri: URL;
    readonly pointer?: string;
  };
  readonly warnings: readonly unknown[];
  readonly overridesApplied: readonly unknown[];
  readonly trace: readonly TokenResolutionTraceStep[];
  toJSON(): unknown;
}

export interface TokenResolution {
  readonly token?: TokenResolutionToken;
  readonly diagnostics: readonly unknown[];
  readonly transforms: readonly unknown[];
}

export interface TokenSetResolver {
  resolve(pointer: string): TokenResolution;
}

export interface TokenSet {
  readonly tokens: ReadonlyMap<string, TokenSnapshot>;
  readonly source?: string;
  readonly document?: unknown;
  readonly graph?: unknown;
  readonly resolver?: TokenSetResolver;
}

export const INLINE_SOURCE_URI = new URL('memory://inline-dtif');

/**
 * Produces the stable JSON pointer identifier for a token path.
 *
 * @param path - The hierarchical path segments leading to the token.
 * @returns The JSON pointer string used to reference the token.
 */
export function createTokenId(path: readonly string[]): string {
  return `#/` + path.join('/');
}

/**
 * Creates a token pointer descriptor referencing a token at a specific URI.
 *
 * @param pointer - The JSON pointer for the token within the document.
 * @param uri - The document URI containing the token.
 * @param external - Whether the token originates from an external source.
 * @returns The token pointer metadata used by reporting utilities.
 */
export function createTokenPointer(pointer: string, uri: URL, external: boolean): TokenPointer {
  return {
    pointer,
    uri: uri.href,
    ...(external ? { external: true } : {}),
  };
}

/**
 * Converts a resolver target into a token pointer representation.
 *
 * @param target - The target metadata produced by the resolution engine.
 * @param target.pointer - JSON pointer identifying the token.
 * @param target.uri - Source document URI for the token.
 * @param target.external - Whether the token originates from an external document.
 * @returns The normalized pointer for downstream consumers.
 */
export function createTokenPointerFromTarget(target: {
  readonly pointer: string;
  readonly uri: URL;
  readonly external: boolean;
}): TokenPointer {
  return createTokenPointer(target.pointer, target.uri, target.external);
}

/**
 * Provides a default source location referencing the start of a document.
 *
 * @param uri - The URI of the document the token originated from.
 * @returns A source location pointing at the beginning of the file.
 */
export function createDefaultSourceLocation(uri: URL): TokenSourceLocation {
  return {
    uri: uri.href,
    line: 1,
    column: 1,
  };
}

/**
 * Performs a deep clone of a token value to avoid mutating cached snapshots.
 *
 * @param value - The token value to clone.
 * @returns A structural clone of the provided value.
 */
export function cloneTokenValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneTokenValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        cloneTokenValue(entry),
      ]),
    ) as T;
  }

  return value;
}

/**
 * Deeply clones extension metadata attached to a token snapshot.
 *
 * @param value - The raw extension object to duplicate.
 * @returns A cloned record safe for mutation.
 */
export function cloneTokenExtensions(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    cloneTokenValue(entry),
  ]);

  return Object.fromEntries(entries);
}

/**
 * Creates a resolver that can resolve tokens from the provided in-memory set.
 *
 * @param tokens - The token map keyed by pointer.
 * @param uri - The URI associated with the in-memory document.
 * @returns A resolver compatible with the token resolution interfaces.
 */
export function createInlineResolver(
  tokens: ReadonlyMap<string, TokenSnapshot>,
  uri: URL,
): TokenSetResolver {
  return new InlineResolver(tokens, uri);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toJsonPointer(pointer: string): string {
  if (pointer.startsWith('#/')) {
    return pointer;
  }

  throw new Error(`Invalid token pointer: ${pointer}`);
}

interface InlineResolverDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: 'error';
  readonly pointer: string;
}

class InlineResolver implements TokenSetResolver {
  constructor(
    private readonly tokens: ReadonlyMap<string, TokenSnapshot>,
    private readonly uri: URL,
  ) {}

  resolve(pointer: string): TokenResolution {
    const normalizedPointer = toJsonPointer(pointer);
    const trace: TokenResolutionTraceStep[] = [];
    const visited = new Set<string>();
    const diagnostics: InlineResolverDiagnostic[] = [];
    let currentPointer = normalizedPointer;
    let lastSnapshot: TokenSnapshot | undefined;

    while (true) {
      if (visited.has(currentPointer)) {
        diagnostics.push({
          code: DiagnosticCodes.resolver.CYCLE_DETECTED,
          message: `Circular reference detected while resolving "${currentPointer}".`,
          severity: 'error',
          pointer: currentPointer,
        });

        break;
      }

      visited.add(currentPointer);

      const snapshot = this.tokens.get(currentPointer);

      if (snapshot === undefined) {
        diagnostics.push({
          code: DiagnosticCodes.resolver.UNKNOWN_POINTER,
          message: `No token exists at pointer "${currentPointer}".`,
          severity: 'error',
          pointer: currentPointer,
        });

        break;
      }

      trace.push({
        pointer: toJsonPointer(snapshot.id),
        kind: snapshot.ref ? 'alias' : 'token',
      });

      if (snapshot.ref === undefined) {
        lastSnapshot = snapshot;
        break;
      }

      currentPointer = toJsonPointer(snapshot.ref);
    }

    const finalDiagnostics: readonly InlineResolverDiagnostic[] =
      diagnostics.length === 0 ? [] : Object.freeze([...diagnostics]);

    if (lastSnapshot === undefined) {
      return {
        diagnostics: finalDiagnostics,
        transforms: [],
      } satisfies TokenResolution;
    }

    const token: TokenResolutionToken = {
      pointer: normalizedPointer,
      uri: this.uri,
      ...(lastSnapshot.type === undefined ? {} : { type: lastSnapshot.type }),
      ...(lastSnapshot.value === undefined ? {} : { value: cloneTokenValue(lastSnapshot.value) }),
      source: {
        uri: this.uri,
        pointer: toJsonPointer(lastSnapshot.id),
      },
      overridesApplied: [],
      warnings: [],
      trace: Object.freeze([...trace]),
      toJSON() {
        return {
          pointer: this.pointer,
          uri: this.uri.href,
          ...(this.type === undefined ? {} : { type: this.type }),
          ...(this.value === undefined ? {} : { value: this.value }),
        };
      },
    } satisfies TokenResolutionToken;

    return {
      token,
      diagnostics: finalDiagnostics,
      transforms: [],
    } satisfies TokenResolution;
  }
}

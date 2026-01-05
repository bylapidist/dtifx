import { createHash as createNodeHash } from 'node:crypto';

import type { JsonPointer, JsonValue, ResolvedTokenView } from '@lapidist/dtif-parser';
import type { TokenMetadataSnapshot } from '@dtifx/core';

import type { TokenSnapshot } from '../session/resolution-session.js';
import { matchesTokenSelector, type TokenSelector } from '@dtifx/core/policy/selectors';
import type { TokenTypeIdentifier, TokenTypeValue } from '../types/token-value-types.js';
import type { TransformCache, TransformCacheKey, TransformCacheStatus } from './transform-cache.js';
import { compareTransformGroups, normaliseTransformGroupName } from './transform-groups.js';

/**
 * Sentinel hash value that indicates a transform does not rely on dynamic options.
 */
export const STATIC_TRANSFORM_OPTIONS_HASH = 'static';

const NULL_JSON_VALUE = JSON.parse('null') as JsonValue;

/**
 * Produces a deterministic hash for a transform options object so it can be cached.
 * @param {unknown} value - The transform options being normalised.
 * @returns {string} The hash representing the provided options.
 */
export function createTransformOptionsHash(value: unknown): string {
  if ((value ?? undefined) === undefined) {
    return STATIC_TRANSFORM_OPTIONS_HASH;
  }
  const normalised = normaliseValue(value);
  const json = JSON.stringify(normalised);
  return createHash(json);
}

/**
 * Recursively sorts objects and removes undefined values to ensure stable hashing.
 * @param {unknown} value - The value to normalise.
 * @returns {unknown} The normalised value.
 */
function normaliseValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normaliseValue(entry));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normaliseValue(entryValue)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * Hashes a JSON string into a deterministic identifier.
 * @param {string} value - The JSON string to hash.
 * @returns {string} The resulting SHA-1 hash.
 */
function createHash(value: string): string {
  return createNodeHash('sha1').update(value).digest('hex');
}

export type { PointerPattern } from '@dtifx/core/policy/selectors';
/**
 * Transform selector convenience type that mirrors {@link TokenSelector}.
 */
export interface TransformSelector<
  TType extends TokenTypeIdentifier | undefined = TokenTypeIdentifier | undefined,
> extends TokenSelector<
  TokenSnapshot,
  TType extends TokenTypeIdentifier ? TType : TokenTypeIdentifier
> {}

/**
 * Resolves the union of token types represented by a transform selector.
 */
type SelectorTypeUnion<TSelector extends TransformSelector> =
  TSelector extends TransformSelector<infer TType>
    ? TType extends TokenTypeIdentifier
      ? TType
      : never
    : never;

/**
 * Narrows the expected transform input for a selector with known token types.
 */
export type TransformInputForSelector<TSelector extends TransformSelector> = [
  SelectorTypeUnion<TSelector>,
] extends [never]
  ? TransformInput
  : {
      [K in SelectorTypeUnion<TSelector>]: TransformInput<TokenTypeValue<K>, K>;
    }[SelectorTypeUnion<TSelector>];

/**
 * The arguments supplied to a transform when it is executed.
 */
export interface TransformInput<
  TValue = TokenTypeValue<undefined>,
  TType extends string | undefined = string | undefined,
> {
  readonly snapshot: TokenSnapshot;
  readonly pointer: JsonPointer;
  readonly type?: TType extends string ? TType | undefined : string | undefined;
  readonly value: TValue;
  readonly raw?: unknown;
  readonly metadata?: TokenMetadataSnapshot;
}

/**
 * Signature used by transforms that accept untyped input structures.
 */
export type TransformHandler<TResult = unknown> = (
  input: TransformInput,
) => TResult | Promise<TResult>;

/**
 * Signature used by strongly typed transforms that refine the selector to specific token types.
 */
export type TypedTransformHandler<TResult, TSelector extends TransformSelector> = (
  input: TransformInputForSelector<TSelector>,
) => TResult | Promise<TResult>;

/**
 * Description of a transform registered with the engine.
 */
export interface TransformDefinition<TResult = unknown> {
  readonly name: string;
  readonly selector: TransformSelector;
  readonly group?: string;
  readonly optionsHash?: string;
  readonly run: TransformHandler<TResult>;
}

/**
 * Strongly typed transform definition that narrows the selector to specific token kinds.
 */
export interface TypedTransformDefinition<TResult, TSelector extends TransformSelector> {
  readonly name: string;
  readonly selector: TSelector;
  readonly group?: string;
  readonly optionsHash?: string;
  readonly run: TypedTransformHandler<TResult, TSelector>;
}

/**
 * Creates an untyped transform definition from a strongly typed version so the registry can
 * operate over a consistent shape.
 * @template TResult
 * @template {TransformSelector} TSelector
 * @param {TypedTransformDefinition<TResult, TSelector>} definition - The strongly typed transform
 * definition provided by callers.
 * @returns {TransformDefinition<TResult>} A transform definition with a normalised handler
 * signature.
 */
export function defineTransform<TResult, TSelector extends TransformSelector>(
  definition: TypedTransformDefinition<TResult, TSelector>,
): TransformDefinition<TResult> {
  const handler: TransformHandler<TResult> = (input) =>
    definition.run(input as TransformInputForSelector<TSelector>);
  return {
    ...definition,
    run: handler,
  } satisfies TransformDefinition<TResult>;
}

/**
 * Result emitted when a transform completes execution.
 */
export interface TransformResult<TResult = unknown> {
  readonly transform: string;
  readonly pointer: JsonPointer;
  readonly output: TResult;
  readonly snapshot: TokenSnapshot;
  readonly group: string;
  readonly optionsHash: string;
  readonly cacheStatus: TransformCacheStatus;
}

interface InternalTransformDefinition<TResult = unknown> extends TransformDefinition<TResult> {
  readonly group: string;
  readonly optionsHash: string;
}

/**
 * Stores the available transforms and provides lookup utilities used by the transform engine.
 */
export class TransformRegistry {
  private readonly transforms = new Map<string, InternalTransformDefinition>();

  constructor(initial?: readonly TransformDefinition[]) {
    if (initial) {
      for (const definition of initial) {
        this.register(definition);
      }
    }
  }

  /**
   * Adds a new transform definition to the registry.
   * @template TResult
   * @param {TransformDefinition<TResult>} definition - The transform definition to register.
   * @throws {Error} If a transform with the same name already exists.
   */
  register<TResult>(definition: TransformDefinition<TResult>): void {
    if (this.transforms.has(definition.name)) {
      throw new Error(`Transform with name "${definition.name}" is already registered`);
    }
    const normalised: InternalTransformDefinition<TResult> = {
      ...definition,
      group: normaliseTransformGroupName(definition.group),
      optionsHash: definition.optionsHash ?? STATIC_TRANSFORM_OPTIONS_HASH,
    };
    this.transforms.set(definition.name, normalised as InternalTransformDefinition);
  }

  /**
   * Retrieves a transform definition by name.
   * @param {string} name - The unique name of the transform.
   * @returns {TransformDefinition | undefined} The transform definition or undefined if it has not
   * been registered.
   */
  get(name: string): TransformDefinition | undefined {
    return this.transforms.get(name);
  }

  /**
   * Lists the registered transforms in a deterministic order grouped by their transform group.
   * @returns {readonly TransformDefinition[]} The ordered transform definitions.
   */
  list(): readonly TransformDefinition[] {
    return [...this.transforms.values()].toSorted((left, right) => {
      const groupComparison = compareTransformGroups(left.group, right.group);
      if (groupComparison !== 0) {
        return groupComparison;
      }
      return left.name.localeCompare(right.name);
    });
  }
}

/**
 * Optional dependencies used to construct a {@link TransformEngine} instance.
 */
export interface TransformEngineOptions {
  readonly registry?: TransformRegistry;
  readonly cache?: TransformCache;
}

/**
 * Additional options controlling a transform engine run.
 */
export interface TransformRunOptions {
  readonly changedPointers?: ReadonlySet<string>;
  readonly group?: string;
}

/**
 * Executes transforms for a collection of resolved tokens while coordinating cache usage.
 */
export class TransformEngine {
  private readonly registry: TransformRegistry;
  private readonly cache: TransformCache | undefined;

  /**
   * Creates a transform engine instance.
   * @param {TransformEngineOptions | undefined} options - Optional registry and cache used to
   * customise execution.
   */
  constructor(options?: TransformEngineOptions) {
    this.registry = options?.registry ?? new TransformRegistry();
    this.cache = options?.cache;
  }

  /**
   * Exposes the underlying registry so additional transforms can be registered at runtime.
   * @returns {TransformRegistry} The registry backing this engine instance.
   */
  getRegistry(): TransformRegistry {
    return this.registry;
  }

  /**
   * Executes all registered transforms against the provided token snapshots.
   * @param {readonly TokenSnapshot[]} tokens - The resolved token snapshots to process.
   * @param {TransformRunOptions} [options] - Options controlling cache usage and transform
   * grouping.
   * @returns {Promise<TransformResult[]>} The results produced by the executed transforms.
   */
  async run(
    tokens: readonly TokenSnapshot[],
    options: TransformRunOptions = {},
  ): Promise<TransformResult[]> {
    const results: TransformResult[] = [];
    const definitions = this.registry.list();
    const changedPointers = options.changedPointers;
    const requestedGroup =
      options.group === undefined ? undefined : normaliseTransformGroupName(options.group);

    for (const snapshot of tokens) {
      const pointerKey = toPointerString(snapshot.pointer);
      const frozenSnapshot = freezeTokenSnapshot(snapshot);
      for (const definition of definitions) {
        const group = normaliseTransformGroupName(definition.group);
        if (requestedGroup !== undefined && group !== requestedGroup) {
          continue;
        }
        if (!this.matches(snapshot, definition.selector)) {
          continue;
        }
        const resolution = requireResolvedSnapshot(frozenSnapshot, definition.name);
        const tokenType = snapshot.token.type;
        const raw = snapshot.token.raw;
        const metadata = snapshot.metadata;
        const resolvedValue =
          resolution.value ?? frozenSnapshot.token.value ?? frozenSnapshot.token.raw;
        const value: JsonValue =
          resolvedValue === undefined ? NULL_JSON_VALUE : (resolvedValue as JsonValue);
        const input: TransformInput = {
          snapshot: frozenSnapshot,
          pointer: snapshot.pointer,
          value,
          ...(tokenType === undefined ? {} : { type: tokenType }),
          ...(raw === undefined ? {} : { raw }),
          ...(metadata === undefined ? {} : { metadata }),
        };
        const optionsHash = definition.optionsHash ?? STATIC_TRANSFORM_OPTIONS_HASH;
        const key = this.createCacheKey(snapshot.pointer, {
          transform: definition.name,
          group,
          optionsHash,
        });
        const cachedEntry =
          changedPointers === undefined || changedPointers.has(pointerKey)
            ? undefined
            : await this.cache?.get(key);
        if (cachedEntry !== undefined) {
          results.push({
            transform: definition.name,
            pointer: snapshot.pointer,
            output: cachedEntry.value,
            snapshot: frozenSnapshot,
            group,
            optionsHash,
            cacheStatus: 'hit',
          });
          continue;
        }
        const output = await definition.run(input);
        const stored = this.cache ? await this.cache.set({ key, value: output }) : false;
        results.push({
          transform: definition.name,
          pointer: snapshot.pointer,
          output,
          snapshot: frozenSnapshot,
          group,
          optionsHash,
          cacheStatus: this.cache ? (stored ? 'miss' : 'skip') : 'skip',
        });
      }
    }

    return results;
  }

  private createCacheKey(
    pointer: JsonPointer,
    metadata: Omit<TransformCacheKey, 'pointer'>,
  ): TransformCacheKey {
    return {
      pointer: toPointerString(pointer),
      transform: metadata.transform,
      group: metadata.group,
      optionsHash: metadata.optionsHash,
    } satisfies TransformCacheKey;
  }

  private matches(snapshot: TokenSnapshot, selector: TransformSelector): boolean {
    return matchesTokenSelector(snapshot, selector);
  }
}

/**
 * Ensures a token snapshot has been resolved before a transform runs.
 * @param {TokenSnapshot} snapshot - The snapshot whose resolution is required.
 * @param {string} transformName - The name of the transform requesting the snapshot.
 * @returns {ResolvedTokenView} The resolved token data.
 * @throws {Error} When the snapshot has not been resolved.
 */
function requireResolvedSnapshot(
  snapshot: TokenSnapshot,
  transformName: string,
): ResolvedTokenView {
  const resolution = snapshot.resolution;
  if (!resolution) {
    const pointer = toPointerString(snapshot.pointer);
    throw new Error(
      `Transform "${transformName}" cannot run on unresolved token at pointer "${pointer}". Ensure the resolution session was configured to include flattened tokens.`,
    );
  }
  return resolution;
}

/**
 * Produces a deeply frozen copy of the provided token snapshot.
 * @param {TokenSnapshot} snapshot - The snapshot to freeze.
 * @returns {TokenSnapshot} The frozen snapshot reference.
 */
function freezeTokenSnapshot(snapshot: TokenSnapshot): TokenSnapshot {
  if (Object.isFrozen(snapshot)) {
    return snapshot;
  }
  const frozenToken = deepFreeze(snapshot.token);
  const frozenContext = deepFreeze(snapshot.context);
  const frozenProvenance = deepFreeze(snapshot.provenance);
  const frozenMetadata = snapshot.metadata ? deepFreeze(snapshot.metadata) : undefined;
  const frozenResolution = snapshot.resolution ? deepFreeze(snapshot.resolution) : undefined;

  const frozenSnapshot = {
    ...snapshot,
    token: frozenToken,
    context: frozenContext,
    provenance: frozenProvenance,
    ...(frozenMetadata ? { metadata: frozenMetadata } : {}),
    ...(frozenResolution ? { resolution: frozenResolution } : {}),
  } as TokenSnapshot;

  return Object.freeze(frozenSnapshot);
}

/**
 * Recursively freezes the provided value.
 * @template T
 * @param {T} value - The value to freeze.
 * @returns {T} The frozen value reference.
 */
function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (const element of value) {
      deepFreeze(element);
    }
    return Object.freeze(value);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [, entryValue] of entries) {
    deepFreeze(entryValue);
  }
  return Object.freeze(value);
}

/**
 * Normalises a JSON pointer value to its string representation.
 * @param {JsonPointer} pointer - The pointer to convert.
 * @returns {string} The pointer expressed as a string.
 */
function toPointerString(pointer: JsonPointer): string {
  return typeof pointer === 'string' ? pointer : String(pointer);
}

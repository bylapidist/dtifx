import type { JsonPointer } from '@lapidist/dtif-parser';
import type { TokenMetadataSnapshot } from '@dtifx/core';

import type { BuildTokenSnapshot } from '../domain/models/tokens.js';
import type { TransformResult } from '../transform/transform-registry.js';
import type { TransformSelector } from '../transform/transform-registry.js';
import { matchesTokenSelector } from '@dtifx/core/policy/selectors';

/**
 * Supported encodings for formatter output artifacts.
 */
export type ArtifactEncoding = 'utf8' | 'buffer';

/**
 * File-based artifact emitted by a formatter run.
 */
export interface FileArtifact {
  readonly path: string;
  readonly contents: string | Uint8Array;
  readonly encoding: ArtifactEncoding;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly checksum?: string;
}

/**
 * Token data passed to formatter handlers with resolved transform output.
 */
export interface FormatterToken {
  readonly snapshot: BuildTokenSnapshot;
  readonly pointer: JsonPointer;
  readonly type?: string;
  readonly value: unknown;
  readonly raw?: unknown;
  readonly metadata?: TokenMetadataSnapshot;
  readonly transforms: ReadonlyMap<string, unknown>;
}

/**
 * Input payload forwarded to formatter handlers.
 */
export interface FormatterHandlerInput {
  readonly tokens: readonly FormatterToken[];
}

/**
 * Formatter callback invoked for every matching token group.
 */
export type FormatterHandler = (
  input: FormatterHandlerInput,
) => Promise<readonly FileArtifact[]> | readonly FileArtifact[];

/**
 * Selector used to constrain formatter execution to matching tokens.
 */
export interface FormatterSelector extends TransformSelector {
  readonly transforms?: readonly string[];
}

/**
 * Definition describing a formatter and its execution strategy.
 */
export interface FormatterDefinition {
  readonly name: string;
  readonly selector: FormatterSelector;
  readonly run: FormatterHandler;
}

/**
 * Execution context shared across all formatter runs for a build.
 */
export interface FormatterExecutionContext {
  readonly snapshots: readonly BuildTokenSnapshot[];
  readonly transforms: ReadonlyMap<JsonPointer, ReadonlyMap<string, unknown>>;
}

/**
 * Registry that stores formatter definitions and exposes lookup helpers.
 */
export class FormatterRegistry {
  private readonly definitions = new Map<string, FormatterDefinition>();

  constructor(definitions: readonly FormatterDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: FormatterDefinition): void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`Formatter with name "${definition.name}" is already registered.`);
    }
    this.definitions.set(definition.name, definition);
  }

  get(name: string): FormatterDefinition | undefined {
    return this.definitions.get(name);
  }

  list(): readonly FormatterDefinition[] {
    return [...this.definitions.values()].toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );
  }
}

/**
 * Options for creating a {@link FormatterEngine} instance.
 */
export interface FormatterEngineOptions {
  readonly registry?: FormatterRegistry;
}

/**
 * High-level engine that coordinates formatter execution across tokens.
 */
export class FormatterEngine {
  private readonly registry: FormatterRegistry;

  constructor(options: FormatterEngineOptions = {}) {
    this.registry = options.registry ?? new FormatterRegistry();
  }

  /**
   * Retrieve the registry currently backing the engine.
   * @returns {FormatterRegistry} The registry responsible for formatter definitions.
   */
  getRegistry(): FormatterRegistry {
    return this.registry;
  }

  /**
   * Execute the registered formatters using the supplied build results.
   * @param {readonly BuildTokenSnapshot[]} snapshots - Token snapshots produced by the resolution pipeline.
   * @param {readonly TransformResult[]} results - Outputs emitted by the transform pipeline.
   * @returns {Promise<readonly FileArtifact[]>} The artifacts produced by the registered formatters.
   */
  async run(
    snapshots: readonly BuildTokenSnapshot[],
    results: readonly TransformResult[],
  ): Promise<readonly FileArtifact[]> {
    const context = this.createContext(snapshots, results);
    return this.runWithContext(context);
  }

  /**
   * Build an execution context for the provided snapshots and transform results.
   * @param {readonly BuildTokenSnapshot[]} snapshots - Token snapshots produced by the resolution pipeline.
   * @param {readonly TransformResult[]} results - Outputs emitted by the transform pipeline.
   * @returns {FormatterExecutionContext} The execution context passed to formatter definitions.
   */
  createContext(
    snapshots: readonly BuildTokenSnapshot[],
    results: readonly TransformResult[],
  ): FormatterExecutionContext {
    return createFormatterExecutionContext(snapshots, results);
  }

  /**
   * Execute all registered formatters using a precomputed context.
   * @param {FormatterExecutionContext} context - The shared execution context for formatter runs.
   * @returns {Promise<readonly FileArtifact[]>} The artifacts produced by the registered formatters.
   */
  async runWithContext(context: FormatterExecutionContext): Promise<readonly FileArtifact[]> {
    const definitions = this.registry.list();
    if (definitions.length === 0) {
      return [];
    }
    const artifacts: FileArtifact[] = [];
    for (const definition of definitions) {
      const outputs = await runFormatterDefinition(definition, context);
      artifacts.push(...outputs);
    }
    return artifacts.toSorted((left, right) => left.path.localeCompare(right.path));
  }
}

/**
 * Create a formatter execution context for the supplied snapshots and transform results.
 * @param {readonly BuildTokenSnapshot[]} snapshots - Token snapshots produced by the resolution pipeline.
 * @param {readonly TransformResult[]} results - Outputs emitted by the transform pipeline.
 * @returns {FormatterExecutionContext} The execution context passed to formatter definitions.
 */
export function createFormatterExecutionContext(
  snapshots: readonly BuildTokenSnapshot[],
  results: readonly TransformResult[],
): FormatterExecutionContext {
  const sortedSnapshots = [...snapshots].toSorted((left, right) =>
    left.pointer.localeCompare(right.pointer),
  );
  const transforms = groupTransformResults(results);
  return {
    snapshots: sortedSnapshots,
    transforms,
  } satisfies FormatterExecutionContext;
}

/**
 * Execute a formatter definition and normalise the resulting artifacts.
 * @param {FormatterDefinition} definition - The formatter to execute.
 * @param {FormatterExecutionContext} context - The shared execution context for formatter runs.
 * @returns {Promise<readonly FileArtifact[]>} The artifacts emitted by the formatter definition.
 */
export async function runFormatterDefinition(
  definition: FormatterDefinition,
  context: FormatterExecutionContext,
): Promise<readonly FileArtifact[]> {
  const matchingTokens = filterTokens(context.snapshots, context.transforms, definition.selector);
  if (matchingTokens.length === 0) {
    return [];
  }
  const artifacts = await definition.run({ tokens: matchingTokens });
  return [...artifacts].toSorted((left, right) => left.path.localeCompare(right.path));
}

/**
 * Filter token snapshots down to the ones matching the supplied selector.
 * @param {readonly BuildTokenSnapshot[]} snapshots - Token snapshots produced by the resolution pipeline.
 * @param {ReadonlyMap<JsonPointer, ReadonlyMap<string, unknown>>} transforms - Transform outputs keyed by token pointer.
 * @param {FormatterSelector} selector - The matcher describing which tokens a formatter should receive.
 * @returns {FormatterToken[]} The formatter tokens assembled from snapshots and transforms.
 */
function filterTokens(
  snapshots: readonly BuildTokenSnapshot[],
  transforms: ReadonlyMap<JsonPointer, ReadonlyMap<string, unknown>>,
  selector: FormatterSelector,
): FormatterToken[] {
  const tokens: FormatterToken[] = [];
  for (const snapshot of snapshots) {
    const transformMap = transforms.get(snapshot.pointer) ?? new Map<string, unknown>();
    if (matchesFormatterSelector(snapshot, transformMap, selector)) {
      const tokenValue = snapshot.resolution?.value ?? snapshot.token.value ?? snapshot.token.raw;
      const optionalType = snapshot.token.type;
      const optionalRaw = snapshot.token.raw;
      const optionalMetadata = snapshot.metadata;
      const token: FormatterToken = {
        snapshot,
        pointer: snapshot.pointer,
        value: tokenValue,
        transforms: new Map(transformMap),
        ...(optionalType === undefined ? {} : { type: optionalType }),
        ...(optionalRaw === undefined ? {} : { raw: optionalRaw }),
        ...(optionalMetadata === undefined ? {} : { metadata: optionalMetadata }),
      } satisfies FormatterToken;
      tokens.push(token);
    }
  }
  return tokens;
}

/**
 * Determine whether a snapshot satisfies a formatter selector and required transforms.
 * @param {BuildTokenSnapshot} snapshot - The snapshot under evaluation.
 * @param {ReadonlyMap<string, unknown>} transforms - The transforms available for the snapshot.
 * @param {FormatterSelector} selector - The selector describing the formatter's target tokens.
 * @returns {boolean} True when the snapshot and transforms match the selector.
 */
function matchesFormatterSelector(
  snapshot: BuildTokenSnapshot,
  transforms: ReadonlyMap<string, unknown>,
  selector: FormatterSelector,
): boolean {
  const matches = matchesTokenSelector(snapshot, selector);
  if (matches) {
    const requiredTransforms = selector.transforms;
    if (requiredTransforms === undefined) {
      return true;
    }
    for (const transformName of requiredTransforms) {
      if (transforms.has(transformName)) {
        continue;
      }
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Group transform results by pointer and expose them as immutable maps.
 * @param {readonly TransformResult[]} results - The transform results produced by the pipeline.
 * @returns {ReadonlyMap<JsonPointer, ReadonlyMap<string, unknown>>} The grouped transform outputs keyed by token pointer.
 */
function groupTransformResults(
  results: readonly TransformResult[],
): ReadonlyMap<JsonPointer, ReadonlyMap<string, unknown>> {
  const grouped = new Map<JsonPointer, Map<string, unknown>>();
  for (const result of results) {
    const pointerTransforms = grouped.get(result.pointer);
    if (pointerTransforms) {
      pointerTransforms.set(result.transform, result.output);
      continue;
    }
    grouped.set(result.pointer, new Map<string, unknown>([[result.transform, result.output]]));
  }
  return new Map([...grouped.entries()].map(([pointer, map]) => [pointer, new Map(map)]));
}

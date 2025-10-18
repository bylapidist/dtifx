import type {
  DependencyDiffStrategyPort,
  DependencySnapshotBuilderPort,
} from '../domain/ports/dependencies.js';
import {
  GraphDependencyDiffStrategy,
  type GraphDependencyDiffStrategyOptions,
  SnapshotDependencyDiffStrategy,
  SnapshotDependencySnapshotBuilder,
} from '../domain/services/dependency-strategy-defaults.js';

/**
 * Options available when constructing a dependency strategy instance.
 */
export interface DependencyStrategyCreateContext {
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Represents the dependency diff strategy and snapshot builder pair produced
 * by a registry definition.
 */
export interface DependencyStrategyInstance {
  readonly builder?: DependencySnapshotBuilderPort;
  readonly diffStrategy?: DependencyDiffStrategyPort;
}

/**
 * Describes a dependency strategy that can be registered and resolved by the
 * {@link DependencyStrategyRegistry}.
 */
export interface DependencyStrategyDefinition {
  readonly name: string;
  create(context: DependencyStrategyCreateContext): DependencyStrategyInstance;
}

/**
 * Registry for dependency strategies, allowing custom diffing behaviours to be
 * plugged into the incremental build pipeline.
 */
export class DependencyStrategyRegistry {
  private readonly definitions = new Map<string, DependencyStrategyDefinition>();

  constructor(definitions: readonly DependencyStrategyDefinition[] = []) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: DependencyStrategyDefinition): void {
    this.definitions.set(definition.name, definition);
  }

  resolve(name: string): DependencyStrategyDefinition | undefined {
    return this.definitions.get(name);
  }

  list(): readonly DependencyStrategyDefinition[] {
    return [...this.definitions.values()];
  }
}

/**
 * Creates the built-in dependency strategy that compares snapshots generated
 * entirely from persisted token state.
 * @returns {DependencyStrategyDefinition} Snapshot dependency strategy definition.
 */
export function createSnapshotDependencyStrategyDefinition(): DependencyStrategyDefinition {
  return {
    name: 'snapshot',
    create(): DependencyStrategyInstance {
      return {
        builder: new SnapshotDependencySnapshotBuilder(),
        diffStrategy: new SnapshotDependencyDiffStrategy(),
      } satisfies DependencyStrategyInstance;
    },
  } satisfies DependencyStrategyDefinition;
}

/**
 * Creates the dependency strategy that traverses the dependency graph to
 * compute diffs with configurable depth and transitivity.
 * @returns {DependencyStrategyDefinition} Graph dependency strategy definition.
 */
export function createGraphDependencyStrategyDefinition(): DependencyStrategyDefinition {
  return {
    name: 'graph',
    create(context: DependencyStrategyCreateContext): DependencyStrategyInstance {
      const options = parseGraphDependencyStrategyOptions(context.options);
      return {
        builder: new SnapshotDependencySnapshotBuilder(),
        diffStrategy: new GraphDependencyDiffStrategy(options),
      } satisfies DependencyStrategyInstance;
    },
  } satisfies DependencyStrategyDefinition;
}

/**
 * Default registry that exposes the built-in snapshot and graph strategies.
 */
export class DefaultDependencyStrategyRegistry extends DependencyStrategyRegistry {
  constructor() {
    super([
      createSnapshotDependencyStrategyDefinition(),
      createGraphDependencyStrategyDefinition(),
    ]);
  }
}

/**
 * Normalises options supplied to the graph dependency strategy.
 * @param {DependencyStrategyCreateContext['options']} options - Arbitrary options provided by the caller.
 * @returns {GraphDependencyDiffStrategyOptions} Parsed graph dependency strategy options.
 */
function parseGraphDependencyStrategyOptions(
  options: DependencyStrategyCreateContext['options'],
): GraphDependencyDiffStrategyOptions {
  if (options === undefined) {
    return {} satisfies GraphDependencyDiffStrategyOptions;
  }
  if (isPlainObject(options)) {
    const record = options;
    const allowed = new Set(['maxDepth', 'transitive']);
    for (const key of Object.keys(record)) {
      if (allowed.has(key)) {
        continue;
      }
      throw new TypeError(
        `Unknown graph dependency strategy option "${key}". Supported options: maxDepth, transitive.`,
      );
    }
    let maxDepth: number | undefined;
    let transitive: boolean | undefined;
    if (Object.prototype.hasOwnProperty.call(record, 'maxDepth')) {
      const value = record['maxDepth'];
      const invalidMaxDepthMessage =
        'Graph dependency strategy option "maxDepth" must be a positive finite number.';
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        maxDepth = value;
      } else {
        throw new TypeError(invalidMaxDepthMessage);
      }
    }
    if (Object.prototype.hasOwnProperty.call(record, 'transitive')) {
      const value = record['transitive'];
      if (typeof value === 'boolean') {
        transitive = value;
      } else {
        throw new TypeError('Graph dependency strategy option "transitive" must be a boolean.');
      }
    }
    if (maxDepth === undefined && transitive === undefined) {
      return {} satisfies GraphDependencyDiffStrategyOptions;
    }
    return {
      ...(maxDepth === undefined ? {} : { maxDepth }),
      ...(transitive === undefined ? {} : { transitive }),
    } satisfies GraphDependencyDiffStrategyOptions;
  }
  throw new TypeError('Graph dependency strategy options must be a plain object when provided.');
}

/**
 * Determines whether the provided value is a plain object.
 * @param {unknown} value - Value to evaluate.
 * @returns {value is Readonly<Record<string, unknown>>} True when the value is a non-null object without array semantics.
 */
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

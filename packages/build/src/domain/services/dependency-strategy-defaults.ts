import { DepGraph } from 'dependency-graph';

import type {
  TokenDependencyDiff,
  TokenDependencySnapshot,
} from '../../incremental/token-dependency-cache.js';
import { createTokenDependencySnapshot } from '../../incremental/token-dependency-cache.js';
import type { BuildResolvedPlan } from '../models/tokens.js';
import type {
  DependencyDiffStrategyPort,
  DependencySnapshotBuilderPort,
  DependencyStorePort,
} from '../ports/dependencies.js';

/**
 * Creates a diff that marks every entry in the snapshot as changed. This is
 * used as a conservative fallback when an incremental dependency store cannot
 * provide a more granular comparison.
 * @param {TokenDependencySnapshot} snapshot The snapshot describing the resolved dependency state.
 * @returns {TokenDependencyDiff} A diff that lists all snapshot entries as changed.
 */
function createAllChangedDiff(snapshot: TokenDependencySnapshot): TokenDependencyDiff {
  const changed = new Set<string>();
  for (const entry of snapshot.entries) {
    changed.add(entry.pointer);
  }
  return {
    snapshot,
    changed,
    removed: new Set<string>(),
  } satisfies TokenDependencyDiff;
}

/**
 * Builds dependency snapshots by delegating to the shared token dependency
 * cache helper. Consumers receive an immutable view of the resolved plan.
 */
export class SnapshotDependencySnapshotBuilder implements DependencySnapshotBuilderPort {
  create(resolved: BuildResolvedPlan): TokenDependencySnapshot {
    return createTokenDependencySnapshot(resolved);
  }
}

/**
 * Provides a diff strategy that either defers to a dependency store or falls
 * back to marking the entire snapshot as changed when no store is available.
 */
export class SnapshotDependencyDiffStrategy implements DependencyDiffStrategyPort {
  async diff(
    _resolved: BuildResolvedPlan,
    snapshot: TokenDependencySnapshot,
    context: { store?: DependencyStorePort },
  ): Promise<TokenDependencyDiff> {
    const store = context.store;
    if (store) {
      return store.evaluate(snapshot);
    }
    return createAllChangedDiff(snapshot);
  }
}

/**
 * Options controlling how the graph diff strategy expands dependency changes
 * through the dependency graph.
 */
export interface GraphDependencyDiffStrategyOptions {
  readonly transitive?: boolean;
  readonly maxDepth?: number;
}

/**
 * Computes dependency diffs by traversing the dependency graph to include
 * transitive dependents. The behaviour can be tuned via the provided options,
 * allowing shallow evaluation when desired.
 */
export class GraphDependencyDiffStrategy implements DependencyDiffStrategyPort {
  private readonly transitive: boolean;
  private readonly maxDepth: number;
  private readonly fallback = new SnapshotDependencyDiffStrategy();

  constructor(options: GraphDependencyDiffStrategyOptions = {}) {
    this.transitive = options.transitive ?? true;
    const resolvedDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
    this.maxDepth = this.transitive ? resolvedDepth : Math.min(resolvedDepth, 1);
  }

  async diff(
    resolved: BuildResolvedPlan,
    snapshot: TokenDependencySnapshot,
    context: { store?: DependencyStorePort },
  ): Promise<TokenDependencyDiff> {
    const base = context.store
      ? await context.store.evaluate(snapshot)
      : await this.fallback.diff(resolved, snapshot, context);

    if (!this.transitive && this.maxDepth <= 0) {
      return base;
    }

    const changed = new Set(base.changed);
    const removed = new Set(base.removed);
    for (const pointer of removed) {
      changed.add(pointer);
    }

    if (!Number.isFinite(this.maxDepth) && this.transitive) {
      this.expandDependents(snapshot, changed, Number.POSITIVE_INFINITY);
    } else if (this.maxDepth > 0) {
      this.expandDependents(snapshot, changed, this.maxDepth);
    }

    return {
      snapshot: base.snapshot,
      changed,
      removed,
    } satisfies TokenDependencyDiff;
  }

  /**
   * Expands the set of changed pointers by including their dependents up to
   * the provided depth. The traversal honours the `transitive` flag to support
   * shallow graph evaluation.
   * @param {TokenDependencySnapshot} snapshot The dependency snapshot used to compute dependent entries.
   * @param {Set<string>} changed The set that collects pointers considered changed.
   * @param {number} maxDepth The maximum depth to traverse when expanding dependents.
   */
  private expandDependents(
    snapshot: TokenDependencySnapshot,
    changed: Set<string>,
    maxDepth: number,
  ): void {
    const graph = this.createDependencyGraph(snapshot);

    if (!Number.isFinite(maxDepth)) {
      const pointers = [...changed].filter((pointer) => graph.hasNode(pointer));
      for (const pointer of pointers) {
        for (const dependant of graph.dependantsOf(pointer)) {
          changed.add(dependant);
        }
      }
      return;
    }

    const queue: { pointer: string; depth: number }[] = [];
    for (const pointer of changed) {
      if (!graph.hasNode(pointer)) {
        continue;
      }
      queue.push({ pointer, depth: 0 });
    }

    for (let index = 0; index < queue.length; index += 1) {
      const { pointer, depth } = queue[index]!;
      if (depth >= maxDepth) {
        continue;
      }
      const nextDepth = depth + 1;
      for (const dependant of graph.directDependantsOf(pointer)) {
        if (changed.has(dependant)) {
          continue;
        }
        changed.add(dependant);
        if (nextDepth < maxDepth && graph.hasNode(dependant)) {
          queue.push({ pointer: dependant, depth: nextDepth });
        }
      }
    }
  }

  private createDependencyGraph(snapshot: TokenDependencySnapshot): DepGraph<undefined> {
    const graph = new DepGraph<undefined>({ circular: true });

    for (const entry of snapshot.entries) {
      if (!graph.hasNode(entry.pointer)) {
        graph.addNode(entry.pointer);
      }
    }

    for (const entry of snapshot.entries) {
      for (const dependency of entry.dependencies) {
        if (!graph.hasNode(dependency)) {
          graph.addNode(dependency);
        }
        graph.addDependency(entry.pointer, dependency);
      }
    }

    return graph;
  }
}

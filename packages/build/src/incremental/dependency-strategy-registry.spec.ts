import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGraphDependencyStrategyDefinition,
  createSnapshotDependencyStrategyDefinition,
  DefaultDependencyStrategyRegistry,
  DependencyStrategyRegistry,
} from './dependency-strategy-registry.js';

const graphCtor = vi.fn();
const snapshotDiffCtor = vi.fn();
const snapshotBuilderCtor = vi.fn();

vi.mock('../domain/services/dependency-strategy-defaults.js', () => {
  class SnapshotDependencySnapshotBuilder {
    constructor() {
      snapshotBuilderCtor();
    }
  }

  class SnapshotDependencyDiffStrategy {
    constructor() {
      snapshotDiffCtor();
    }
  }

  class GraphDependencyDiffStrategy {
    public readonly options?: Readonly<Record<string, unknown>>;

    constructor(options?: Readonly<Record<string, unknown>>) {
      this.options = options;
      graphCtor(options);
    }
  }

  return {
    SnapshotDependencySnapshotBuilder,
    SnapshotDependencyDiffStrategy,
    GraphDependencyDiffStrategy,
  };
});

const defaultsModule = await import('../domain/services/dependency-strategy-defaults.js');

describe('DependencyStrategyRegistry', () => {
  beforeEach(() => {
    graphCtor.mockClear();
    snapshotDiffCtor.mockClear();
    snapshotBuilderCtor.mockClear();
  });

  it('registers and resolves dependency strategy definitions', () => {
    const definition = {
      name: 'custom',
      create: vi.fn(() => ({
        builder: {} as never,
        diffStrategy: {} as never,
      })),
    };

    const registry = new DependencyStrategyRegistry([definition]);

    expect(registry.resolve('custom')).toBe(definition);
    expect(registry.list()).toStrictEqual([definition]);

    const other = {
      name: 'other',
      create: vi.fn(() => ({
        builder: {} as never,
        diffStrategy: {} as never,
      })),
    };

    registry.register(other);

    expect(registry.list()).toStrictEqual([definition, other]);
  });

  it('creates snapshot dependency strategy instances', () => {
    const definition = createSnapshotDependencyStrategyDefinition();
    const instance = definition.create({ options: undefined });

    expect(instance.builder).toBeInstanceOf(defaultsModule.SnapshotDependencySnapshotBuilder);
    expect(instance.diffStrategy).toBeInstanceOf(defaultsModule.SnapshotDependencyDiffStrategy);
    expect(snapshotBuilderCtor).toHaveBeenCalledTimes(1);
    expect(snapshotDiffCtor).toHaveBeenCalledTimes(1);
  });

  it('creates graph dependency strategy instances with default options', () => {
    const definition = createGraphDependencyStrategyDefinition();
    const instance = definition.create({ options: undefined });

    expect(instance.builder).toBeInstanceOf(defaultsModule.SnapshotDependencySnapshotBuilder);
    expect(instance.diffStrategy).toBeInstanceOf(defaultsModule.GraphDependencyDiffStrategy);
    expect(graphCtor).toHaveBeenCalledWith({});
  });

  it('passes recognised graph options through to the strategy', () => {
    const definition = createGraphDependencyStrategyDefinition();
    const options = Object.freeze({ maxDepth: 3, transitive: false });

    definition.create({ options });

    expect(graphCtor).toHaveBeenCalledWith({ maxDepth: 3, transitive: false });
  });

  it('ignores optional graph options when they are omitted', () => {
    const definition = createGraphDependencyStrategyDefinition();

    definition.create({ options: {} });

    expect(graphCtor).toHaveBeenLastCalledWith({});
  });

  it('throws when graph options include unsupported keys', () => {
    const definition = createGraphDependencyStrategyDefinition();

    expect(() => definition.create({ options: { invalid: true } })).toThrow(
      'Unknown graph dependency strategy option "invalid". Supported options: maxDepth, transitive.',
    );
  });

  it('throws when graph maxDepth is not a positive finite number', () => {
    const definition = createGraphDependencyStrategyDefinition();

    expect(() => definition.create({ options: { maxDepth: 0 } })).toThrow(
      'Graph dependency strategy option "maxDepth" must be a positive finite number.',
    );
  });

  it('throws when graph transitive option is not a boolean', () => {
    const definition = createGraphDependencyStrategyDefinition();

    expect(() => definition.create({ options: { transitive: 'yes' as never } })).toThrow(
      'Graph dependency strategy option "transitive" must be a boolean.',
    );
  });

  it('throws when graph options are not a plain object', () => {
    const definition = createGraphDependencyStrategyDefinition();

    expect(() => definition.create({ options: [] as never })).toThrow(
      'Graph dependency strategy options must be a plain object when provided.',
    );
  });

  it('exposes snapshot and graph strategies via the default registry', () => {
    const registry = new DefaultDependencyStrategyRegistry();
    const names = registry.list().map((definition) => definition.name);

    expect(names).toEqual(['snapshot', 'graph']);
  });
});

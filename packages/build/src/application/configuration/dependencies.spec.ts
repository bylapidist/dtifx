import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type {
  DependencyDiffStrategyPort,
  DependencySnapshotBuilderPort,
} from '../../domain/ports/dependencies.js';
import type { BuildConfig } from '../../config/index.js';
import type {
  TokenDependencyDiff,
  TokenDependencySnapshot,
} from '../../incremental/token-dependency-cache.js';
import { createDependencyConfiguration, loadDependencyStrategyRegistry } from './dependencies.js';
import { DependencyStrategyRegistry } from '../../incremental/dependency-strategy-registry.js';

const baseOptions = {
  config: {} as BuildConfig,
  configDirectory: '/workspace/config',
  configPath: '/workspace/config/dtifx.config.mjs',
} as const;
const createBuilder = (): DependencySnapshotBuilderPort => ({
  create: vi.fn(async () => ({}) as TokenDependencySnapshot),
});
const createDiffStrategy = (): DependencyDiffStrategyPort => ({
  diff: vi.fn(async () => ({}) as TokenDependencyDiff),
});
describe('createDependencyConfiguration', () => {
  const emptyConfig = {} as BuildConfig;

  it('returns provided overrides when both builder and diff strategy are supplied', () => {
    const builder = createBuilder();
    const diffStrategy = createDiffStrategy();
    const registry = new DependencyStrategyRegistry();

    const result = createDependencyConfiguration(emptyConfig, {
      builder,
      diffStrategy,
      registry,
    });

    expect(result.builder).toBe(builder);
    expect(result.diffStrategy).toBe(diffStrategy);
  });

  it('merges overrides with registry definitions when only part of the strategy is provided', () => {
    const overrideBuilder = createBuilder();
    const registryBuilder = createBuilder();
    const registryDiff = createDiffStrategy();
    const registry = new DependencyStrategyRegistry([
      {
        name: 'custom',
        create: vi.fn(() => ({
          builder: registryBuilder,
          diffStrategy: registryDiff,
        })),
      },
    ]);

    const result = createDependencyConfiguration(
      {
        ...emptyConfig,
        dependencies: {
          strategy: { name: 'custom' },
        },
      },
      {
        builder: overrideBuilder,
        registry,
      },
    );

    expect(result.builder).toBe(overrideBuilder);
    expect(result.diffStrategy).toBe(registryDiff);
  });

  it('passes strategy options to registry definitions when resolving the strategy', () => {
    const builder = createBuilder();
    const diffStrategy = createDiffStrategy();
    const strategyOptions = Object.freeze({ enabled: true });
    const definition = {
      name: 'graph',
      create: vi.fn(() => ({
        builder,
        diffStrategy,
      })),
    };
    const registry = new DependencyStrategyRegistry([definition]);

    const result = createDependencyConfiguration(
      {
        ...emptyConfig,
        dependencies: {
          strategy: {
            name: 'graph',
            options: strategyOptions,
          },
        },
      },
      { registry },
    );

    expect(result.builder).toBe(builder);
    expect(result.diffStrategy).toBe(diffStrategy);
    expect(definition.create).toHaveBeenCalledWith({ options: strategyOptions });
  });

  it('throws when the requested strategy cannot be resolved', () => {
    const registry = new DependencyStrategyRegistry();

    expect(() =>
      createDependencyConfiguration(
        {
          ...emptyConfig,
          dependencies: {
            strategy: { name: 'missing' },
          },
        },
        { registry },
      ),
    ).toThrow('Unknown dependency strategy: missing. Available strategies: ');
  });

  it('throws when the resolved strategy omits a builder or diff strategy', () => {
    const registry = new DependencyStrategyRegistry([
      {
        name: 'invalid',
        create: () => ({}),
      },
    ]);

    expect(() =>
      createDependencyConfiguration(
        {
          ...emptyConfig,
          dependencies: {
            strategy: { name: 'invalid' },
          },
        },
        { registry },
      ),
    ).toThrow(
      'Dependency strategy "invalid" did not provide both a snapshot builder and diff strategy.',
    );
  });
});

describe('loadDependencyStrategyRegistry', () => {
  it('allows bare package names for dependency strategy plugins', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));

    await loadDependencyStrategyRegistry({
      ...baseOptions,
      plugins: ['example-dependency-plugin'],
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith('example-dependency-plugin');
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('resolves relative dependency strategy plugin paths against the configuration directory', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));

    await loadDependencyStrategyRegistry({
      ...baseOptions,
      plugins: ['./plugins/dependencies.js'],
      importModule: importer,
    });

    const expectedSpecifier = pathToFileURL(
      path.resolve(baseOptions.configDirectory, './plugins/dependencies.js'),
    ).href;

    expect(importer).toHaveBeenCalledWith(expectedSpecifier);
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('rejects dependency strategy plugin specifiers that use unsupported protocols', async () => {
    const importer = vi.fn();

    await expect(
      loadDependencyStrategyRegistry({
        ...baseOptions,
        plugins: ['data:text/javascript,export default {}'],
        importModule: importer,
      }),
    ).rejects.toThrow(
      'Dependency strategy plugin module specifiers must be bare package names or filesystem paths. ' +
        'Received "data:text/javascript,export default {}".',
    );

    expect(importer).not.toHaveBeenCalled();
  });

  it('supports explicit export names and passes frozen options to plugins', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ customRegister: plugin }));
    const options = { enabled: true } as const;

    await loadDependencyStrategyRegistry({
      ...baseOptions,
      plugins: [
        {
          module: 'custom-plugin',
          register: 'customRegister',
          options,
        },
      ],
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledWith('custom-plugin');
    const invocation = plugin.mock.calls[0]?.[0];
    expect(invocation?.options).toEqual(options);
    expect(Object.isFrozen(invocation?.options)).toBe(true);
  });

  it('loads plugins from default exports that expose registerDependencyStrategies', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({
      default: {
        registerDependencyStrategies: plugin,
      },
    }));

    await loadDependencyStrategyRegistry({
      ...baseOptions,
      plugins: ['default-wrapper'],
      importModule: importer,
    });

    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('rejects dependency strategy plugin objects without a module field', async () => {
    const importer = vi.fn();

    await expect(
      loadDependencyStrategyRegistry({
        ...baseOptions,
        plugins: [
          {
            module: '   ',
          } as never,
        ],
        importModule: importer,
      }),
    ).rejects.toThrow(
      'Dependency strategy plugin objects must include a non-empty "module" string.',
    );
  });

  it('rejects dependency strategy plugin entries with non-string register values', async () => {
    const importer = vi.fn();

    await expect(
      loadDependencyStrategyRegistry({
        ...baseOptions,
        plugins: [
          {
            module: 'custom-plugin',
            register: 123 as never,
          },
        ],
        importModule: importer,
      }),
    ).rejects.toThrow(
      'Dependency strategy plugin "register" field must be a string when provided.',
    );
  });

  it('rejects dependency strategy plugin entries with non-object options', async () => {
    const importer = vi.fn();

    await expect(
      loadDependencyStrategyRegistry({
        ...baseOptions,
        plugins: [
          {
            module: 'custom-plugin',
            options: 123 as never,
          },
        ],
        importModule: importer,
      }),
    ).rejects.toThrow(
      'Dependency strategy plugin "options" field must be an object when provided.',
    );
  });
});

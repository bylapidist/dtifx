import { describe, expect, it, vi } from 'vitest';

import type { BuildConfig, FormatterInstanceConfig } from '../../config/index.js';
import {
  createDefaultFormatterDefinitionRegistry,
  type FormatterDefinitionFactory,
} from '../../formatter/formatter-factory.js';
import type { FormatterDefinition } from '../../formatter/formatter-registry.js';
import {
  createFormatterConfiguration,
  getFormatterConfigEntries,
  loadFormatterDefinitionRegistry,
} from './formatters.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const baseDefinition: FormatterDefinition = {
  name: 'example.formatter',
  selector: {} as FormatterDefinition['selector'],
  run: vi.fn(),
};

const baseOptions = {
  config: {} as BuildConfig,
  configDirectory: path.resolve('/', 'workspace', 'project'),
  configPath: path.resolve('/', 'workspace', 'project', 'dtifx.config.json'),
} as const;

describe('createFormatterConfiguration', () => {
  it('returns empty plans when no formatters are configured', () => {
    const config = {} as BuildConfig;

    const result = createFormatterConfiguration(config);

    expect(result.plans).toStrictEqual([]);
  });

  it('allows overriding the planner and executor', () => {
    const config = {} as BuildConfig;
    const planner = { plan: vi.fn(() => []) };
    const executor = { execute: vi.fn() };

    const result = createFormatterConfiguration(config, { planner, executor });

    expect(result.plans).toStrictEqual([]);
    expect(result.planner).toBe(planner);
    expect(result.executor).toBe(executor);
  });

  it('creates a planner using supplied formatter definitions', () => {
    const config = {
      formatters: [{ name: 'example.formatter', output: {} }],
    } satisfies BuildConfig;

    const result = createFormatterConfiguration(config, { definitions: [baseDefinition] });

    expect(result.plans).toStrictEqual([
      {
        id: 'example.formatter#0',
        name: 'example.formatter',
        definition: baseDefinition,
        output: {},
      },
    ]);
  });

  it('creates formatter plans via registered factories', () => {
    const config = {
      formatters: [{ name: 'factory.formatter', output: {} }],
    } satisfies BuildConfig;
    const definition = { ...baseDefinition, name: 'factory.formatter' } as FormatterDefinition;
    const factory: FormatterDefinitionFactory = {
      name: 'factory.formatter',
      create: vi.fn(() => definition),
    };
    const registry = createDefaultFormatterDefinitionRegistry();
    registry.register(factory);
    const [entry] = getFormatterConfigEntries(config) ?? [];
    if (!entry) {
      throw new Error('expected formatter entry');
    }

    const result = createFormatterConfiguration(config, {
      definitionRegistry: registry,
    });

    expect(result.plans).toStrictEqual([
      {
        id: 'factory.formatter#0',
        name: 'factory.formatter',
        definition,
        output: {},
      },
    ]);
    expect(factory.create).toHaveBeenCalledWith(entry, expect.objectContaining({ config }));
  });

  it('allows overriding formatter entries used to build plans', () => {
    const config = {
      formatters: [{ name: 'unused.formatter', output: {} }],
    } satisfies BuildConfig;
    const entries: readonly FormatterInstanceConfig[] = [
      {
        name: 'example.formatter',
        output: {},
      },
    ];

    const result = createFormatterConfiguration(config, {
      definitions: [baseDefinition],
      entries,
    });

    expect(result.plans).toStrictEqual([
      {
        id: 'example.formatter#0',
        name: 'example.formatter',
        definition: baseDefinition,
        output: {},
      },
    ]);
  });

  it('allows precomputed plans to be supplied via overrides', () => {
    const config = {
      formatters: [{ name: 'ignored', output: {} }],
    } satisfies BuildConfig;
    const plans = [
      {
        id: 'custom#0',
        name: 'custom',
        definition: baseDefinition,
        output: {},
      },
    ];

    const result = createFormatterConfiguration(config, {
      definitions: [baseDefinition],
      plans,
    });

    expect(result.plans).toBe(plans);
  });
});

describe('loadFormatterDefinitionRegistry', () => {
  it('allows bare package names for formatter plugins', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));

    await loadFormatterDefinitionRegistry({
      ...baseOptions,
      plugins: ['example-formatter-plugin'],
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith('example-formatter-plugin');
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('resolves relative formatter plugin paths against the configuration directory', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));

    await loadFormatterDefinitionRegistry({
      ...baseOptions,
      plugins: ['./plugins/formatter.js'],
      importModule: importer,
    });

    const expectedSpecifier = pathToFileURL(
      path.resolve(baseOptions.configDirectory, './plugins/formatter.js'),
    ).href;

    expect(importer).toHaveBeenCalledWith(expectedSpecifier);
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('rejects formatter plugin specifiers that use unsupported protocols', async () => {
    const importer = vi.fn();

    await expect(
      loadFormatterDefinitionRegistry({
        ...baseOptions,
        plugins: ['data:application/javascript;base64,AA=='],
        importModule: importer,
      }),
    ).rejects.toThrow(
      'Formatter plugin module specifiers must be bare package names or filesystem paths. ' +
        'Received "data:application/javascript;base64,AA==".',
    );

    expect(importer).not.toHaveBeenCalled();
  });

  it('passes through file URL formatter plugin specifiers unchanged', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));
    const specifier = 'file:///workspace/plugins/formatter.js';

    await loadFormatterDefinitionRegistry({
      ...baseOptions,
      plugins: [specifier],
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledWith(specifier);
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('resolves absolute formatter plugin paths to file URLs', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));
    const absolutePath = path.resolve(baseOptions.configDirectory, '../plugins/formatter.js');

    await loadFormatterDefinitionRegistry({
      ...baseOptions,
      plugins: [absolutePath],
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledWith(pathToFileURL(absolutePath).href);
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('returns the supplied registry unchanged when no plugins are configured', async () => {
    const registry = createDefaultFormatterDefinitionRegistry();
    const result = await loadFormatterDefinitionRegistry({
      ...baseOptions,
      registry,
    });

    expect(result).toBe(registry);
  });

  it('rejects formatter plugin specifiers that only contain whitespace', async () => {
    const importer = vi.fn();

    await expect(
      loadFormatterDefinitionRegistry({
        ...baseOptions,
        plugins: ['   '],
        importModule: importer,
      }),
    ).rejects.toThrow('Formatter plugin specifiers must be non-empty strings.');

    expect(importer).not.toHaveBeenCalled();
  });

  it('rejects formatter plugin objects without a module field', async () => {
    const importer = vi.fn();

    await expect(
      loadFormatterDefinitionRegistry({
        ...baseOptions,
        plugins: [
          {
            module: '   ',
          } as never,
        ],
        importModule: importer,
      }),
    ).rejects.toThrow('Formatter plugin objects must include a non-empty "module" string.');
  });

  it('rejects formatter plugin objects with non-string register values', async () => {
    const importer = vi.fn();

    await expect(
      loadFormatterDefinitionRegistry({
        ...baseOptions,
        plugins: [
          {
            module: 'example-plugin',
            register: 42 as never,
          },
        ],
        importModule: importer,
      }),
    ).rejects.toThrow('Formatter plugin "register" field must be a string when provided.');
  });

  it('rejects formatter plugin objects with non-object options', async () => {
    const importer = vi.fn();

    await expect(
      loadFormatterDefinitionRegistry({
        ...baseOptions,
        plugins: [
          {
            module: 'example-plugin',
            options: 123 as never,
          },
        ],
        importModule: importer,
      }),
    ).rejects.toThrow('Formatter plugin "options" field must be an object when provided.');
  });

  it('supports named formatter plugin exports via the register field', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ register: plugin }));

    await loadFormatterDefinitionRegistry({
      ...baseOptions,
      plugins: [
        {
          module: 'example-plugin',
          register: 'register',
        },
      ],
      importModule: importer,
    });

    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('rejects named formatter plugin exports that are not functions', async () => {
    await expect(
      loadFormatterDefinitionRegistry({
        ...baseOptions,
        plugins: [
          {
            module: 'example-plugin',
            register: 'register',
          },
        ],
        importModule: async () => ({ register: 123 }),
      }),
    ).rejects.toThrow('Formatter plugin export "register" from example-plugin must be a function.');
  });

  it('prefers registerFormatters named exports when available', async () => {
    const plugin = vi.fn();

    await loadFormatterDefinitionRegistry({
      ...baseOptions,
      plugins: ['named-plugin'],
      importModule: async () => ({ registerFormatters: plugin }),
    });

    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('supports formatter plugins that expose registerFormatters from a default export object', async () => {
    const plugin = vi.fn();

    await loadFormatterDefinitionRegistry({
      ...baseOptions,
      plugins: ['default-wrapper'],
      importModule: async () => ({
        default: {
          registerFormatters: plugin,
        },
      }),
    });

    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('rejects formatter plugins that do not expose callable exports', async () => {
    await expect(
      loadFormatterDefinitionRegistry({
        ...baseOptions,
        plugins: ['invalid-plugin'],
        importModule: async () => ({ default: {} }),
      }),
    ).rejects.toThrow(
      'Formatter plugin module invalid-plugin must export a function named "registerFormatters" or a default function export.',
    );
  });

  it('passes frozen options through to formatter plugins', async () => {
    const plugin = vi.fn();
    const options = { enable: true } as const;

    await loadFormatterDefinitionRegistry({
      ...baseOptions,
      plugins: [
        {
          module: 'options-plugin',
          options,
        },
      ],
      importModule: async () => ({ default: plugin }),
    });

    const invocation = plugin.mock.calls.at(0)?.[0];
    expect(invocation?.options).toEqual(options);
    expect(Object.isFrozen(invocation?.options)).toBe(true);
  });
});

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
});

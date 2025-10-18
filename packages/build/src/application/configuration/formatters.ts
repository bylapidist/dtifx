import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  BuildConfig,
  FormatterConfig,
  FormatterInstanceConfig,
  FormatterPluginConfigEntry,
} from '../../config/index.js';
import type {
  FormatterExecutorPort,
  FormatterPlannerPort,
  FormatterPlan,
} from '../../domain/ports/formatters.js';
import {
  DefaultFormatterRegistry,
  type DefaultFormatterRegistryOptions,
} from '../../infrastructure/formatting/default-formatter-registry.js';
import { DefaultFormatterExecutor } from '../../infrastructure/formatting/default-formatter-executor.js';
import {
  createDefaultFormatterDefinitionRegistry,
  type FormatterDefinitionFactoryContext,
  type FormatterDefinitionFactoryRegistry,
} from '../../formatter/formatter-factory.js';
import type { FormatterDefinition } from '../../formatter/formatter-registry.js';

type FormatterConfigObject = Exclude<FormatterConfig, readonly FormatterInstanceConfig[]>;

/**
 * Optional overrides that allow tests or specialised runtimes to swap the default planner or executor
 * used when configuring formatters.
 */
export interface FormatterConfigurationOverrides {
  readonly planner?: FormatterPlannerPort;
  readonly executor?: FormatterExecutorPort;
  readonly definitionRegistry?: FormatterDefinitionFactoryRegistry;
  readonly definitionContext?: FormatterDefinitionFactoryContext;
  readonly definitions?: readonly FormatterDefinition[];
  readonly entries?: readonly FormatterInstanceConfig[];
  readonly plans?: readonly FormatterPlan[];
}

/**
 * Describes the resolved formatter components to be used by the build runtime.
 */
export interface FormatterConfigurationResult {
  readonly planner: FormatterPlannerPort;
  readonly executor: FormatterExecutorPort;
  readonly plans: readonly FormatterPlan[];
}

/**
 * Retrieves formatter entries defined in the build configuration, normalising legacy array usage when
 * necessary.
 * @param {BuildConfig} config - Build configuration containing formatter declarations.
 * @returns {ReadonlyArray<FormatterInstanceConfig> | undefined} Formatter entries or undefined when absent.
 */
export function getFormatterConfigEntries(
  config: BuildConfig,
): readonly FormatterInstanceConfig[] | undefined {
  return extractFormatterEntries(config.formatters);
}

function getFormatterConfigPlugins(
  config: BuildConfig,
): readonly FormatterPluginConfigEntry[] | undefined {
  const formatters = config.formatters;
  if (formatters === undefined) {
    return undefined;
  }
  if (Array.isArray(formatters)) {
    return undefined;
  }
  return (formatters as FormatterConfigObject).plugins;
}

/**
 * Creates the formatter planner and executor used for a build. The default registry and executor are used
 * unless overrides are provided.
 * @param {BuildConfig} config - Build configuration defining formatter entries.
 * @param {FormatterConfigurationOverrides} overrides - Optional overrides for planner or executor.
 * @returns {FormatterConfigurationResult} The resolved formatter configuration.
 */
export function createFormatterConfiguration(
  config: BuildConfig,
  overrides: FormatterConfigurationOverrides = {},
): FormatterConfigurationResult {
  const definitionRegistry =
    overrides.definitionRegistry ?? createDefaultFormatterDefinitionRegistry();
  const entries = overrides.entries ?? getFormatterConfigEntries(config);
  const definitionContextOverrides = overrides.definitionContext;
  const definitionContext: FormatterDefinitionFactoryContext =
    definitionContextOverrides === undefined
      ? { config }
      : {
          ...definitionContextOverrides,
          config: definitionContextOverrides.config ?? config,
        };
  const registryOptions: DefaultFormatterRegistryOptions =
    overrides.definitions === undefined
      ? { definitionRegistry, definitionContext }
      : {
          definitions: overrides.definitions,
          definitionRegistry,
          definitionContext,
        };
  const planner = overrides.planner ?? new DefaultFormatterRegistry(registryOptions);
  const plans = overrides.plans ?? planner.plan(entries);
  const executor = overrides.executor ?? new DefaultFormatterExecutor();
  return {
    planner,
    executor,
    plans,
  } satisfies FormatterConfigurationResult;
}

/**
 * Context exposed to formatter plugins, providing access to the registry and configuration locations.
 */
export interface FormatterPluginContext {
  readonly registry: FormatterDefinitionFactoryRegistry;
  readonly config: BuildConfig;
  readonly configDirectory: string;
  readonly configPath: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Function signature expected from formatter plugins.
 * @param {FormatterPluginContext} context - Plugin execution context.
 * @returns {void | Promise<void>} A promise when the plugin performs asynchronous work.
 */
export type FormatterPlugin = (context: FormatterPluginContext) => void | Promise<void>;

/**
 * Shape of modules that can be consumed as formatter plugins. They may provide either a named
 * `registerFormatters` export, a default function export, or allow consumers to select a named export via
 * configuration.
 */
export interface FormatterPluginModule {
  readonly default?: unknown;
  readonly registerFormatters?: unknown;
  [exportName: string]: unknown;
}

/**
 * Function responsible for importing formatter plugin modules. Tests may provide a custom importer to
 * control module resolution.
 * @param {string} specifier - Module specifier to load.
 * @returns {Promise<FormatterPluginModule>} The imported module namespace.
 */
export type FormatterPluginImporter = (specifier: string) => Promise<FormatterPluginModule>;

/**
 * Options describing how formatter plugins should be loaded and which registry instance should receive the
 * resulting registrations.
 */
export interface LoadFormatterDefinitionRegistryOptions {
  readonly config: BuildConfig;
  readonly configDirectory: string;
  readonly configPath: string;
  readonly plugins?: readonly FormatterPluginConfigEntry[];
  readonly registry?: FormatterDefinitionFactoryRegistry;
  readonly importModule?: FormatterPluginImporter;
}

/**
 * Loads formatter plugins declared in configuration and returns the populated registry.
 * @param {LoadFormatterDefinitionRegistryOptions} options - Configuration describing which plugins to load
 * and how to import them.
 * @returns {Promise<FormatterDefinitionFactoryRegistry>} The registry populated with plugin registrations.
 */
export async function loadFormatterDefinitionRegistry(
  options: LoadFormatterDefinitionRegistryOptions,
): Promise<FormatterDefinitionFactoryRegistry> {
  const registry = options.registry ?? createDefaultFormatterDefinitionRegistry();
  const entries = options.plugins ?? getFormatterConfigPlugins(options.config) ?? [];

  if (entries.length === 0) {
    return registry;
  }

  const importModule = options.importModule ?? defaultFormatterPluginImporter;
  for (const entry of entries) {
    const normalised = normaliseFormatterPluginEntry(entry);
    const specifier = resolvePluginModuleSpecifier(normalised.module, options.configDirectory);
    const module = await importModule(specifier);
    const plugin = resolvePluginExport(module, normalised, specifier);
    await plugin({
      registry,
      config: options.config,
      configDirectory: options.configDirectory,
      configPath: options.configPath,
      ...(normalised.options ? { options: normalised.options } : {}),
    });
  }

  return registry;
}

interface NormalisedFormatterPluginEntry {
  readonly module: string;
  readonly register?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

function normaliseFormatterPluginEntry(
  entry: FormatterPluginConfigEntry,
): NormalisedFormatterPluginEntry {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      throw new TypeError('Formatter plugin specifiers must be non-empty strings.');
    }
    return {
      module: trimmed,
    } satisfies NormalisedFormatterPluginEntry;
  }

  if (isPlainObject(entry)) {
    const moduleSpecifier = entry.module;
    if (typeof moduleSpecifier !== 'string' || moduleSpecifier.trim().length === 0) {
      throw new TypeError('Formatter plugin objects must include a non-empty "module" string.');
    }
    const register = entry.register;
    if (register !== undefined && typeof register !== 'string') {
      throw new TypeError('Formatter plugin "register" field must be a string when provided.');
    }
    const options = entry.options;
    let frozenOptions: Readonly<Record<string, unknown>> | undefined;
    if (options !== undefined) {
      if (isPlainObject(options)) {
        frozenOptions = freezeOptions(options);
      } else {
        throw new TypeError('Formatter plugin "options" field must be an object when provided.');
      }
    }

    const module = moduleSpecifier.trim();
    const trimmedRegister = register === undefined ? undefined : register.trim();

    if (frozenOptions && trimmedRegister !== undefined) {
      return {
        module,
        register: trimmedRegister,
        options: frozenOptions,
      } satisfies NormalisedFormatterPluginEntry;
    }
    if (frozenOptions) {
      return {
        module,
        options: frozenOptions,
      } satisfies NormalisedFormatterPluginEntry;
    }
    if (trimmedRegister !== undefined) {
      return {
        module,
        register: trimmedRegister,
      } satisfies NormalisedFormatterPluginEntry;
    }
    return { module } satisfies NormalisedFormatterPluginEntry;
  }

  throw new TypeError('Formatter plugin entries must be strings or objects with a "module" field.');
}

function resolvePluginModuleSpecifier(specifier: string, configDirectory: string): string {
  if (specifier.startsWith('file:')) {
    return specifier;
  }
  if (specifier.startsWith('.')) {
    const resolved = path.resolve(configDirectory, specifier);
    return pathToFileURL(resolved).href;
  }
  if (path.isAbsolute(specifier) || path.win32.isAbsolute(specifier)) {
    return pathToFileURL(specifier).href;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(specifier)) {
    throw new TypeError(
      `Formatter plugin module specifiers must be bare package names or filesystem paths. Received "${specifier}".`,
    );
  }
  return specifier;
}

async function defaultFormatterPluginImporter(specifier: string): Promise<FormatterPluginModule> {
  const imported: unknown = await import(specifier);
  if (isModuleNamespace(imported)) {
    return imported;
  }
  throw new TypeError(`Formatter plugin module ${specifier} did not resolve to an object export.`);
}

function resolvePluginExport(
  module: FormatterPluginModule,
  entry: NormalisedFormatterPluginEntry,
  specifier: string,
): FormatterPlugin {
  if (entry.register) {
    const candidate = module[entry.register];
    return ensurePluginFunction(candidate, specifier, entry.register);
  }

  const named = module.registerFormatters;
  if (typeof named === 'function') {
    return named as FormatterPlugin;
  }

  const defaultExport = module.default;
  if (typeof defaultExport === 'function') {
    return defaultExport as FormatterPlugin;
  }

  if (
    defaultExport &&
    typeof defaultExport === 'object' &&
    typeof (defaultExport as Record<string, unknown>)['registerFormatters'] === 'function'
  ) {
    return (defaultExport as Record<string, unknown>)['registerFormatters'] as FormatterPlugin;
  }

  throw new TypeError(
    `Formatter plugin module ${specifier} must export a function ` +
      'named "registerFormatters" or a default function export.',
  );
}

function ensurePluginFunction(
  candidate: unknown,
  specifier: string,
  exportName: string,
): FormatterPlugin {
  if (typeof candidate !== 'function') {
    throw new TypeError(
      `Formatter plugin export "${exportName}" from ${specifier} must be a function.`,
    );
  }
  return candidate as FormatterPlugin;
}

function extractFormatterEntries(
  formatters: FormatterConfig | undefined,
): readonly FormatterInstanceConfig[] | undefined {
  if (formatters === undefined) {
    return undefined;
  }
  if (Array.isArray(formatters)) {
    return formatters;
  }
  return (formatters as FormatterConfigObject).entries;
}

function freezeOptions(options: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...options });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isModuleNamespace(value: unknown): value is FormatterPluginModule {
  return typeof value === 'object' && value !== null;
}

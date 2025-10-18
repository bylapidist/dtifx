import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  DependencySnapshotBuilderPort,
  DependencyDiffStrategyPort,
} from '../../domain/ports/dependencies.js';
import type {
  BuildConfig,
  DependencyStrategyConfig,
  DependencyStrategyPluginConfigEntry,
} from '../../config/index.js';
import {
  DefaultDependencyStrategyRegistry,
  type DependencyStrategyRegistry,
} from '../../incremental/dependency-strategy-registry.js';

/**
 * Overrides that allow callers to provide custom dependency strategy instances instead of relying on
 * the registry resolution performed by {@link createDependencyConfiguration}.
 */
export interface DependencyConfigurationOverrides {
  readonly builder?: DependencySnapshotBuilderPort;
  readonly diffStrategy?: DependencyDiffStrategyPort;
  readonly registry?: DependencyStrategyRegistry;
  readonly strategy?: DependencyStrategyConfig;
}

/**
 * The resolved dependency strategy wiring required by the build runtime. Builders and diff strategies are
 * always present when returned from {@link createDependencyConfiguration}.
 */
export interface DependencyConfigurationResult {
  readonly builder: DependencySnapshotBuilderPort;
  readonly diffStrategy: DependencyDiffStrategyPort;
}

/**
 * Context object exposed to dependency strategy plugins when they are loaded through
 * {@link loadDependencyStrategyRegistry}. It includes the active registry and access to the resolved
 * configuration files so plugins can register new strategies.
 */
export interface DependencyStrategyPluginContext {
  readonly registry: DependencyStrategyRegistry;
  readonly config: BuildConfig;
  readonly configDirectory: string;
  readonly configPath: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * The function signature expected for dependency strategy plugins.
 */
export type DependencyStrategyPlugin = (
  context: DependencyStrategyPluginContext,
) => void | Promise<void>;

/**
 * The shape of modules loaded as dependency strategy plugins. Plugins can expose either a named
 * `registerDependencyStrategies` export, a default function export, or allow consumers to select an
 * arbitrary export via configuration.
 */
export interface DependencyStrategyPluginModule {
  readonly default?: unknown;
  readonly registerDependencyStrategies?: unknown;
  [exportName: string]: unknown;
}

/**
 * A function that loads dependency strategy plugin modules. Consumers can inject alternative importers to
 * customise module resolution during testing.
 */
export type DependencyStrategyPluginImporter = (
  specifier: string,
) => Promise<DependencyStrategyPluginModule>;

/**
 * Configuration used to load dependency strategy plugins and populate a registry.
 */
export interface LoadDependencyStrategyRegistryOptions {
  readonly config: BuildConfig;
  readonly configDirectory: string;
  readonly configPath: string;
  readonly plugins?: readonly DependencyStrategyPluginConfigEntry[];
  readonly registry?: DependencyStrategyRegistry;
  readonly importModule?: DependencyStrategyPluginImporter;
}

/**
 * Resolves the dependency snapshot builder and diff strategy to use for a build. If custom instances are
 * not provided, the strategy registry is consulted using the configuration supplied in the build config.
 * @param {BuildConfig} config - The build configuration that declares dependency strategy preferences.
 * @param {DependencyConfigurationOverrides} overrides - Optional overrides for registry lookups.
 * @returns {DependencyConfigurationResult} The resolved dependency strategy wiring.
 */
export function createDependencyConfiguration(
  config: BuildConfig,
  overrides: DependencyConfigurationOverrides = {},
): DependencyConfigurationResult {
  let builder = overrides.builder;
  let diffStrategy = overrides.diffStrategy;

  if (builder && diffStrategy) {
    return { builder, diffStrategy } satisfies DependencyConfigurationResult;
  }

  const registry = overrides.registry ?? new DefaultDependencyStrategyRegistry();
  const strategyConfig = overrides.strategy ??
    config.dependencies?.strategy ?? { name: 'snapshot' };
  const definition = registry.resolve(strategyConfig.name);
  if (definition === undefined) {
    throw new Error(
      `Unknown dependency strategy: ${strategyConfig.name}. Available strategies: ${registry
        .list()
        .map((entry) => entry.name)
        .join(', ')}`,
    );
  }
  const strategyOptions = strategyConfig.options;
  const instance = definition.create(
    strategyOptions === undefined ? {} : { options: strategyOptions },
  );
  builder ??= instance.builder;
  diffStrategy ??= instance.diffStrategy;

  if (builder === undefined || diffStrategy === undefined) {
    throw new Error(
      `Dependency strategy "${strategyConfig.name}" did not provide both a snapshot builder and diff strategy.`,
    );
  }

  return { builder, diffStrategy } satisfies DependencyConfigurationResult;
}

/**
 * Loads dependency strategy plugins defined in configuration and returns the populated registry.
 * @param {LoadDependencyStrategyRegistryOptions} options - Settings controlling how plugins are imported and
 * which registry should be hydrated.
 * @returns {Promise<DependencyStrategyRegistry>} The registry after all plugins have been applied.
 */
export async function loadDependencyStrategyRegistry(
  options: LoadDependencyStrategyRegistryOptions,
): Promise<DependencyStrategyRegistry> {
  const registry = options.registry ?? new DefaultDependencyStrategyRegistry();
  const entries = options.plugins ?? options.config.dependencies?.plugins ?? [];

  if (entries.length === 0) {
    return registry;
  }

  const importModule = options.importModule ?? defaultDependencyPluginImporter;
  for (const entry of entries) {
    const normalised = normalisePluginConfigEntry(entry);
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

interface NormalisedDependencyStrategyPluginEntry {
  readonly module: string;
  readonly register?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Normalises the supported dependency strategy plugin configuration entry formats into a consistent
 * structure for downstream processing.
 * @param {DependencyStrategyPluginConfigEntry} entry - The entry to normalise.
 * @returns {NormalisedDependencyStrategyPluginEntry} The normalised plugin entry.
 */
function normalisePluginConfigEntry(
  entry: DependencyStrategyPluginConfigEntry,
): NormalisedDependencyStrategyPluginEntry {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      throw new TypeError('Dependency strategy plugin specifiers must be non-empty strings.');
    }
    return {
      module: trimmed,
    } satisfies NormalisedDependencyStrategyPluginEntry;
  }
  if (isPlainObject(entry) === false) {
    throw new TypeError(
      'Dependency strategy plugin entries must be strings or objects with a "module" field.',
    );
  }
  const moduleSpecifier = entry.module;
  if (typeof moduleSpecifier !== 'string' || moduleSpecifier.trim().length === 0) {
    throw new TypeError(
      'Dependency strategy plugin objects must include a non-empty "module" string.',
    );
  }
  const register = entry.register;
  if (register === undefined) {
    // No-op; register is optional.
  } else if (typeof register !== 'string') {
    throw new TypeError(
      'Dependency strategy plugin "register" field must be a string when provided.',
    );
  }
  const options = entry.options;
  let frozenOptions: Readonly<Record<string, unknown>> | undefined;
  if (options !== undefined) {
    if (isPlainObject(options) === false) {
      throw new TypeError(
        'Dependency strategy plugin "options" field must be an object when provided.',
      );
    }
    frozenOptions = freezeOptions(options);
  }

  const trimmedRegister = typeof register === 'string' ? register.trim() : undefined;
  return {
    module: moduleSpecifier.trim(),
    ...(typeof trimmedRegister === 'string' && trimmedRegister.length > 0
      ? { register: trimmedRegister }
      : {}),
    ...(frozenOptions ? { options: frozenOptions } : {}),
  } satisfies NormalisedDependencyStrategyPluginEntry;
}

/**
 * Resolves a plugin module specifier relative to the configuration directory when necessary.
 * @param {string} specifier - The specifier provided in configuration.
 * @param {string} configDirectory - Directory that should be treated as the root for relative imports.
 * @returns {string} The specifier suitable for dynamic import.
 */
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
      `Dependency strategy plugin module specifiers must be bare package names or filesystem paths. Received "${specifier}".`,
    );
  }
  return specifier;
}

/**
 * Dynamically imports a dependency strategy plugin module.
 * @param {string} specifier - The module specifier to import.
 * @returns {Promise<DependencyStrategyPluginModule>} The imported module namespace.
 */
async function defaultDependencyPluginImporter(
  specifier: string,
): Promise<DependencyStrategyPluginModule> {
  const imported: unknown = await import(specifier);
  if (isModuleNamespace(imported)) {
    return imported;
  }
  throw new TypeError(
    `Dependency strategy plugin module ${specifier} did not resolve to an object export.`,
  );
}

/**
 * Resolves the actual plugin function from a module based on the configuration entry.
 * @param {DependencyStrategyPluginModule} module - The imported module namespace.
 * @param {NormalisedDependencyStrategyPluginEntry} entry - The normalised configuration entry.
 * @param {string} specifier - The specifier used for diagnostic purposes.
 * @returns {DependencyStrategyPlugin} The plugin registration function.
 */
function resolvePluginExport(
  module: DependencyStrategyPluginModule,
  entry: NormalisedDependencyStrategyPluginEntry,
  specifier: string,
): DependencyStrategyPlugin {
  if (entry.register) {
    const candidate = module[entry.register];
    return ensurePluginFunction(candidate, specifier, entry.register);
  }

  const named = module['registerDependencyStrategies'];
  if (typeof named === 'function') {
    return named as DependencyStrategyPlugin;
  }

  const defaultExport = module.default;
  if (typeof defaultExport === 'function') {
    return defaultExport as DependencyStrategyPlugin;
  }

  if (
    defaultExport &&
    typeof defaultExport === 'object' &&
    typeof (defaultExport as Record<string, unknown>)['registerDependencyStrategies'] === 'function'
  ) {
    return (defaultExport as Record<string, unknown>)[
      'registerDependencyStrategies'
    ] as DependencyStrategyPlugin;
  }

  throw new TypeError(
    `Dependency strategy plugin module ${specifier} must export a function ` +
      'named "registerDependencyStrategies" or a default function export.',
  );
}

/**
 * Ensures that the resolved export is a callable plugin function.
 * @param {unknown} candidate - The export retrieved from the module namespace.
 * @param {string} specifier - Module specifier for error reporting.
 * @param {string} exportName - Name of the export being resolved.
 * @returns {DependencyStrategyPlugin} The validated plugin function.
 */
function ensurePluginFunction(
  candidate: unknown,
  specifier: string,
  exportName: string,
): DependencyStrategyPlugin {
  if (typeof candidate !== 'function') {
    throw new TypeError(
      `Dependency strategy plugin export "${exportName}" from ${specifier} must be a function.`,
    );
  }
  return candidate as DependencyStrategyPlugin;
}

/**
 * Determines whether a value is a plain object.
 * @param {unknown} value - Value to inspect.
 * @returns {value is Record<string, unknown>} True when the value is a non-null object literal.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Creates an immutable snapshot of plugin options.
 * @param {Record<string, unknown>} options - Options to freeze.
 * @returns {Readonly<Record<string, unknown>>} A frozen copy of the options.
 */
function freezeOptions(options: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...options });
}

/**
 * Type guard verifying a value is a module namespace object.
 * @param {unknown} value - Value to inspect.
 * @returns {value is DependencyStrategyPluginModule} True when the value resembles a module namespace.
 */
function isModuleNamespace(value: unknown): value is DependencyStrategyPluginModule {
  return typeof value === 'object' && value !== null;
}

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  BuildConfig,
  TransformConfigEntry,
  TransformPluginConfigEntry,
} from '../../config/index.js';
import type { TransformExecutorPort } from '../../domain/ports/transforms.js';
import type { TransformCache } from '../../transform/transform-cache.js';
import {
  TransformRegistry,
  type TransformDefinition,
  STATIC_TRANSFORM_OPTIONS_HASH,
} from '../../transform/transform-registry.js';
import { DefaultTransformExecutor } from '../../infrastructure/transforms/default-transform-executor.js';
import { createDefaultTransforms } from '../../transform/default-transforms.js';
import {
  colorToCssTransform,
  colorToAndroidArgbTransform,
  colorToAndroidComposeColorTransform,
  colorToSwiftUIColorTransform,
} from '../../transform/color-transforms.js';
import {
  dimensionToAndroidDpTransform,
  dimensionToAndroidSpTransform,
  dimensionToPxTransform,
  dimensionToRemTransform,
  dimensionToSwiftUiPointsTransform,
} from '../../transform/dimension-transforms.js';
import {
  gradientToAndroidMaterialTransform,
  gradientToCssTransform,
  gradientToSwiftUiTransform,
} from '../../transform/gradient-transforms.js';
import {
  borderToCssTransform,
  borderToAndroidComposeShapeTransform,
} from '../../transform/border-transforms.js';
import {
  shadowToAndroidMaterialTransform,
  shadowToCssTransform,
  shadowToSwiftUiTransform,
} from '../../transform/shadow-transforms.js';
import {
  typographyToCssTransform,
  typographyToAndroidMaterialTransform,
  typographyToAndroidComposeTransform,
  typographyToSwiftUiTransform,
} from '../../transform/typography-transforms.js';
import { assertPlainObject } from '../../config/config-options.js';
import { normaliseTransformGroupName } from '../../transform/transform-groups.js';

/**
 * Context passed to transform definition factories containing the resolved build configuration and the
 * location of the configuration files when available.
 */
export interface TransformDefinitionFactoryContext {
  readonly config: BuildConfig;
  readonly configDirectory?: string;
  readonly configPath?: string;
}

/**
 * A factory capable of turning transform configuration entries into executable transform definitions.
 */
export interface TransformDefinitionFactory {
  readonly name: string;
  create(
    entry: TransformConfigEntry,
    context: TransformDefinitionFactoryContext,
  ): TransformDefinition;
}

/**
 * Registry responsible for locating {@link TransformDefinitionFactory} instances by name.
 */
export class TransformDefinitionFactoryRegistry {
  private readonly factories = new Map<string, TransformDefinitionFactory>();

  /**
   * Creates a registry seeded with the provided factories.
   * @param {readonly TransformDefinitionFactory[]} initial - Factories to register immediately.
   */
  constructor(initial: readonly TransformDefinitionFactory[] = []) {
    for (const factory of initial) {
      this.register(factory);
    }
  }

  /**
   * Stores the provided factory under its declared name, replacing any previous registration.
   * @param {TransformDefinitionFactory} factory - Factory to record.
   */
  register(factory: TransformDefinitionFactory): void {
    this.factories.set(factory.name, factory);
  }

  /**
   * Resolves a factory by name if one has been registered.
   * @param {string} name - Name of the transform factory to resolve.
   * @returns {TransformDefinitionFactory | undefined} The matching factory when one is registered.
   */
  resolve(name: string): TransformDefinitionFactory | undefined {
    return this.factories.get(name);
  }

  /**
   * Lists all registered factories in insertion order.
   * @returns {readonly TransformDefinitionFactory[]} The registered factories.
   */
  list(): readonly TransformDefinitionFactory[] {
    return [...this.factories.values()];
  }
}

/**
 * Creates a transform factory registry populated with the default built-in transforms.
 * @returns {TransformDefinitionFactoryRegistry} Registry seeded with built-in factories.
 */
export function createDefaultTransformDefinitionRegistry(): TransformDefinitionFactoryRegistry {
  return new TransformDefinitionFactoryRegistry(createDefaultTransformFactories());
}

/**
 * Creates the collection of CSS-oriented transform definition factories provided by the build system.
 * @returns {readonly TransformDefinitionFactory[]} The built-in CSS transform factories.
 */
export function createCssTransformFactories(): readonly TransformDefinitionFactory[] {
  return [
    createColorToCssFactory(),
    createDimensionToRemFactory(),
    createDimensionToPxFactory(),
    createGradientToCssFactory(),
    createBorderToCssFactory(),
    createShadowToCssFactory(),
    createTypographyToCssFactory(),
  ];
}

/**
 * Creates the collection of SwiftUI-oriented transform definition factories provided by the build system.
 * @returns {readonly TransformDefinitionFactory[]} The built-in SwiftUI transform factories.
 */
export function createIosSwiftUiTransformFactories(): readonly TransformDefinitionFactory[] {
  return [
    createColorToSwiftUIColorFactory(),
    createDimensionToSwiftUiPointsFactory(),
    createGradientToSwiftUiFactory(),
    createShadowToSwiftUiFactory(),
    createTypographyToSwiftUiFactory(),
  ];
}

/**
 * Creates the collection of Android-oriented transform definition factories provided by the build system.
 * @returns {readonly TransformDefinitionFactory[]} The built-in Android transform factories.
 */
export function createAndroidMaterialTransformFactories(): readonly TransformDefinitionFactory[] {
  return [
    createColorToAndroidArgbFactory(),
    createDimensionToAndroidDpFactory(),
    createDimensionToAndroidSpFactory(),
    createGradientToAndroidMaterialFactory(),
    createShadowToAndroidMaterialFactory(),
    createTypographyToAndroidMaterialFactory(),
  ];
}

/**
 * Creates the collection of Android Compose transform definition factories provided by the build system.
 * @returns {readonly TransformDefinitionFactory[]} The built-in Android Compose transform factories.
 */
export function createAndroidComposeTransformFactories(): readonly TransformDefinitionFactory[] {
  return [
    createColorToAndroidComposeColorFactory(),
    createBorderToAndroidComposeShapeFactory(),
    createTypographyToAndroidComposeFactory(),
  ];
}

/**
 * Overrides that allow callers to supply pre-built transform definitions or registries when configuring the
 * transform pipeline.
 */
export interface TransformConfigurationOverrides {
  readonly cache?: TransformCache;
  readonly definitions?: readonly TransformDefinition[];
  readonly registry?: TransformRegistry;
  readonly executor?: TransformExecutorPort;
  readonly definitionRegistry?: TransformDefinitionFactoryRegistry;
  readonly definitionContext?: TransformDefinitionFactoryContext;
  readonly entries?: readonly TransformConfigEntry[];
}

/**
 * Resolved transform configuration including the definitions, registry, and executor that should be used
 * by the build runtime.
 */
export interface TransformConfigurationResult {
  readonly definitions: readonly TransformDefinition[];
  readonly registry: TransformRegistry;
  readonly executor: TransformExecutorPort;
}

/**
 * Creates the transform execution environment for a build using either user supplied overrides or the
 * default built-in transforms defined in configuration.
 * @param {BuildConfig} config - Build configuration describing transforms to enable.
 * @param {TransformConfigurationOverrides} overrides - Optional overrides for definitions, registry, or executor.
 * @returns {TransformConfigurationResult} The resolved transform configuration.
 */
export function createTransformConfiguration(
  config: BuildConfig,
  overrides: TransformConfigurationOverrides = {},
): TransformConfigurationResult {
  const definitionRegistry =
    overrides.definitionRegistry ?? createDefaultTransformDefinitionRegistry();
  const entries = overrides.entries ?? config.transforms?.entries ?? undefined;
  const definitionContextOverrides = overrides.definitionContext;
  const definitionContext: TransformDefinitionFactoryContext =
    definitionContextOverrides === undefined
      ? { config }
      : {
          ...definitionContextOverrides,
          config: definitionContextOverrides.config ?? config,
        };
  const definitions =
    overrides.definitions ??
    (overrides.registry
      ? overrides.registry.list()
      : normaliseTransforms(entries, definitionRegistry, definitionContext));
  const registry = overrides.registry ?? new TransformRegistry(definitions);
  const executor =
    overrides.executor ??
    new DefaultTransformExecutor({
      registry,
      ...(overrides.cache ? { cache: overrides.cache } : {}),
    });

  return {
    definitions,
    registry,
    executor,
  } satisfies TransformConfigurationResult;
}

/**
 * Converts transform configuration entries into concrete transform definitions using the provided
 * registry.
 * @param {ReadonlyArray<TransformConfigEntry> | undefined} configEntries - The transform entries defined in configuration.
 * @param {TransformDefinitionFactoryRegistry} registry - Registry used to resolve transform factories.
 * @param {TransformDefinitionFactoryContext} context - Context passed to each factory.
 * @returns {readonly TransformDefinition[]} The resolved transform definitions.
 */
function normaliseTransforms(
  configEntries: readonly TransformConfigEntry[] | undefined,
  registry: TransformDefinitionFactoryRegistry,
  context: TransformDefinitionFactoryContext,
): readonly TransformDefinition[] {
  if (configEntries === undefined || configEntries.length === 0) {
    return createDefaultTransforms();
  }
  const seen = new Set<string>();
  const definitions: TransformDefinition[] = [];
  for (const entry of configEntries) {
    if (seen.has(entry.name)) {
      throw new Error(`Duplicate transform configuration for "${entry.name}".`);
    }
    seen.add(entry.name);
    const group = parseTransformGroup(entry);
    const factory = registry.resolve(entry.name);
    if (factory === undefined) {
      throw new Error(`Unknown transform "${entry.name}" in configuration.`);
    }
    const definition = factory.create(entry, context);
    const resolvedGroup = normaliseTransformGroupName(group ?? definition.group);
    definitions.push({
      ...definition,
      group: resolvedGroup,
      optionsHash: definition.optionsHash ?? STATIC_TRANSFORM_OPTIONS_HASH,
    });
  }
  return definitions;
}

/**
 * Validates and normalises the optional transform group name specified in configuration.
 * @param {TransformConfigEntry} entry - Entry to evaluate.
 * @returns {string | undefined} The trimmed group name when provided.
 */
function parseTransformGroup(entry: TransformConfigEntry): string | undefined {
  if (entry.group === undefined) {
    return undefined;
  }
  if (typeof entry.group !== 'string') {
    throw new TypeError(`Transform "${entry.name}" group must be a string when provided.`);
  }
  const trimmed = entry.group.trim();
  if (trimmed.length === 0) {
    throw new TypeError(`Transform "${entry.name}" group must be a non-empty string.`);
  }
  return trimmed;
}

/**
 * Creates the collection of default transform definition factories supplied by the build system.
 * @returns {readonly TransformDefinitionFactory[]} The built-in transform factories.
 */
function createDefaultTransformFactories(): readonly TransformDefinitionFactory[] {
  return [
    ...createCssTransformFactories(),
    ...createIosSwiftUiTransformFactories(),
    ...createAndroidMaterialTransformFactories(),
    ...createAndroidComposeTransformFactories(),
  ];
}

/**
 * Produces the factory that converts color tokens to CSS values.
 * @returns {TransformDefinitionFactory} The color-to-CSS factory.
 */
function createColorToCssFactory(): TransformDefinitionFactory {
  return {
    name: 'color.toCss',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return colorToCssTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createColorToAndroidArgbFactory(): TransformDefinitionFactory {
  return {
    name: 'color.toAndroidArgb',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return colorToAndroidArgbTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createColorToAndroidComposeColorFactory(): TransformDefinitionFactory {
  return {
    name: 'color.toAndroidComposeColor',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return colorToAndroidComposeColorTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createColorToSwiftUIColorFactory(): TransformDefinitionFactory {
  return {
    name: 'color.toSwiftUIColor',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return colorToSwiftUIColorTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createDimensionToSwiftUiPointsFactory(): TransformDefinitionFactory {
  return {
    name: 'dimension.toSwiftUiPoints',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return dimensionToSwiftUiPointsTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createDimensionToAndroidDpFactory(): TransformDefinitionFactory {
  return {
    name: 'dimension.toAndroidDp',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return dimensionToAndroidDpTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createDimensionToAndroidSpFactory(): TransformDefinitionFactory {
  return {
    name: 'dimension.toAndroidSp',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return dimensionToAndroidSpTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createGradientToSwiftUiFactory(): TransformDefinitionFactory {
  return {
    name: 'gradient.toSwiftUI',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return gradientToSwiftUiTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createGradientToAndroidMaterialFactory(): TransformDefinitionFactory {
  return {
    name: 'gradient.toAndroidMaterial',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return gradientToAndroidMaterialTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createShadowToAndroidMaterialFactory(): TransformDefinitionFactory {
  return {
    name: 'shadow.toAndroidMaterial',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return shadowToAndroidMaterialTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createShadowToSwiftUiFactory(): TransformDefinitionFactory {
  return {
    name: 'shadow.toSwiftUI',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return shadowToSwiftUiTransform;
    },
  } satisfies TransformDefinitionFactory;
}

/**
 * Produces the factory that converts dimension tokens to rem values.
 * @returns {TransformDefinitionFactory} The dimension-to-rem factory.
 */
function createDimensionToRemFactory(): TransformDefinitionFactory {
  return {
    name: 'dimension.toRem',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return dimensionToRemTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createTypographyToAndroidMaterialFactory(): TransformDefinitionFactory {
  return {
    name: 'typography.toAndroidMaterial',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return typographyToAndroidMaterialTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createTypographyToAndroidComposeFactory(): TransformDefinitionFactory {
  return {
    name: 'typography.toAndroidCompose',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return typographyToAndroidComposeTransform;
    },
  } satisfies TransformDefinitionFactory;
}

/**
 * Produces the factory that converts dimension tokens to pixel values.
 * @returns {TransformDefinitionFactory} The dimension-to-px factory.
 */
function createDimensionToPxFactory(): TransformDefinitionFactory {
  return {
    name: 'dimension.toPx',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return dimensionToPxTransform;
    },
  } satisfies TransformDefinitionFactory;
}

/**
 * Produces the factory that converts gradient tokens to CSS gradient values.
 * @returns {TransformDefinitionFactory} The gradient-to-CSS factory.
 */
function createGradientToCssFactory(): TransformDefinitionFactory {
  return {
    name: 'gradient.toCss',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return gradientToCssTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createShadowToCssFactory(): TransformDefinitionFactory {
  return {
    name: 'shadow.toCss',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return shadowToCssTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createBorderToCssFactory(): TransformDefinitionFactory {
  return {
    name: 'border.toCss',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return borderToCssTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createBorderToAndroidComposeShapeFactory(): TransformDefinitionFactory {
  return {
    name: 'border.toAndroidComposeShape',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return borderToAndroidComposeShapeTransform;
    },
  } satisfies TransformDefinitionFactory;
}

/**
 * Produces the factory that converts typography tokens to CSS typography properties.
 * @returns {TransformDefinitionFactory} The typography-to-CSS factory.
 */
function createTypographyToCssFactory(): TransformDefinitionFactory {
  return {
    name: 'typography.toCss',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return typographyToCssTransform;
    },
  } satisfies TransformDefinitionFactory;
}

function createTypographyToSwiftUiFactory(): TransformDefinitionFactory {
  return {
    name: 'typography.toSwiftUI',
    create(entry) {
      assertNoOptions(entry, entry.name);
      return typographyToSwiftUiTransform;
    },
  } satisfies TransformDefinitionFactory;
}

/**
 * Ensures that a transform configuration entry does not supply options for transforms that do not accept any.
 * @param {TransformConfigEntry} entry - Entry being validated.
 * @param {string} name - Name of the transform for diagnostic messages.
 */
function assertNoOptions(entry: TransformConfigEntry, name: string): void {
  if (entry.options === undefined) {
    return;
  }
  assertPlainObject(entry.options, `${name} options`);
  const keys = Object.keys(entry.options);
  if (keys.length > 0) {
    throw new TypeError(
      `Transform "${name}" does not accept configuration options. Received: ${keys.join(', ')}`,
    );
  }
}

/**
 * Context exposed to transform plugins, providing access to the registry and configuration locations.
 */
export interface TransformPluginContext {
  readonly registry: TransformDefinitionFactoryRegistry;
  readonly config: BuildConfig;
  readonly configDirectory: string;
  readonly configPath: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Function signature expected from transform plugins.
 * @param {TransformPluginContext} context - Plugin execution context.
 * @returns {void | Promise<void>} A promise when the plugin performs asynchronous work.
 */
export type TransformPlugin = (context: TransformPluginContext) => void | Promise<void>;

/**
 * Shape of modules that can be consumed as transform plugins. They may provide either a named
 * `registerTransforms` export, a default function export, or allow consumers to select a named export via
 * configuration.
 */
export interface TransformPluginModule {
  readonly default?: unknown;
  readonly registerTransforms?: unknown;
  [exportName: string]: unknown;
}

/**
 * Function responsible for importing transform plugin modules. Tests may provide a custom importer to
 * control module resolution.
 * @param {string} specifier - Module specifier to load.
 * @returns {Promise<TransformPluginModule>} The imported module namespace.
 */
export type TransformPluginImporter = (specifier: string) => Promise<TransformPluginModule>;

/**
 * Options describing how transform plugins should be loaded and which registry instance should receive the
 * resulting registrations.
 */
export interface LoadTransformDefinitionRegistryOptions {
  readonly config: BuildConfig;
  readonly configDirectory: string;
  readonly configPath: string;
  readonly plugins?: readonly TransformPluginConfigEntry[];
  readonly registry?: TransformDefinitionFactoryRegistry;
  readonly importModule?: TransformPluginImporter;
}

/**
 * Loads transform plugins declared in configuration and returns the populated registry.
 * @param {LoadTransformDefinitionRegistryOptions} options - Configuration describing which plugins to load
 * and how to import them.
 * @returns {Promise<TransformDefinitionFactoryRegistry>} The registry populated with plugin registrations.
 */
export async function loadTransformDefinitionRegistry(
  options: LoadTransformDefinitionRegistryOptions,
): Promise<TransformDefinitionFactoryRegistry> {
  const registry = options.registry ?? createDefaultTransformDefinitionRegistry();
  const entries = options.plugins ?? options.config.transforms?.plugins ?? [];

  if (entries.length === 0) {
    return registry;
  }

  const importModule = options.importModule ?? defaultTransformPluginImporter;
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

interface NormalisedTransformPluginEntry {
  readonly module: string;
  readonly register?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Normalises transform plugin configuration entries into a consistent structure.
 * @param {TransformPluginConfigEntry} entry - Entry defined in configuration.
 * @returns {NormalisedTransformPluginEntry} The normalised plugin entry.
 */
function normalisePluginConfigEntry(
  entry: TransformPluginConfigEntry,
): NormalisedTransformPluginEntry {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      throw new TypeError('Transform plugin specifiers must be non-empty strings.');
    }
    return {
      module: trimmed,
    } satisfies NormalisedTransformPluginEntry;
  }
  if (isPlainObject(entry)) {
    const moduleSpecifier = entry.module;
    if (typeof moduleSpecifier !== 'string' || moduleSpecifier.trim().length === 0) {
      throw new TypeError('Transform plugin objects must include a non-empty "module" string.');
    }
    const register = entry.register;
    if (register !== undefined && typeof register !== 'string') {
      throw new TypeError('Transform plugin "register" field must be a string when provided.');
    }
    const options = entry.options;
    let frozenOptions: Readonly<Record<string, unknown>> | undefined;
    if (options !== undefined) {
      if (isPlainObject(options)) {
        frozenOptions = freezeOptions(options);
      } else {
        throw new TypeError('Transform plugin "options" field must be an object when provided.');
      }
    }

    const module = moduleSpecifier.trim();
    const trimmedRegister = register === undefined ? undefined : register.trim();
    if (frozenOptions && trimmedRegister !== undefined) {
      return {
        module,
        register: trimmedRegister,
        options: frozenOptions,
      } satisfies NormalisedTransformPluginEntry;
    }
    if (frozenOptions) {
      return {
        module,
        options: frozenOptions,
      } satisfies NormalisedTransformPluginEntry;
    }
    if (trimmedRegister !== undefined) {
      return {
        module,
        register: trimmedRegister,
      } satisfies NormalisedTransformPluginEntry;
    }
    return { module } satisfies NormalisedTransformPluginEntry;
  }
  throw new TypeError('Transform plugin entries must be strings or objects with a "module" field.');
}

/**
 * Resolves a transform plugin module specifier relative to the configuration directory when required.
 * @param {string} specifier - Specifier provided by the user.
 * @param {string} configDirectory - Directory considered the base for relative imports.
 * @returns {string} Specifier ready to be consumed by dynamic import.
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
      `Transform plugin module specifiers must be bare package names or filesystem paths. Received "${specifier}".`,
    );
  }
  return specifier;
}

/**
 * Dynamically imports a transform plugin module.
 * @param {string} specifier - Module specifier to import.
 * @returns {Promise<TransformPluginModule>} The imported module namespace.
 */
async function defaultTransformPluginImporter(specifier: string): Promise<TransformPluginModule> {
  const imported: unknown = await import(specifier);
  if (isModuleNamespace(imported)) {
    return imported;
  }
  throw new TypeError(`Transform plugin module ${specifier} did not resolve to an object export.`);
}

/**
 * Resolves the plugin function to execute from a module namespace.
 * @param {TransformPluginModule} module - Imported module namespace.
 * @param {NormalisedTransformPluginEntry} entry - Normalised configuration entry describing the export.
 * @param {string} specifier - Original specifier for diagnostics.
 * @returns {TransformPlugin} The plugin registration function.
 */
function resolvePluginExport(
  module: TransformPluginModule,
  entry: NormalisedTransformPluginEntry,
  specifier: string,
): TransformPlugin {
  if (entry.register) {
    const candidate = module[entry.register];
    return ensurePluginFunction(candidate, specifier, entry.register);
  }

  const named = module.registerTransforms;
  if (typeof named === 'function') {
    return named as TransformPlugin;
  }

  const defaultExport = module.default;
  if (typeof defaultExport === 'function') {
    return defaultExport as TransformPlugin;
  }

  if (
    defaultExport &&
    typeof defaultExport === 'object' &&
    typeof (defaultExport as Record<string, unknown>)['registerTransforms'] === 'function'
  ) {
    return (defaultExport as Record<string, unknown>)['registerTransforms'] as TransformPlugin;
  }

  throw new TypeError(
    `Transform plugin module ${specifier} must export a function ` +
      'named "registerTransforms" or a default function export.',
  );
}

/**
 * Ensures a resolved module export is a callable plugin function.
 * @param {unknown} candidate - Export resolved from the module namespace.
 * @param {string} specifier - Module specifier for diagnostics.
 * @param {string} exportName - Name of the export being evaluated.
 * @returns {TransformPlugin} The validated plugin function.
 */
function ensurePluginFunction(
  candidate: unknown,
  specifier: string,
  exportName: string,
): TransformPlugin {
  if (typeof candidate !== 'function') {
    throw new TypeError(
      `Transform plugin export "${exportName}" from ${specifier} must be a function.`,
    );
  }
  return candidate as TransformPlugin;
}

/**
 * Determines whether a value is a plain object literal.
 * @param {unknown} value - Value to inspect.
 * @returns {value is Record<string, unknown>} True when the value is a non-null object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Produces an immutable snapshot of plugin options.
 * @param {Record<string, unknown>} options - Options to freeze.
 * @returns {Readonly<Record<string, unknown>>} Frozen copy of the options.
 */
function freezeOptions(options: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...options });
}

/**
 * Type guard verifying that a value looks like a module namespace object.
 * @param {unknown} value - Value to inspect.
 * @returns {value is TransformPluginModule} True when the value is an object namespace.
 */
function isModuleNamespace(value: unknown): value is TransformPluginModule {
  return typeof value === 'object' && value !== null;
}

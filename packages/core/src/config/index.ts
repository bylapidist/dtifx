import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { cosmiconfig, defaultLoaders, type CosmiconfigResult, type Loader } from 'cosmiconfig';

type NonNullableCosmiconfigResult = Exclude<CosmiconfigResult, null>;

export const DEFAULT_DTIFX_CONFIG_FILES = Object.freeze([
  'dtifx.config.mjs',
  'dtifx.config.js',
  'dtifx.config.cjs',
  'dtifx.config.json',
] as const);

export interface ResolveConfigPathOptions {
  readonly cwd?: string;
  readonly configPath?: string;
  readonly candidates?: readonly string[];
}

export interface LoadConfigModuleOptions {
  readonly path: string;
  readonly cwd?: string;
}

export interface LoadedConfigModule<TConfig = unknown> {
  readonly path: string;
  readonly directory: string;
  readonly config: TConfig;
}

const MODULE_NAME = 'dtifx';

const moduleLoader: Loader = async (filepath: string, _content: string) => {
  const importedModule = await import(pathToFileURL(filepath).href);
  if (!importedModule || typeof importedModule !== 'object') {
    return importedModule;
  }

  const moduleRecord = importedModule as Record<string, unknown>;
  if ('default' in moduleRecord) {
    return (moduleRecord as { default: unknown }).default;
  }
  if ('config' in moduleRecord) {
    return (moduleRecord as { config: unknown }).config;
  }
  if ('buildConfig' in moduleRecord) {
    return (moduleRecord as { buildConfig: unknown }).buildConfig;
  }

  return moduleRecord;
};

function createExplorer(searchPlaces: readonly string[], stopDir: string) {
  return cosmiconfig(MODULE_NAME, {
    cache: false,
    searchPlaces: [...searchPlaces],
    stopDir,
    loaders: {
      '.json': defaultLoaders['.json'],
      '.js': moduleLoader,
      '.mjs': moduleLoader,
      '.cjs': moduleLoader,
    },
    transform: async (result: CosmiconfigResult | null) =>
      result ? transformResult(result as NonNullableCosmiconfigResult) : result,
  });
}

/**
 * Determines the absolute path to a dtifx configuration file.
 *
 * @param options - Overrides for the working directory, explicit path, or search candidates.
 * @returns The resolved configuration path.
 * @throws {Error} When the configuration cannot be found in the provided locations.
 */
export async function resolveConfigPath(options: ResolveConfigPathOptions = {}): Promise<string> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const searchPlaces = options.candidates
    ? [...options.candidates]
    : [...DEFAULT_DTIFX_CONFIG_FILES];
  const explorer = createExplorer(searchPlaces, cwd);

  if (options.configPath) {
    const resolvedPath = path.resolve(cwd, options.configPath);
    try {
      const loaded = await explorer.load(resolvedPath);
      if (!loaded || loaded.isEmpty) {
        throw new Error(`Configuration file not found: ${options.configPath}`);
      }
      return loaded.filepath;
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new Error(`Configuration file not found: ${options.configPath}`);
      }
      throw error;
    }
  }

  const result = await explorer.search(cwd);
  if (!result || result.isEmpty) {
    throw new Error('Unable to locate dtifx configuration file in the current directory.');
  }

  return result.filepath;
}

/**
 * Loads a configuration module, resolving any function or promise exports.
 *
 * @param options - Module loading options including the relative or absolute path.
 * @returns Loaded configuration metadata and the resolved configuration value.
 */
export async function loadConfigModule<TConfig = unknown>(
  options: LoadConfigModuleOptions,
): Promise<LoadedConfigModule<TConfig>> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const resolvedPath = path.resolve(cwd, options.path);
  const explorer = createExplorer(DEFAULT_DTIFX_CONFIG_FILES, path.dirname(resolvedPath));

  try {
    const result = await explorer.load(resolvedPath);
    if (!result || result.isEmpty) {
      throw new Error(`Configuration file not found at ${resolvedPath}`);
    }

    return {
      path: result.filepath,
      directory: path.dirname(result.filepath),
      config: result.config as TConfig,
    } satisfies LoadedConfigModule<TConfig>;
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new Error(`Configuration file not found at ${resolvedPath}`);
    }
    throw error;
  }
}

async function transformResult(
  result: NonNullableCosmiconfigResult,
): Promise<NonNullableCosmiconfigResult> {
  const resolvedConfig = await resolveExportedValue(result.config);
  return { ...result, config: resolvedConfig } as NonNullableCosmiconfigResult;
}

async function resolveExportedValue<T>(candidate: T): Promise<unknown> {
  let value: unknown = candidate;

  for (;;) {
    if (typeof value === 'function') {
      value = (value as () => unknown)();
      continue;
    }

    if (value instanceof Promise) {
      value = await value;
      continue;
    }

    return value;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT',
  );
}

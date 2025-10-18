import {
  loadConfigModule,
  resolveConfigPath as coreResolveConfigPath,
  type LoadConfigModuleOptions,
  type ResolveConfigPathOptions as CoreResolveConfigPathOptions,
} from '@dtifx/core/config';

import type { AuditConfigurationSource } from './policies.js';

export type ResolveAuditConfigPathOptions = CoreResolveConfigPathOptions;

/**
 * Resolves the dtifx configuration path for audit workflows using the shared loader.
 *
 * @param options - Overrides for the working directory or explicit configuration path.
 * @returns The resolved configuration path on disk.
 */
export function resolveAuditConfigPath(
  options: ResolveAuditConfigPathOptions = {},
): Promise<string> {
  return coreResolveConfigPath(options);
}

export interface LoadAuditConfigurationOptions extends LoadConfigModuleOptions {}

export interface LoadedAuditConfiguration<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
> {
  readonly path: string;
  readonly directory: string;
  readonly config: TConfig;
}

/**
 * Loads a dtifx configuration module and returns the audit-aware configuration metadata.
 *
 * @param options - Module loading options including the relative or absolute path.
 * @returns Loaded configuration metadata tailored for audit consumers.
 */
export async function loadAuditConfiguration<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
>(options: LoadAuditConfigurationOptions): Promise<LoadedAuditConfiguration<TConfig>> {
  const loaded = await loadConfigModule<TConfig>(options);
  assertConfigurationShape(loaded.config, loaded.path);

  return {
    path: loaded.path,
    directory: loaded.directory,
    config: loaded.config,
  } satisfies LoadedAuditConfiguration<TConfig>;
}

function assertConfigurationShape(
  candidate: unknown,
  configPath: string,
): asserts candidate is AuditConfigurationSource {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError(
      `Configuration at ${configPath} must export an object or promise resolving to an object.`,
    );
  }
}

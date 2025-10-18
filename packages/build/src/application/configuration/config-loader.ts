import path from 'node:path';

import {
  loadConfigModule,
  resolveConfigPath as coreResolveConfigPath,
  type ResolveConfigPathOptions as CoreResolveConfigPathOptions,
} from '@dtifx/core/config';
import { z } from 'zod';

export type ResolveConfigPathOptions = CoreResolveConfigPathOptions;

/**
 * Resolves the dtifx-build configuration path using the shared loader.
 *
 * @param options - Overrides for the working directory or explicit configuration path.
 * @returns The resolved configuration path on disk.
 */
export async function resolveConfigPath(options: ResolveConfigPathOptions = {}): Promise<string> {
  try {
    return await coreResolveConfigPath(options);
  } catch (error) {
    if (
      error instanceof Error &&
      !options.configPath &&
      error.message === 'Unable to locate dtifx configuration file in the current directory.'
    ) {
      throw new Error('Unable to locate dtifx-build configuration file in the current directory.');
    }
    throw error;
  }
}

import type { BuildConfig } from '../../config/index.js';

/**
 * Result object returned when configuration data has been loaded and normalised from disk.
 */
export interface LoadedConfig {
  readonly path: string;
  readonly directory: string;
  readonly config: BuildConfig;
}

/**
 * Loads a dtifx-build configuration file, resolves any asynchronous exports, and validates the
 * resulting structure before returning the normalised configuration.
 * @param {string} configPath - Path to the configuration file provided by the caller or discovered
 *   via {@link resolveConfigPath}.
 * @returns {Promise<LoadedConfig>} The validated configuration and related metadata.
 * @throws {Error} When the configuration file is missing or exports data with an unexpected shape.
 */
export async function loadConfig(configPath: string): Promise<LoadedConfig> {
  const loaded = await loadConfigModule<unknown>({ path: configPath });
  const schema = createBuildConfigSchema(loaded.directory);
  const config = schema.parse(loaded.config) as BuildConfig;

  return {
    path: loaded.path,
    directory: loaded.directory,
    config,
  };
}

function createBuildConfigSchema(configDirectory: string): z.ZodType<BuildConfig> {
  const nonEmptyString = z
    .string()
    .refine((value) => value.trim().length > 0, { message: 'String must not be empty.' });

  const optionsRecordSchema = z.record(z.string(), z.unknown());

  const pluginModuleSchema = z
    .object({
      module: nonEmptyString,
      register: z.string().optional(),
      options: optionsRecordSchema.optional(),
    })
    .passthrough();

  const pluginEntrySchema = z.union([nonEmptyString, pluginModuleSchema]);

  const transformEntrySchema = z
    .object({
      name: z.string(),
      group: z.string().optional(),
      options: optionsRecordSchema.optional(),
    })
    .passthrough();

  const transformsSchema = z
    .object({
      entries: z.array(transformEntrySchema).optional(),
      plugins: z.array(pluginEntrySchema).optional(),
    })
    .passthrough();

  const formatterOutputSchema = z
    .object({ directory: z.string().optional() })
    .passthrough()
    .transform((output) => (output.directory === undefined ? {} : { directory: output.directory }));

  const formatterInstanceSchema = z
    .object({
      id: z.string().optional(),
      name: z.string(),
      options: optionsRecordSchema.optional(),
      output: z.union([formatterOutputSchema, z.undefined()]).optional(),
    })
    .passthrough()
    .transform((formatter) => ({
      ...formatter,
      output: formatter.output ?? formatterOutputSchema.parse({}),
    }));

  const formatterArraySchema = z
    .array(formatterInstanceSchema)
    .transform((formatters) => formatters.map((formatter) => formatter));

  const formatterObjectSchema = z
    .object({
      entries: z.array(formatterInstanceSchema).optional(),
      plugins: z.array(pluginEntrySchema).optional(),
    })
    .passthrough()
    .transform((formatter) => ({
      ...(formatter.entries ? { entries: formatter.entries } : {}),
      ...(formatter.plugins ? { plugins: formatter.plugins } : {}),
    }));

  const formatterSchema = z.union([formatterArraySchema, formatterObjectSchema]);

  const dependencyStrategySchema = z
    .object({
      name: z.string(),
      options: optionsRecordSchema.optional(),
    })
    .passthrough();

  const dependencySchema = z
    .object({
      strategy: dependencyStrategySchema.optional(),
      plugins: z.array(pluginEntrySchema).optional(),
    })
    .passthrough()
    .transform((dependency) => ({
      ...(dependency.strategy ? { strategy: dependency.strategy } : {}),
      ...(dependency.plugins ? { plugins: dependency.plugins } : {}),
    }));

  const policyEntrySchema = z
    .object({
      name: z.string(),
      options: optionsRecordSchema.optional(),
    })
    .passthrough();

  const auditSchema = z
    .object({
      policies: z.array(policyEntrySchema),
      plugins: z.array(pluginEntrySchema).optional(),
    })
    .passthrough()
    .transform((audit) => ({
      policies: audit.policies,
      ...(audit.plugins ? { plugins: audit.plugins } : {}),
    }));

  const pointerPlaceholderSchema = z
    .object({
      kind: z.literal('placeholder'),
      name: z.union([
        z.literal('relative'),
        z.literal('basename'),
        z.literal('stem'),
        z.literal('source'),
      ]),
    })
    .passthrough();

  const pointerTemplateSchema = z
    .object({
      base: z.unknown().optional(),
      segments: z.array(z.union([z.string(), pointerPlaceholderSchema])),
    })
    .passthrough();

  const baseSourceSchema = z
    .object({
      id: z.string(),
      layer: z.string(),
      pointerTemplate: pointerTemplateSchema,
      context: optionsRecordSchema.optional(),
    })
    .passthrough();

  const fileSourceSchema = baseSourceSchema
    .extend({
      kind: z.literal('file'),
      patterns: z.array(z.string()),
      ignore: z.array(z.string()).optional(),
      rootDir: z.string().optional(),
    })
    .transform((source) => {
      const root = source.rootDir ?? '.';
      const resolvedRoot = path.isAbsolute(root) ? root : path.resolve(configDirectory, root);
      const { ignore, ...rest } = source;
      return {
        ...rest,
        rootDir: resolvedRoot,
        ...(ignore === undefined ? {} : { ignore }),
      };
    });

  const virtualSourceSchema = baseSourceSchema
    .extend({
      kind: z.literal('virtual'),
      document: z.unknown(),
    })
    .passthrough();

  const sourceSchema = z.union([fileSourceSchema, virtualSourceSchema]);

  const layerSchema = z
    .object({
      name: z.string(),
      context: optionsRecordSchema.optional(),
    })
    .passthrough();

  return z
    .object({
      layers: z.array(layerSchema).min(1),
      sources: z.array(sourceSchema).min(1),
      transforms: transformsSchema.optional(),
      formatters: formatterSchema.optional(),
      audit: auditSchema.optional(),
      dependencies: dependencySchema.optional(),
    })
    .passthrough() as unknown as z.ZodType<BuildConfig>;
}

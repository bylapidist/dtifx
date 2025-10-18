import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { JsonPointer } from '@lapidist/dtif-parser';
import { z } from 'zod';

import { PolicyEngine, type PolicyRule } from '../engine/index.js';
import {
  createDeprecationReplacementPolicy,
  createRequireOwnerPolicy,
  createRequireOverrideApprovalPolicy,
  createRequireTagPolicy,
  createWcagContrastPolicy,
} from '../definitions/default-policies.js';

export interface PolicyConfigEntry {
  readonly name: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface PolicyPluginModuleConfig {
  readonly module: string;
  readonly register?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

export type PolicyPluginConfigEntry = string | PolicyPluginModuleConfig;

export interface AuditConfig {
  readonly policies: readonly PolicyConfigEntry[];
  readonly plugins?: readonly PolicyPluginConfigEntry[];
}

/**
 * Represents configuration objects that expose audit settings.
 */
export interface AuditConfigurationSource<TConfig extends AuditConfig = AuditConfig> {
  readonly audit?: TConfig;
}

export type PolicyConfigurationSource<TConfig extends AuditConfig = AuditConfig> =
  AuditConfigurationSource<TConfig>;

/**
 * Additional metadata supplied to policy factory functions when constructing rules.
 */
export interface PolicyRuleFactoryContext<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
> {
  readonly config?: TConfig;
  readonly configDirectory?: string;
  readonly configPath?: string;
}

/**
 * Factory responsible for constructing policy rules from configuration entries.
 */
export interface PolicyRuleFactory<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
> {
  readonly name: string;
  create(
    entry: PolicyConfigEntry,
    context: PolicyRuleFactoryContext<TConfig>,
  ): readonly PolicyRule[];
}

/**
 * Registry that resolves policy rule factories by name.
 */
export class PolicyRuleFactoryRegistry<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
> {
  private readonly factories = new Map<string, PolicyRuleFactory<TConfig>>();

  constructor(initial: readonly PolicyRuleFactory<TConfig>[] = []) {
    for (const factory of initial) {
      this.register(factory);
    }
  }

  /**
   * Registers a new factory in the registry.
   * @param {PolicyRuleFactory} factory - Factory to register.
   */
  register(factory: PolicyRuleFactory<TConfig>): void {
    this.factories.set(factory.name, factory);
  }

  /**
   * Looks up a factory by policy name.
   * @param {string} name - Name of the policy rule factory to resolve.
   * @returns {PolicyRuleFactory | undefined} The registered factory if present.
   */
  resolve(name: string): PolicyRuleFactory<TConfig> | undefined {
    return this.factories.get(name);
  }

  /**
   * Lists all factories registered in the registry.
   * @returns {readonly PolicyRuleFactory[]} Registered factories.
   */
  list(): readonly PolicyRuleFactory<TConfig>[] {
    return [...this.factories.values()];
  }
}

/**
 * Creates a registry seeded with the framework's default policy factories.
 * @returns {PolicyRuleFactoryRegistry} Registry containing default factories.
 */
export function createDefaultPolicyRuleRegistry<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
>(): PolicyRuleFactoryRegistry<TConfig> {
  return new PolicyRuleFactoryRegistry<TConfig>(createDefaultPolicyFactories<TConfig>());
}

/**
 * Overrides for {@link createPolicyConfiguration} allowing custom rule collections and rule factories.
 */
export interface PolicyConfigurationOverrides<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
> {
  readonly rules?: readonly PolicyRule[];
  readonly engine?: PolicyEngine;
  readonly ruleRegistry?: PolicyRuleFactoryRegistry<TConfig>;
  readonly ruleFactoryContext?: PolicyRuleFactoryContext<TConfig>;
  readonly entries?: readonly PolicyConfigEntry[];
}

/**
 * Result produced when configuring policies for a build.
 */
export interface PolicyConfigurationResult {
  readonly rules: readonly PolicyRule[];
  readonly engine: PolicyEngine;
}

/**
 * Creates the policy rule set and engine based on audit-aware configuration sources and overrides.
 * @param {AuditConfigurationSource} config - Configuration object providing audit settings.
 * @param {PolicyConfigurationOverrides} [overrides] - Optional overrides for rule construction and factory context.
 * @returns {PolicyConfigurationResult} The constructed rules and engine.
 */
export function createPolicyConfiguration<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
>(
  config: TConfig,
  overrides: PolicyConfigurationOverrides<TConfig> = {},
): PolicyConfigurationResult {
  let rules: readonly PolicyRule[];

  if (overrides.rules) {
    rules = overrides.rules;
  } else {
    const ruleRegistry = overrides.ruleRegistry ?? createDefaultPolicyRuleRegistry<TConfig>();
    const entries = overrides.entries ?? resolveConfiguredPolicyEntries(config);
    rules = createPolicyRules(
      entries,
      ruleRegistry,
      overrides.ruleFactoryContext ? { config, ...overrides.ruleFactoryContext } : { config },
    );
  }

  const engine = overrides.engine ?? new PolicyEngine({ rules });
  return { rules, engine } satisfies PolicyConfigurationResult;
}

function resolveConfiguredPolicyEntries<TConfig extends AuditConfigurationSource>(
  config: TConfig,
): readonly PolicyConfigEntry[] {
  const audit = resolveAuditConfig(config);
  if (audit === undefined) {
    return [];
  }
  const policies = (audit as { policies?: unknown }).policies;
  if (!Array.isArray(policies)) {
    throw new TypeError('Configuration "audit.policies" field must be an array when provided.');
  }
  return policies as readonly PolicyConfigEntry[];
}

function resolveConfiguredPolicyPlugins<TConfig extends AuditConfigurationSource>(
  config: TConfig,
): readonly PolicyPluginConfigEntry[] {
  const audit = resolveAuditConfig(config);
  if (audit === undefined) {
    return [];
  }
  const plugins = (audit as { plugins?: unknown }).plugins;
  if (plugins === undefined) {
    return [];
  }
  if (!Array.isArray(plugins)) {
    throw new TypeError('Configuration "audit.plugins" field must be an array when provided.');
  }
  return plugins as readonly PolicyPluginConfigEntry[];
}

function resolveAuditConfig<TConfig extends AuditConfigurationSource>(
  config: TConfig,
): AuditConfig | undefined {
  const audit = config.audit;
  if (audit === undefined) {
    return undefined;
  }
  if (audit === null || typeof audit !== 'object') {
    throw new TypeError('Configuration "audit" field must be an object when provided.');
  }
  return audit as AuditConfig;
}

/**
 * Converts policy configuration entries into executable rule installers.
 * @param {ReadonlyArray<PolicyConfigEntry> | undefined} entries - Raw policy configuration entries.
 * @param {PolicyRuleFactoryRegistry} registry - Factory registry used to resolve policy implementations.
 * @param {PolicyRuleFactoryContext} context - Additional context supplied to each factory.
 * @returns {readonly PolicyRule[]} The list of policy rules ready for registration.
 */
export function createPolicyRules<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
>(
  entries: readonly PolicyConfigEntry[] | undefined,
  registry: PolicyRuleFactoryRegistry<TConfig> = createDefaultPolicyRuleRegistry<TConfig>(),
  context: PolicyRuleFactoryContext<TConfig> = {},
): readonly PolicyRule[] {
  if (entries === undefined || entries.length === 0) {
    return [];
  }

  const rules: PolicyRule[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.name)) {
      throw new Error(`Duplicate policy configuration for "${entry.name}".`);
    }

    seen.add(entry.name);
    const factory = registry.resolve(entry.name);

    if (factory === undefined) {
      throw new Error(`Unknown policy "${entry.name}" in configuration.`);
    }

    const createdRules = factory.create(normalisePolicyEntry(entry, context), context);

    for (const rule of createdRules) {
      rules.push(rule);
    }
  }

  return rules;
}

/**
 * Context provided to policy plugin registration callbacks.
 */
export interface PolicyPluginContext<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
> {
  readonly registry: PolicyRuleFactoryRegistry<TConfig>;
  readonly config: TConfig;
  readonly configDirectory: string;
  readonly configPath: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Function signature expected from policy plugin modules.
 * @param {PolicyPluginContext} context - Plugin registration context.
 * @returns {void | Promise<void>} A promise that resolves when registration completes.
 */
export type PolicyPlugin<TConfig extends AuditConfigurationSource = AuditConfigurationSource> = (
  context: PolicyPluginContext<TConfig>,
) => void | Promise<void>;

/**
 * Shape of modules that may register policy plugins.
 */
export interface PolicyPluginModule {
  readonly default?: unknown;
  readonly registerPolicies?: unknown;
  [exportName: string]: unknown;
}

/**
 * Function that imports a policy plugin module given its specifier.
 * @param {string} specifier - Module specifier to load.
 * @returns {Promise<PolicyPluginModule>} Promise resolving to the imported module.
 */
export type PolicyPluginImporter = (specifier: string) => Promise<PolicyPluginModule>;

/**
 * Options controlling how policy rule registries are loaded, including plugin support.
 */
export interface LoadPolicyRuleRegistryOptions<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
> {
  readonly config: TConfig;
  readonly configDirectory: string;
  readonly configPath: string;
  readonly plugins?: readonly PolicyPluginConfigEntry[];
  readonly registry?: PolicyRuleFactoryRegistry<TConfig>;
  readonly importModule?: PolicyPluginImporter;
}

/**
 * Loads the policy rule registry, applying configuration entries and optional plugins.
 * @param {LoadPolicyRuleRegistryOptions} options - Configuration and overrides for registry loading.
 * @returns {Promise<PolicyRuleFactoryRegistry>} The populated policy rule factory registry.
 */
export async function loadPolicyRuleRegistry<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
>(options: LoadPolicyRuleRegistryOptions<TConfig>): Promise<PolicyRuleFactoryRegistry<TConfig>> {
  const registry = options.registry ?? createDefaultPolicyRuleRegistry<TConfig>();
  const entries = options.plugins ?? resolveConfiguredPolicyPlugins(options.config);

  if (entries.length === 0) {
    return registry;
  }

  const importModule = options.importModule ?? defaultPolicyPluginImporter;
  for (const entry of entries) {
    const result = POLICY_PLUGIN_CONFIG_SCHEMA.safeParse(entry);
    if (!result.success) {
      throw new TypeError(
        `Failed to parse policy plugin configuration: ${formatZodIssues(result.error.issues)}`,
      );
    }
    const normalised = result.data;
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

/**
 * Provides the set of built-in policy factories shipped with the build system.
 * @returns {readonly PolicyRuleFactory[]} Built-in policy rule factories.
 */

const POLICY_SEVERITY_SCHEMA = z.enum(['error', 'warning', 'info']);

type RequireOwnerPolicyOptions = Parameters<typeof createRequireOwnerPolicy>[0];
type DeprecationReplacementPolicyOptions = Parameters<typeof createDeprecationReplacementPolicy>[0];
type RequireTagPolicyOptions = Parameters<typeof createRequireTagPolicy>[0];
type RequireOverrideApprovalPolicyOptions = Parameters<
  typeof createRequireOverrideApprovalPolicy
>[0];
type WcagContrastPolicyOptions = Parameters<typeof createWcagContrastPolicy>[0];

const REQUIRE_OWNER_OPTIONS_BASE_SCHEMA = z
  .object({
    extension: z.string().optional(),
    field: z.string().optional(),
    message: z.string().optional(),
    severity: POLICY_SEVERITY_SCHEMA.optional(),
  })
  .strict();

type RequireOwnerOptionsInput = z.input<typeof REQUIRE_OWNER_OPTIONS_BASE_SCHEMA>;

const REQUIRE_OWNER_OPTIONS_SCHEMA =
  REQUIRE_OWNER_OPTIONS_BASE_SCHEMA.transform<RequireOwnerPolicyOptions>(
    (value: RequireOwnerOptionsInput) => ({
      extensionKey: value.extension ?? 'net.lapidist.governance',
      field: value.field ?? 'owner',
      severity: value.severity ?? 'error',
      ...(value.message ? { message: value.message } : {}),
    }),
  );

const DEPRECATION_REPLACEMENT_OPTIONS_BASE_SCHEMA = z
  .object({
    message: z.string().optional(),
    severity: POLICY_SEVERITY_SCHEMA.optional(),
  })
  .strict();

type DeprecationReplacementOptionsInput = z.input<
  typeof DEPRECATION_REPLACEMENT_OPTIONS_BASE_SCHEMA
>;

const DEPRECATION_REPLACEMENT_OPTIONS_SCHEMA =
  DEPRECATION_REPLACEMENT_OPTIONS_BASE_SCHEMA.transform<DeprecationReplacementPolicyOptions>(
    (value: DeprecationReplacementOptionsInput) => ({
      severity: value.severity ?? 'error',
      ...(value.message ? { message: value.message } : {}),
    }),
  );

const REQUIRE_TAG_OPTIONS_BASE_SCHEMA = z
  .object({
    tag: z.string().optional(),
    tags: z
      .array(z.string())
      .nonempty({
        message: 'Policy "governance.requireTag" requires at least one tag via the "tags" option.',
      })
      .optional(),
    message: z.string().optional(),
    severity: POLICY_SEVERITY_SCHEMA.optional(),
  })
  .strict();

type RequireTagOptionsInput = z.input<typeof REQUIRE_TAG_OPTIONS_BASE_SCHEMA>;

const REQUIRE_TAG_OPTIONS_SCHEMA = REQUIRE_TAG_OPTIONS_BASE_SCHEMA.superRefine(
  (value: RequireTagOptionsInput, ctx: z.RefinementCtx) => {
    if (value.tag !== undefined || value.tags !== undefined) {
      return;
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Policy "governance.requireTag" requires a "tag" or "tags" option to be provided.',
    });
  },
).transform<RequireTagPolicyOptions>((value: RequireTagOptionsInput) => {
  const resolvedTags = value.tags ?? (value.tag ? [value.tag] : []);
  const uniqueTags = [...new Set(resolvedTags)] as string[];
  const normalised: RequireTagPolicyOptions = {
    tags: uniqueTags,
    severity: value.severity ?? 'error',
    ...(value.message ? { message: value.message } : {}),
  };
  return normalised;
});

const REQUIRE_OVERRIDE_CONTEXT_SCHEMA = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .refine((record) => Object.keys(record).length > 0, {
    message:
      'Policy "governance.requireOverrideApproval" context filters must include at least one key/value pair.',
  });

const REQUIRE_OVERRIDE_APPROVAL_OPTIONS_BASE_SCHEMA = z
  .object({
    layers: z
      .array(z.string())
      .nonempty({
        message:
          'Policy "governance.requireOverrideApproval" requires at least one layer via the "layers" option.',
      })
      .optional(),
    layer: z.string().optional(),
    extension: z.string().optional(),
    field: z.string().optional(),
    minimumApprovals: z
      .number()
      .superRefine((value: number, ctx: z.RefinementCtx) => {
        if (Number.isInteger(value) && value >= 0) {
          return;
        }
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Policy "governance.requireOverrideApproval" option "minimumApprovals" must be a positive integer.',
        });
      })
      .optional(),
    message: z.string().optional(),
    severity: POLICY_SEVERITY_SCHEMA.optional(),
    context: REQUIRE_OVERRIDE_CONTEXT_SCHEMA.optional(),
  })
  .strict();

type RequireOverrideApprovalOptionsInput = z.input<
  typeof REQUIRE_OVERRIDE_APPROVAL_OPTIONS_BASE_SCHEMA
>;

const REQUIRE_OVERRIDE_APPROVAL_OPTIONS_SCHEMA =
  REQUIRE_OVERRIDE_APPROVAL_OPTIONS_BASE_SCHEMA.superRefine(
    (value: RequireOverrideApprovalOptionsInput, ctx: z.RefinementCtx) => {
      if (value.layers !== undefined || value.layer !== undefined) {
        return;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Policy "governance.requireOverrideApproval" requires at least one layer via "layer" or "layers" option.',
      });
    },
  ).transform<RequireOverrideApprovalPolicyOptions>(
    (value: RequireOverrideApprovalOptionsInput) => {
      const resolvedLayers = value.layers ?? (value.layer ? [value.layer] : []);
      const dedupedLayers = [...new Set(resolvedLayers)] as string[];
      const normalised: RequireOverrideApprovalPolicyOptions = {
        layers: dedupedLayers,
        severity: value.severity ?? 'error',
        ...(value.extension ? { extensionKey: value.extension } : {}),
        ...(value.field ? { field: value.field } : {}),
        ...(value.minimumApprovals === undefined
          ? {}
          : { minimumApprovals: value.minimumApprovals }),
        ...(value.message ? { message: value.message } : {}),
        ...(value.context
          ? { context: value.context as Readonly<Record<string, string | number | boolean>> }
          : {}),
      };
      return normalised;
    },
  );

const WCAG_CONTRAST_PAIR_SCHEMA = z
  .object({
    foreground: z.string(),
    background: z.string(),
    minimum: z.number().optional(),
    label: z.string().optional(),
  })
  .strict();

interface WcagContrastOptionsSchemaResult {
  readonly severity: WcagContrastPolicyOptions['severity'];
  readonly pairs: readonly z.output<typeof WCAG_CONTRAST_PAIR_SCHEMA>[];
  readonly minimum?: number;
  readonly message?: string;
}

const WCAG_CONTRAST_OPTIONS_BASE_SCHEMA = z
  .object({
    pairs: z.array(WCAG_CONTRAST_PAIR_SCHEMA).nonempty({
      message:
        'Policy "governance.wcagContrast" pairs option must include at least one foreground/background pair.',
    }),
    minimum: z.number().optional(),
    message: z.string().optional(),
    severity: POLICY_SEVERITY_SCHEMA.optional(),
  })
  .strict();

type WcagContrastOptionsInput = z.input<typeof WCAG_CONTRAST_OPTIONS_BASE_SCHEMA>;

const WCAG_CONTRAST_OPTIONS_SCHEMA =
  WCAG_CONTRAST_OPTIONS_BASE_SCHEMA.transform<WcagContrastOptionsSchemaResult>(
    (value: WcagContrastOptionsInput) => ({
      severity: value.severity ?? 'error',
      pairs: value.pairs,
      ...(value.minimum === undefined ? {} : { minimum: value.minimum }),
      ...(value.message ? { message: value.message } : {}),
    }),
  );

const POLICY_PLUGIN_OPTIONS_SCHEMA = z.object({}).catchall(z.unknown()).passthrough();

interface NormalisedPolicyPluginConfig {
  readonly module: string;
  readonly register?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

const POLICY_PLUGIN_OBJECT_SCHEMA = z
  .object({
    module: z.string().refine((value: string) => value.trim().length > 0, {
      message: 'Policy plugin objects must include a non-empty "module" string.',
    }),
    register: z
      .string()
      .transform((value: string) => value.trim())
      .refine((value: string) => value.length > 0, {
        message: 'Policy plugin "register" field must be a non-empty string when provided.',
      })
      .optional(),
    options: POLICY_PLUGIN_OPTIONS_SCHEMA.optional(),
  })
  .strict();

const POLICY_PLUGIN_CONFIG_SCHEMA = z.union([
  z
    .string()
    .refine((value: string) => value.trim().length > 0, {
      message: 'Policy plugin specifiers must be non-empty strings.',
    })
    .transform<NormalisedPolicyPluginConfig>((module: string) => ({ module })),
  POLICY_PLUGIN_OBJECT_SCHEMA.transform<NormalisedPolicyPluginConfig>((value) => ({
    module: value.module,
    ...(value.register ? { register: value.register } : {}),
    ...(value.options ? { options: value.options as Readonly<Record<string, unknown>> } : {}),
  })),
]);

interface PolicyEntryNormaliserEntry {
  schema: z.ZodTypeAny;
  requireOptionsMessage?: string;
  mapOptions: (
    parsed: unknown,
    entry: PolicyConfigEntry,
    context: PolicyRuleFactoryContext,
  ) => Readonly<Record<string, unknown>>;
}

function asPolicyOptionsRecord<TOptions>(options: TOptions): Readonly<Record<string, unknown>> {
  return options as unknown as Readonly<Record<string, unknown>>;
}

function createPolicyEntryNormaliser(
  schema: z.ZodTypeAny,
  mapOptions: (
    parsed: unknown,
    entry: PolicyConfigEntry,
    context: PolicyRuleFactoryContext,
  ) => Readonly<Record<string, unknown>>,
  requireOptionsMessage?: string,
): PolicyEntryNormaliserEntry {
  const entry: PolicyEntryNormaliserEntry = {
    schema,
    mapOptions: mapOptions as PolicyEntryNormaliserEntry['mapOptions'],
  };
  if (requireOptionsMessage !== undefined) {
    entry.requireOptionsMessage = requireOptionsMessage;
  }
  return entry;
}

const POLICY_ENTRY_NORMALISERS: Record<string, PolicyEntryNormaliserEntry> = {
  'governance.requireOwner': createPolicyEntryNormaliser(REQUIRE_OWNER_OPTIONS_SCHEMA, (options) =>
    asPolicyOptionsRecord(options as RequireOwnerPolicyOptions),
  ),
  'governance.deprecationHasReplacement': createPolicyEntryNormaliser(
    DEPRECATION_REPLACEMENT_OPTIONS_SCHEMA,
    (options) => asPolicyOptionsRecord(options as DeprecationReplacementPolicyOptions),
  ),
  'governance.requireTag': createPolicyEntryNormaliser(REQUIRE_TAG_OPTIONS_SCHEMA, (options) =>
    asPolicyOptionsRecord(options as RequireTagPolicyOptions),
  ),
  'governance.requireOverrideApproval': createPolicyEntryNormaliser(
    REQUIRE_OVERRIDE_APPROVAL_OPTIONS_SCHEMA,
    (options) => asPolicyOptionsRecord(options as RequireOverrideApprovalPolicyOptions),
    'Policy "governance.requireOverrideApproval" requires configuration for layers and approvals.',
  ),
  'governance.wcagContrast': createPolicyEntryNormaliser(
    WCAG_CONTRAST_OPTIONS_SCHEMA,
    (options, entry, context) => {
      const typedOptions = options as WcagContrastOptionsSchemaResult;
      const resolvedPairs = typedOptions.pairs.map(
        (pair: z.output<typeof WCAG_CONTRAST_PAIR_SCHEMA>, index: number) => ({
          foreground: normalisePolicyPointer(
            pair.foreground,
            entry.name,
            `pairs[${index.toString(10)}].foreground`,
            context,
          ),
          background: normalisePolicyPointer(
            pair.background,
            entry.name,
            `pairs[${index.toString(10)}].background`,
            context,
          ),
          ...(pair.minimum === undefined ? {} : { minimum: pair.minimum }),
          ...(pair.label ? { label: pair.label } : {}),
        }),
      );
      const normalised: WcagContrastPolicyOptions = {
        severity: typedOptions.severity,
        pairs: resolvedPairs,
        ...(typedOptions.minimum === undefined ? {} : { minimum: typedOptions.minimum }),
        ...(typedOptions.message ? { message: typedOptions.message } : {}),
      };
      return asPolicyOptionsRecord(normalised);
    },
    'Policy "governance.wcagContrast" requires a "pairs" option defining foreground/background combinations.',
  ),
};

function normalisePolicyEntry(
  entry: PolicyConfigEntry,
  context: PolicyRuleFactoryContext,
): PolicyConfigEntry {
  const normaliser = POLICY_ENTRY_NORMALISERS[entry.name];
  if (normaliser === undefined) {
    return entry;
  }
  if (normaliser.requireOptionsMessage !== undefined && entry.options === undefined) {
    throw new TypeError(normaliser.requireOptionsMessage);
  }
  const result = normaliser.schema.safeParse(entry.options ?? {});
  if (!result.success) {
    throw createPolicyOptionsError(entry.name, result.error);
  }
  const options = normaliser.mapOptions(result.data, entry, context);
  return {
    ...entry,
    options,
  } satisfies PolicyConfigEntry;
}

function createDefaultPolicyFactories<
  TConfig extends AuditConfigurationSource = AuditConfigurationSource,
>(): readonly PolicyRuleFactory<TConfig>[] {
  return [
    {
      name: 'governance.requireOwner',
      create: (entry) => [
        createRequireOwnerPolicy(expectNormalisedPolicyOptions<RequireOwnerPolicyOptions>(entry)),
      ],
    },
    {
      name: 'governance.deprecationHasReplacement',
      create: (entry) => [
        createDeprecationReplacementPolicy(
          expectNormalisedPolicyOptions<DeprecationReplacementPolicyOptions>(entry),
        ),
      ],
    },
    {
      name: 'governance.requireTag',
      create: (entry) => [
        createRequireTagPolicy(expectNormalisedPolicyOptions<RequireTagPolicyOptions>(entry)),
      ],
    },
    {
      name: 'governance.requireOverrideApproval',
      create: (entry) => [
        createRequireOverrideApprovalPolicy(
          expectNormalisedPolicyOptions<RequireOverrideApprovalPolicyOptions>(entry),
        ),
      ],
    },
    {
      name: 'governance.wcagContrast',
      create: (entry) => [
        createWcagContrastPolicy(expectNormalisedPolicyOptions<WcagContrastPolicyOptions>(entry)),
      ],
    },
  ] satisfies readonly PolicyRuleFactory<TConfig>[];
}

function expectNormalisedPolicyOptions<TOptions>(entry: PolicyConfigEntry): TOptions {
  if (entry.options === undefined) {
    throw new TypeError(
      `Policy "${entry.name}" options must be normalized before invoking the rule factory.`,
    );
  }
  return entry.options as TOptions;
}

function createPolicyOptionsError(policyName: string, error: z.ZodError): TypeError {
  const formatted = formatZodIssues(error.issues);
  return new TypeError(`Failed to parse options for policy "${policyName}": ${formatted}`);
}

function formatZodIssues(issues: readonly z.ZodIssue[]): string {
  return flattenZodIssues(issues)
    .map(({ message, path }) => {
      const formattedPath = formatZodIssuePath(path);
      return formattedPath.length > 0 ? `${formattedPath}: ${message}` : message;
    })
    .join('; ');
}

interface ZodErrorLike {
  readonly issues: readonly z.ZodIssue[];
}

function isZodErrorLikeArray(value: unknown): value is readonly ZodErrorLike[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => entry !== null && typeof entry === 'object' && 'issues' in entry)
  );
}

function flattenZodIssues(
  issues: readonly z.ZodIssue[],
): readonly Pick<z.ZodIssue, 'message' | 'path'>[] {
  const collected: Pick<z.ZodIssue, 'message' | 'path'>[] = [];
  for (const issue of issues) {
    const withErrors = issue as z.ZodIssue & { errors?: unknown; unionErrors?: unknown };
    if (Array.isArray(withErrors.errors)) {
      for (const nested of withErrors.errors) {
        collected.push(...flattenZodIssues(nested as readonly z.ZodIssue[]));
      }
      continue;
    }
    if (isZodErrorLikeArray(withErrors.unionErrors)) {
      for (const error of withErrors.unionErrors) {
        collected.push(...flattenZodIssues(error.issues));
      }
      continue;
    }
    collected.push({ message: issue.message, path: issue.path });
  }
  return collected;
}

function formatZodIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return '';
  }
  let formatted = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      formatted += `[${segment.toString(10)}]`;
    } else {
      const key = typeof segment === 'string' ? segment : segment.toString();
      if (formatted.length > 0) {
        formatted += '.';
      }
      formatted += key;
    }
  }
  return formatted;
}

function normalisePolicyPointer(
  value: string,
  policyName: string,
  option: string,
  context: PolicyRuleFactoryContext,
): JsonPointer {
  if (value.startsWith('/') || value.startsWith('#')) {
    return value as JsonPointer;
  }
  const directory = context.configDirectory;
  if (directory === undefined || directory.length === 0) {
    throw new TypeError(
      `Policy "${policyName}" option "${option}" must be an absolute pointer or the configuration directory must be provided.`,
    );
  }
  const hashIndex = value.indexOf('#');
  const pathSegment = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : value.slice(hashIndex);
  const resolved = path.resolve(directory, pathSegment);
  const url = pathToFileURL(resolved).href;
  return `${url}${fragment}` as JsonPointer;
}

/**
 * Resolves a plugin module specifier relative to the configuration directory when necessary.
 * @param {string} module - Module specifier from configuration.
 * @param {string} directory - Configuration directory used for relative resolution.
 * @returns {string} The resolved module specifier.
 */
function resolvePluginModuleSpecifier(module: string, directory: string): string {
  if (module.startsWith('file:')) {
    return module;
  }
  if (module.startsWith('.')) {
    const resolved = path.resolve(directory, module);
    return pathToFileURL(resolved).href;
  }
  if (path.isAbsolute(module) || path.win32.isAbsolute(module)) {
    return pathToFileURL(module).href;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(module)) {
    throw new TypeError(
      `Policy plugin module specifiers must be bare package names or filesystem paths. Received "${module}".`,
    );
  }
  return module;
}

/**
 * Determines the callable export that registers policies from the given module.
 * @param {PolicyPluginModule} module - Imported plugin module.
 * @param {NormalisedPolicyPluginConfig} entry - Normalised plugin configuration entry.
 * @param {string} specifier - Resolved module specifier used for error messaging.
 * @returns {PolicyPlugin} The plugin function to invoke.
 */
function resolvePluginExport(
  module: PolicyPluginModule,
  entry: NormalisedPolicyPluginConfig,
  specifier: string,
): PolicyPlugin {
  if (entry.register) {
    const exportValue = module[entry.register];
    if (typeof exportValue !== 'function') {
      throw new TypeError(
        `Policy plugin module "${specifier}" does not export "${entry.register}" as a function.`,
      );
    }
    return exportValue as PolicyPlugin;
  }
  if (typeof module.registerPolicies === 'function') {
    return module.registerPolicies as PolicyPlugin;
  }
  if (typeof module.default === 'function') {
    return module.default as PolicyPlugin;
  }
  throw new TypeError(
    `Policy plugin module "${specifier}" must export a default or registerPolicies function.`,
  );
}

/**
 * Default implementation of the policy plugin importer that uses dynamic {@link import}.
 * @param {string} specifier - Module specifier to import.
 * @returns {Promise<PolicyPluginModule>} Promise resolving to the plugin module.
 */
async function defaultPolicyPluginImporter(specifier: string): Promise<PolicyPluginModule> {
  return import(specifier) as Promise<PolicyPluginModule>;
}

import type { AuditConfig } from '@dtifx/core/policy/configuration';
import type { TokenLayerConfig, TokenSourceConfig } from '@dtifx/core/sources';

export { placeholder, pointerTemplate } from '@dtifx/core/sources';
export type {
  PointerPlaceholderName,
  PointerPlaceholder,
  PointerTemplateSegment,
  PointerTemplate,
  TokenLayerConfig as LayerConfig,
  BaseTokenSourceConfig as BaseSourceConfig,
  FileGlobTokenSourceConfig as FileGlobSourceConfig,
  VirtualTokenSourceConfig as VirtualSourceConfig,
  TokenSourceConfig as SourceConfig,
  PlannedTokenSource as PlannedSource,
  TokenSourcePlan as SourcePlan,
} from '@dtifx/core/sources';

type LayerConfig = TokenLayerConfig;
type SourceConfig = TokenSourceConfig;

/**
 * Top-level configuration consumed by the build runtime.
 */
export interface BuildConfig {
  readonly layers: readonly LayerConfig[];
  readonly sources: readonly SourceConfig[];
  readonly transforms?: TransformConfig;
  readonly formatters?: FormatterConfig;
  readonly audit?: AuditConfig;
  readonly dependencies?: DependencyConfig;
}

/**
 * Configuration for a single transform execution entry.
 */
export interface TransformConfigEntry {
  readonly name: string;
  readonly group?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Configuration describing a transform plugin module registration.
 */
export interface TransformPluginModuleConfig {
  readonly module: string;
  readonly register?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Union describing allowed transform plugin entries.
 */
export type TransformPluginConfigEntry = string | TransformPluginModuleConfig;

/**
 * Overall transform configuration for a build.
 */
export interface TransformConfig {
  readonly entries?: readonly TransformConfigEntry[];
  readonly plugins?: readonly TransformPluginConfigEntry[];
}

/**
 * Description of a dependency evaluation strategy.
 */
export interface DependencyStrategyConfig {
  readonly name: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

export type {
  AuditConfig,
  PolicyConfigEntry,
  PolicyPluginConfigEntry,
  PolicyPluginModuleConfig,
} from '@dtifx/core/policy/configuration';

/**
 * Configuration describing a dependency strategy plugin module registration.
 */
export interface DependencyStrategyPluginModuleConfig {
  readonly module: string;
  readonly register?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Union describing allowed dependency strategy plugin entries.
 */
export type DependencyStrategyPluginConfigEntry = string | DependencyStrategyPluginModuleConfig;

/**
 * Dependency subsystem configuration.
 */
export interface DependencyConfig {
  readonly strategy?: DependencyStrategyConfig;
  readonly plugins?: readonly DependencyStrategyPluginConfigEntry[];
}

/**
 * Output configuration for formatter artifacts.
 */
export interface FormatterOutputConfig {
  readonly directory?: string;
}

/**
 * Instance-level configuration for a formatter run.
 */
export interface FormatterInstanceConfig {
  readonly id?: string;
  readonly name: string;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly output: FormatterOutputConfig;
}

/**
 * Configuration describing a formatter plugin module registration.
 */
export interface FormatterPluginModuleConfig {
  readonly module: string;
  readonly register?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Union describing allowed formatter plugin entries.
 */
export type FormatterPluginConfigEntry = string | FormatterPluginModuleConfig;

/**
 * Formatter subsystem configuration.
 */
export type FormatterConfig =
  | readonly FormatterInstanceConfig[]
  | {
      readonly entries?: readonly FormatterInstanceConfig[];
      readonly plugins?: readonly FormatterPluginConfigEntry[];
    };

/**
 * Helper that preserves {@link BuildConfig} typing in configuration modules.
 *
 * @param config - The user-authored build configuration object.
 * @returns The provided configuration object typed as a {@link BuildConfig}.
 */
export function defineConfig(config: BuildConfig): BuildConfig {
  return config;
}

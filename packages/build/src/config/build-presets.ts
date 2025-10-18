import type { BuildConfig, FormatterInstanceConfig, TransformConfigEntry } from './index.js';
import type {
  AndroidComposeFormatterPresetOptions,
  AndroidMaterialFormatterPresetOptions,
  CssFormatterPresetOptions,
  IosSwiftUiFormatterPresetOptions,
} from './formatter-presets.js';
import {
  createAndroidComposeFormatterPreset,
  createAndroidMaterialFormatterPreset,
  createCssFormatterPreset,
  createIosSwiftUiFormatterPreset,
} from './formatter-presets.js';
import type {
  AndroidComposeTransformPresetOptions,
  AndroidMaterialTransformPresetOptions,
  CssTransformPresetOptions,
  IosSwiftUiTransformPresetOptions,
} from './transform-presets.js';
import {
  createAndroidComposeTransformPreset,
  createAndroidMaterialTransformPreset,
  createCssTransformPreset,
  createIosSwiftUiTransformPreset,
} from './transform-presets.js';

interface BuildPresetContribution {
  readonly transforms: readonly TransformConfigEntry[];
  readonly formatters: readonly FormatterInstanceConfig[];
}

function cloneTransformEntries(
  entries: readonly TransformConfigEntry[],
): readonly TransformConfigEntry[] {
  return entries.map(
    (entry) =>
      ({
        name: entry.name,
        ...(entry.group === undefined ? undefined : { group: entry.group }),
        ...(entry.options === undefined ? undefined : { options: { ...entry.options } }),
      }) satisfies TransformConfigEntry,
  );
}

function cloneFormatterInstances(
  instances: readonly FormatterInstanceConfig[],
): readonly FormatterInstanceConfig[] {
  return instances.map(
    (instance) =>
      ({
        ...(instance.id === undefined ? undefined : { id: instance.id }),
        name: instance.name,
        ...(instance.options === undefined ? undefined : { options: { ...instance.options } }),
        output: instance.output === undefined ? {} : { ...instance.output },
      }) satisfies FormatterInstanceConfig,
  );
}

function mergeContributions(
  contributions: readonly BuildPresetContribution[],
): BuildPresetContribution {
  return {
    transforms: contributions.flatMap((contribution) => contribution.transforms),
    formatters: contributions.flatMap((contribution) => contribution.formatters),
  } satisfies BuildPresetContribution;
}

function materialiseBuildPreset(
  contribution: BuildPresetContribution,
): Pick<BuildConfig, 'transforms' | 'formatters'> {
  const transforms =
    contribution.transforms.length === 0
      ? undefined
      : { entries: cloneTransformEntries(contribution.transforms) };
  const formatters =
    contribution.formatters.length === 0
      ? undefined
      : cloneFormatterInstances(contribution.formatters);
  return {
    ...(transforms === undefined ? undefined : { transforms }),
    ...(formatters === undefined ? undefined : { formatters }),
  } satisfies Pick<BuildConfig, 'transforms' | 'formatters'>;
}

function resolveTransformPreset<TOptions>(
  overrides: TOptions | false | undefined,
  factory: (options?: TOptions) => readonly TransformConfigEntry[],
): readonly TransformConfigEntry[] {
  if (overrides === false) {
    return [];
  }
  return [...factory(overrides)];
}

function resolveFormatterPreset<TOptions>(
  overrides: TOptions | false | undefined,
  factory: (options?: TOptions) => readonly FormatterInstanceConfig[],
): readonly FormatterInstanceConfig[] {
  if (overrides === false) {
    return [];
  }
  return [...factory(overrides)];
}

export interface CssBuildPresetOptions {
  readonly transforms?: CssTransformPresetOptions | false;
  readonly formatters?: CssFormatterPresetOptions | false;
}

/**
 * Generates build configuration entries covering CSS transforms and formatters.
 *
 * @param {CssBuildPresetOptions} options - Optional overrides for the CSS build preset.
 * @returns {Pick<BuildConfig, 'transforms' | 'formatters'>} Build configuration targeting CSS outputs.
 */
export function createCssBuildPreset(
  options: CssBuildPresetOptions = {},
): Pick<BuildConfig, 'transforms' | 'formatters'> {
  const transforms = resolveTransformPreset(options.transforms, createCssTransformPreset);
  const formatters = resolveFormatterPreset(options.formatters, createCssFormatterPreset);
  return materialiseBuildPreset({ transforms, formatters });
}

export interface IosSwiftUiBuildPresetOptions {
  readonly transforms?: IosSwiftUiTransformPresetOptions | false;
  readonly formatters?: IosSwiftUiFormatterPresetOptions | false;
}

/**
 * Generates build configuration entries covering SwiftUI transforms and formatters.
 *
 * @param {IosSwiftUiBuildPresetOptions} options - Optional overrides for the SwiftUI build preset.
 * @returns {Pick<BuildConfig, 'transforms' | 'formatters'>} Build configuration targeting SwiftUI outputs.
 */
export function createIosSwiftUiBuildPreset(
  options: IosSwiftUiBuildPresetOptions = {},
): Pick<BuildConfig, 'transforms' | 'formatters'> {
  const transforms = resolveTransformPreset(options.transforms, createIosSwiftUiTransformPreset);
  const formatters = resolveFormatterPreset(options.formatters, createIosSwiftUiFormatterPreset);
  return materialiseBuildPreset({ transforms, formatters });
}

export interface AndroidMaterialBuildPresetOptions {
  readonly transforms?: AndroidMaterialTransformPresetOptions | false;
  readonly formatters?: AndroidMaterialFormatterPresetOptions | false;
}

/**
 * Generates build configuration entries covering Android Material transforms and formatters.
 *
 * @param {AndroidMaterialBuildPresetOptions} options - Optional overrides for the Android build preset.
 * @returns {Pick<BuildConfig, 'transforms' | 'formatters'>} Build configuration targeting Android outputs.
 */
export function createAndroidMaterialBuildPreset(
  options: AndroidMaterialBuildPresetOptions = {},
): Pick<BuildConfig, 'transforms' | 'formatters'> {
  const transforms = resolveTransformPreset(
    options.transforms,
    createAndroidMaterialTransformPreset,
  );
  const formatters = resolveFormatterPreset(
    options.formatters,
    createAndroidMaterialFormatterPreset,
  );
  return materialiseBuildPreset({ transforms, formatters });
}

export interface AndroidComposeBuildPresetOptions {
  readonly transforms?: AndroidComposeTransformPresetOptions | false;
  readonly formatters?: AndroidComposeFormatterPresetOptions | false;
}

/**
 * Generates build configuration entries covering Android Compose transforms and formatters.
 *
 * @param {AndroidComposeBuildPresetOptions} options - Optional overrides for the Android Compose build preset.
 * @returns {Pick<BuildConfig, 'transforms' | 'formatters'>} Build configuration targeting Compose outputs.
 */
export function createAndroidComposeBuildPreset(
  options: AndroidComposeBuildPresetOptions = {},
): Pick<BuildConfig, 'transforms' | 'formatters'> {
  const transforms = resolveTransformPreset(
    options.transforms,
    createAndroidComposeTransformPreset,
  );
  const formatters = resolveFormatterPreset(
    options.formatters,
    createAndroidComposeFormatterPreset,
  );
  return materialiseBuildPreset({ transforms, formatters });
}

export interface BuildPresetOptions {
  readonly css?: CssBuildPresetOptions | false;
  readonly iosSwiftUi?: IosSwiftUiBuildPresetOptions | false;
  readonly androidMaterial?: AndroidMaterialBuildPresetOptions | false;
  readonly androidCompose?: AndroidComposeBuildPresetOptions | false;
}

/**
 * Aggregates platform build presets into a combined build configuration.
 *
 * @param {BuildPresetOptions} options - Platform selections and overrides for the combined preset.
 * @returns {Pick<BuildConfig, 'transforms' | 'formatters'>} Build configuration entries for the requested presets.
 */
export function createBuildPreset(
  options: BuildPresetOptions = {},
): Pick<BuildConfig, 'transforms' | 'formatters'> {
  const contributions: BuildPresetContribution[] = [];
  if (options.css !== undefined && options.css !== false) {
    const cssOptions = options.css;
    contributions.push({
      transforms: resolveTransformPreset(cssOptions.transforms, createCssTransformPreset),
      formatters: resolveFormatterPreset(cssOptions.formatters, createCssFormatterPreset),
    });
  }
  if (options.iosSwiftUi !== undefined && options.iosSwiftUi !== false) {
    const iosOptions = options.iosSwiftUi;
    contributions.push({
      transforms: resolveTransformPreset(iosOptions.transforms, createIosSwiftUiTransformPreset),
      formatters: resolveFormatterPreset(iosOptions.formatters, createIosSwiftUiFormatterPreset),
    });
  }
  if (options.androidMaterial !== undefined && options.androidMaterial !== false) {
    const androidOptions = options.androidMaterial;
    contributions.push({
      transforms: resolveTransformPreset(
        androidOptions.transforms,
        createAndroidMaterialTransformPreset,
      ),
      formatters: resolveFormatterPreset(
        androidOptions.formatters,
        createAndroidMaterialFormatterPreset,
      ),
    });
  }
  if (options.androidCompose !== undefined && options.androidCompose !== false) {
    const composeOptions = options.androidCompose;
    contributions.push({
      transforms: resolveTransformPreset(
        composeOptions.transforms,
        createAndroidComposeTransformPreset,
      ),
      formatters: resolveFormatterPreset(
        composeOptions.formatters,
        createAndroidComposeFormatterPreset,
      ),
    });
  }
  if (contributions.length === 0) {
    return {};
  }
  const merged = mergeContributions(contributions);
  return materialiseBuildPreset(merged);
}

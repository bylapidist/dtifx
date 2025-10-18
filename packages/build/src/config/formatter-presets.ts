import type { FormatterInstanceConfig, FormatterOutputConfig } from './index.js';

export interface FormatterPresetEntryOverrides {
  readonly id?: string;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly output?: FormatterOutputConfig;
}

function cloneOptions(
  options: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (options === undefined) {
    return undefined;
  }
  return { ...options };
}

function cloneOutput(
  output: FormatterOutputConfig | undefined,
  defaultDirectory: string,
): FormatterOutputConfig {
  const directory = output?.directory ?? defaultDirectory;
  if (directory === undefined) {
    return {};
  }
  return { directory } satisfies FormatterOutputConfig;
}

function createFormatterPresetEntry(
  name: string,
  defaultDirectory: string,
  overrides: FormatterPresetEntryOverrides | undefined,
): FormatterInstanceConfig {
  const options = cloneOptions(overrides?.options);
  const output = cloneOutput(overrides?.output, defaultDirectory);
  return {
    ...(overrides?.id === undefined ? undefined : { id: overrides.id }),
    name,
    ...(options === undefined ? undefined : { options }),
    output,
  } satisfies FormatterInstanceConfig;
}

const DEFAULT_JSON_DIRECTORY = 'dist/json';
const DEFAULT_JAVASCRIPT_MODULE_DIRECTORY = 'dist/js';
const DEFAULT_TYPESCRIPT_MODULE_DIRECTORY = 'dist/ts';
const DEFAULT_CSS_DIRECTORY = 'dist/css';
const DEFAULT_SASS_DIRECTORY = 'dist/sass';
const DEFAULT_LESS_DIRECTORY = 'dist/less';
const DEFAULT_IOS_DIRECTORY = 'dist/ios';
const DEFAULT_ANDROID_DIRECTORY = 'dist/android';
const DEFAULT_ANDROID_COMPOSE_DIRECTORY = 'dist/android/compose';

export interface JsonFormatterPresetOptions {
  readonly baseDirectory?: string;
  readonly snapshot?: FormatterPresetEntryOverrides;
}

/**
 * Generates the formatter configuration entries required to emit flattened JSON snapshots.
 *
 * @param {JsonFormatterPresetOptions} options - Optional overrides for the JSON formatter preset.
 * @returns {readonly FormatterInstanceConfig[]} Formatter configuration entries for JSON output.
 */
export function createJsonFormatterPreset(
  options: JsonFormatterPresetOptions = {},
): readonly FormatterInstanceConfig[] {
  const directory = options.baseDirectory ?? DEFAULT_JSON_DIRECTORY;
  return [createFormatterPresetEntry('json.snapshot', directory, options.snapshot)];
}

export interface JavascriptModuleFormatterPresetOptions {
  readonly baseDirectory?: string;
  readonly module?: FormatterPresetEntryOverrides;
}

/**
 * Generates the formatter configuration entry required to emit JavaScript module artifacts.
 *
 * @param {JavascriptModuleFormatterPresetOptions} options - Optional overrides for the JavaScript module preset.
 * @returns {readonly FormatterInstanceConfig[]} Formatter configuration entries for JavaScript modules.
 */
export function createJavascriptModuleFormatterPreset(
  options: JavascriptModuleFormatterPresetOptions = {},
): readonly FormatterInstanceConfig[] {
  const directory = options.baseDirectory ?? DEFAULT_JAVASCRIPT_MODULE_DIRECTORY;
  return [createFormatterPresetEntry('javascript.module', directory, options.module)];
}

export interface TypescriptModuleFormatterPresetOptions {
  readonly baseDirectory?: string;
  readonly module?: FormatterPresetEntryOverrides;
}

/**
 * Generates the formatter configuration entry required to emit TypeScript module artifacts.
 *
 * @param {TypescriptModuleFormatterPresetOptions} options - Optional overrides for the TypeScript module preset.
 * @returns {readonly FormatterInstanceConfig[]} Formatter configuration entries for TypeScript modules.
 */
export function createTypescriptModuleFormatterPreset(
  options: TypescriptModuleFormatterPresetOptions = {},
): readonly FormatterInstanceConfig[] {
  const directory = options.baseDirectory ?? DEFAULT_TYPESCRIPT_MODULE_DIRECTORY;
  return [createFormatterPresetEntry('typescript.module', directory, options.module)];
}

export interface CssFormatterPresetOptions {
  readonly baseDirectory?: string;
  readonly variables?: FormatterPresetEntryOverrides;
}

/**
 * Generates the formatter configuration entries required to emit CSS custom property artifacts.
 *
 * @param {CssFormatterPresetOptions} options - Optional overrides for the CSS formatter preset.
 * @returns {readonly FormatterInstanceConfig[]} Formatter configuration entries for CSS output.
 */
export function createCssFormatterPreset(
  options: CssFormatterPresetOptions = {},
): readonly FormatterInstanceConfig[] {
  const directory = options.baseDirectory ?? DEFAULT_CSS_DIRECTORY;
  return [createFormatterPresetEntry('css.variables', directory, options.variables)];
}

export interface SassFormatterPresetOptions {
  readonly baseDirectory?: string;
  readonly variables?: FormatterPresetEntryOverrides;
}

/**
 * Generates the formatter configuration entry required to emit Sass variable artifacts.
 *
 * @param {SassFormatterPresetOptions} options - Optional overrides for the Sass formatter preset.
 * @returns {readonly FormatterInstanceConfig[]} Formatter configuration entries for Sass output.
 */
export function createSassFormatterPreset(
  options: SassFormatterPresetOptions = {},
): readonly FormatterInstanceConfig[] {
  const directory = options.baseDirectory ?? DEFAULT_SASS_DIRECTORY;
  return [createFormatterPresetEntry('sass.variables', directory, options.variables)];
}

export interface LessFormatterPresetOptions {
  readonly baseDirectory?: string;
  readonly variables?: FormatterPresetEntryOverrides;
}

/**
 * Generates the formatter configuration entry required to emit Less variable artifacts.
 *
 * @param {LessFormatterPresetOptions} options - Optional overrides for the Less formatter preset.
 * @returns {readonly FormatterInstanceConfig[]} Formatter configuration entries for Less output.
 */
export function createLessFormatterPreset(
  options: LessFormatterPresetOptions = {},
): readonly FormatterInstanceConfig[] {
  const directory = options.baseDirectory ?? DEFAULT_LESS_DIRECTORY;
  return [createFormatterPresetEntry('less.variables', directory, options.variables)];
}

export interface IosSwiftUiFormatterPresetOptions {
  readonly baseDirectory?: string;
  readonly colors?: FormatterPresetEntryOverrides;
  readonly dimensions?: FormatterPresetEntryOverrides;
  readonly typography?: FormatterPresetEntryOverrides;
  readonly gradients?: FormatterPresetEntryOverrides;
  readonly shadows?: FormatterPresetEntryOverrides;
}

/**
 * Generates formatter configuration entries covering the SwiftUI formatter suite.
 *
 * @param {IosSwiftUiFormatterPresetOptions} options - Optional overrides for the SwiftUI preset.
 * @returns {readonly FormatterInstanceConfig[]} Formatter configuration entries for SwiftUI output.
 */
export function createIosSwiftUiFormatterPreset(
  options: IosSwiftUiFormatterPresetOptions = {},
): readonly FormatterInstanceConfig[] {
  const directory = options.baseDirectory ?? DEFAULT_IOS_DIRECTORY;
  return [
    createFormatterPresetEntry('ios.swiftui.colors', directory, options.colors),
    createFormatterPresetEntry('ios.swiftui.dimensions', directory, options.dimensions),
    createFormatterPresetEntry('ios.swiftui.typography', directory, options.typography),
    createFormatterPresetEntry('ios.swiftui.gradients', directory, options.gradients),
    createFormatterPresetEntry('ios.swiftui.shadows', directory, options.shadows),
  ];
}

export interface AndroidMaterialFormatterPresetOptions {
  readonly baseDirectory?: string;
  readonly colors?: FormatterPresetEntryOverrides;
  readonly dimensions?: FormatterPresetEntryOverrides;
  readonly typography?: FormatterPresetEntryOverrides;
  readonly gradients?: FormatterPresetEntryOverrides;
  readonly shadows?: FormatterPresetEntryOverrides;
}

/**
 * Generates formatter configuration entries that emit Android Material resources and Kotlin artifacts.
 *
 * @param {AndroidMaterialFormatterPresetOptions} options - Optional overrides for the Android preset.
 * @returns {readonly FormatterInstanceConfig[]} Formatter configuration entries for Android output.
 */
export function createAndroidMaterialFormatterPreset(
  options: AndroidMaterialFormatterPresetOptions = {},
): readonly FormatterInstanceConfig[] {
  const directory = options.baseDirectory ?? DEFAULT_ANDROID_DIRECTORY;
  return [
    createFormatterPresetEntry('android.material.colors', directory, options.colors),
    createFormatterPresetEntry('android.material.dimensions', directory, options.dimensions),
    createFormatterPresetEntry('android.material.typography', directory, options.typography),
    createFormatterPresetEntry('android.material.gradients', directory, options.gradients),
    createFormatterPresetEntry('android.material.shadows', directory, options.shadows),
  ];
}

export interface AndroidComposeFormatterPresetOptions {
  readonly baseDirectory?: string;
  readonly colors?: FormatterPresetEntryOverrides;
  readonly typography?: FormatterPresetEntryOverrides;
  readonly shapes?: FormatterPresetEntryOverrides;
}

/**
 * Generates formatter configuration entries that emit Jetpack Compose Kotlin artifacts.
 *
 * @param {AndroidComposeFormatterPresetOptions} options - Optional overrides for the Android Compose preset.
 * @returns {readonly FormatterInstanceConfig[]} Formatter configuration entries for Compose output.
 */
export function createAndroidComposeFormatterPreset(
  options: AndroidComposeFormatterPresetOptions = {},
): readonly FormatterInstanceConfig[] {
  const directory = options.baseDirectory ?? DEFAULT_ANDROID_COMPOSE_DIRECTORY;
  return [
    createFormatterPresetEntry('android.compose.colors', directory, options.colors),
    createFormatterPresetEntry('android.compose.typography', directory, options.typography),
    createFormatterPresetEntry('android.compose.shapes', directory, options.shapes),
  ];
}

export interface FormatterPresetOptions {
  readonly json?: JsonFormatterPresetOptions;
  readonly javascriptModule?: JavascriptModuleFormatterPresetOptions;
  readonly typescriptModule?: TypescriptModuleFormatterPresetOptions;
  readonly css?: CssFormatterPresetOptions;
  readonly sass?: SassFormatterPresetOptions;
  readonly less?: LessFormatterPresetOptions;
  readonly iosSwiftUi?: IosSwiftUiFormatterPresetOptions;
  readonly androidMaterial?: AndroidMaterialFormatterPresetOptions;
  readonly androidCompose?: AndroidComposeFormatterPresetOptions;
}

/**
 * Generates a combined set of formatter configuration entries across CSS, SwiftUI, and Android presets.
 *
 * @param {FormatterPresetOptions} options - Options that select and customise the desired presets.
 * @returns {readonly FormatterInstanceConfig[]} Formatter configuration entries for the requested presets.
 */
export function createFormatterPreset(
  options: FormatterPresetOptions = {},
): readonly FormatterInstanceConfig[] {
  const json = options.json ? createJsonFormatterPreset(options.json) : [];
  const javascript = options.javascriptModule
    ? createJavascriptModuleFormatterPreset(options.javascriptModule)
    : [];
  const typescript = options.typescriptModule
    ? createTypescriptModuleFormatterPreset(options.typescriptModule)
    : [];
  const css = options.css ? createCssFormatterPreset(options.css) : [];
  const sass = options.sass ? createSassFormatterPreset(options.sass) : [];
  const less = options.less ? createLessFormatterPreset(options.less) : [];
  const ios = options.iosSwiftUi ? createIosSwiftUiFormatterPreset(options.iosSwiftUi) : [];
  const android = options.androidMaterial
    ? createAndroidMaterialFormatterPreset(options.androidMaterial)
    : [];
  const androidCompose = options.androidCompose
    ? createAndroidComposeFormatterPreset(options.androidCompose)
    : [];
  return [
    ...json,
    ...javascript,
    ...typescript,
    ...css,
    ...sass,
    ...less,
    ...ios,
    ...android,
    ...androidCompose,
  ];
}

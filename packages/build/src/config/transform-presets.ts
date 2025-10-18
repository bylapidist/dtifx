import type { TransformConfigEntry } from './index.js';
import {
  TRANSFORM_GROUP_ANDROID_COMPOSE,
  TRANSFORM_GROUP_ANDROID_MATERIAL,
  TRANSFORM_GROUP_IOS_SWIFTUI,
  TRANSFORM_GROUP_WEB_BASE,
} from '../transform/transform-groups.js';

export interface TransformPresetEntryOverrides {
  readonly group?: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

function cloneOptions(
  options: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  if (options === undefined) {
    return undefined;
  }
  return { ...options };
}

function createTransformPresetEntry(
  name: string,
  defaultGroup: string,
  overrides: TransformPresetEntryOverrides | undefined,
): TransformConfigEntry {
  const group = overrides?.group ?? defaultGroup;
  const options = cloneOptions(overrides?.options);
  return {
    name,
    ...(group === undefined ? undefined : { group }),
    ...(options === undefined ? undefined : { options }),
  } satisfies TransformConfigEntry;
}

export interface CssTransformPresetOptions {
  readonly baseGroup?: string;
  readonly colorToCss?: TransformPresetEntryOverrides;
  readonly dimensionToRem?: TransformPresetEntryOverrides;
  readonly dimensionToPx?: TransformPresetEntryOverrides;
  readonly gradientToCss?: TransformPresetEntryOverrides;
  readonly shadowToCss?: TransformPresetEntryOverrides;
  readonly borderToCss?: TransformPresetEntryOverrides;
  readonly typographyToCss?: TransformPresetEntryOverrides;
}

/**
 * Generates transform configuration entries covering the CSS transform bundle.
 *
 * @param {CssTransformPresetOptions} options - Optional overrides for the CSS transform preset.
 * @returns {readonly TransformConfigEntry[]} Transform configuration entries for CSS outputs.
 */
export function createCssTransformPreset(
  options: CssTransformPresetOptions = {},
): readonly TransformConfigEntry[] {
  const group = options.baseGroup ?? TRANSFORM_GROUP_WEB_BASE;
  return [
    createTransformPresetEntry('color.toCss', group, options.colorToCss),
    createTransformPresetEntry('dimension.toRem', group, options.dimensionToRem),
    createTransformPresetEntry('dimension.toPx', group, options.dimensionToPx),
    createTransformPresetEntry('gradient.toCss', group, options.gradientToCss),
    createTransformPresetEntry('shadow.toCss', group, options.shadowToCss),
    createTransformPresetEntry('border.toCss', group, options.borderToCss),
    createTransformPresetEntry('typography.toCss', group, options.typographyToCss),
  ];
}

export interface IosSwiftUiTransformPresetOptions {
  readonly baseGroup?: string;
  readonly colorToSwiftUIColor?: TransformPresetEntryOverrides;
  readonly dimensionToSwiftUiPoints?: TransformPresetEntryOverrides;
  readonly gradientToSwiftUi?: TransformPresetEntryOverrides;
  readonly shadowToSwiftUi?: TransformPresetEntryOverrides;
  readonly typographyToSwiftUi?: TransformPresetEntryOverrides;
}

/**
 * Generates transform configuration entries covering the SwiftUI transform bundle.
 *
 * @param {IosSwiftUiTransformPresetOptions} options - Optional overrides for the SwiftUI transform preset.
 * @returns {readonly TransformConfigEntry[]} Transform configuration entries for SwiftUI outputs.
 */
export function createIosSwiftUiTransformPreset(
  options: IosSwiftUiTransformPresetOptions = {},
): readonly TransformConfigEntry[] {
  const group = options.baseGroup ?? TRANSFORM_GROUP_IOS_SWIFTUI;
  return [
    createTransformPresetEntry('color.toSwiftUIColor', group, options.colorToSwiftUIColor),
    createTransformPresetEntry(
      'dimension.toSwiftUiPoints',
      group,
      options.dimensionToSwiftUiPoints,
    ),
    createTransformPresetEntry('gradient.toSwiftUI', group, options.gradientToSwiftUi),
    createTransformPresetEntry('shadow.toSwiftUI', group, options.shadowToSwiftUi),
    createTransformPresetEntry('typography.toSwiftUI', group, options.typographyToSwiftUi),
  ];
}

export interface AndroidMaterialTransformPresetOptions {
  readonly baseGroup?: string;
  readonly colorToAndroidArgb?: TransformPresetEntryOverrides;
  readonly dimensionToAndroidDp?: TransformPresetEntryOverrides;
  readonly dimensionToAndroidSp?: TransformPresetEntryOverrides;
  readonly gradientToAndroidMaterial?: TransformPresetEntryOverrides;
  readonly shadowToAndroidMaterial?: TransformPresetEntryOverrides;
  readonly typographyToAndroidMaterial?: TransformPresetEntryOverrides;
}

/**
 * Generates transform configuration entries covering the Android Material transform bundle.
 *
 * @param {AndroidMaterialTransformPresetOptions} options - Optional overrides for the Android transform preset.
 * @returns {readonly TransformConfigEntry[]} Transform configuration entries for Android outputs.
 */
export function createAndroidMaterialTransformPreset(
  options: AndroidMaterialTransformPresetOptions = {},
): readonly TransformConfigEntry[] {
  const group = options.baseGroup ?? TRANSFORM_GROUP_ANDROID_MATERIAL;
  return [
    createTransformPresetEntry('color.toAndroidArgb', group, options.colorToAndroidArgb),
    createTransformPresetEntry('dimension.toAndroidDp', group, options.dimensionToAndroidDp),
    createTransformPresetEntry('dimension.toAndroidSp', group, options.dimensionToAndroidSp),
    createTransformPresetEntry(
      'gradient.toAndroidMaterial',
      group,
      options.gradientToAndroidMaterial,
    ),
    createTransformPresetEntry('shadow.toAndroidMaterial', group, options.shadowToAndroidMaterial),
    createTransformPresetEntry(
      'typography.toAndroidMaterial',
      group,
      options.typographyToAndroidMaterial,
    ),
  ];
}

export interface AndroidComposeTransformPresetOptions {
  readonly baseGroup?: string;
  readonly colorToAndroidComposeColor?: TransformPresetEntryOverrides;
  readonly borderToAndroidComposeShape?: TransformPresetEntryOverrides;
  readonly typographyToAndroidCompose?: TransformPresetEntryOverrides;
}

/**
 * Generates transform configuration entries covering the Jetpack Compose transform bundle.
 *
 * @param {AndroidComposeTransformPresetOptions} options - Optional overrides for the Android Compose transform preset.
 * @returns {readonly TransformConfigEntry[]} Transform configuration entries for Compose outputs.
 */
export function createAndroidComposeTransformPreset(
  options: AndroidComposeTransformPresetOptions = {},
): readonly TransformConfigEntry[] {
  const group = options.baseGroup ?? TRANSFORM_GROUP_ANDROID_COMPOSE;
  return [
    createTransformPresetEntry(
      'color.toAndroidComposeColor',
      group,
      options.colorToAndroidComposeColor,
    ),
    createTransformPresetEntry(
      'border.toAndroidComposeShape',
      group,
      options.borderToAndroidComposeShape,
    ),
    createTransformPresetEntry(
      'typography.toAndroidCompose',
      group,
      options.typographyToAndroidCompose,
    ),
  ];
}

export interface TransformPresetOptions {
  readonly css?: CssTransformPresetOptions;
  readonly iosSwiftUi?: IosSwiftUiTransformPresetOptions;
  readonly androidMaterial?: AndroidMaterialTransformPresetOptions;
  readonly androidCompose?: AndroidComposeTransformPresetOptions;
}

/**
 * Generates a combined set of transform configuration entries across CSS, SwiftUI, and Android presets.
 *
 * @param {TransformPresetOptions} options - Options that select and customise the desired presets.
 * @returns {readonly TransformConfigEntry[]} Transform configuration entries for the requested presets.
 */
export function createTransformPreset(
  options: TransformPresetOptions = {},
): readonly TransformConfigEntry[] {
  const css = options.css ? createCssTransformPreset(options.css) : [];
  const ios = options.iosSwiftUi ? createIosSwiftUiTransformPreset(options.iosSwiftUi) : [];
  const android = options.androidMaterial
    ? createAndroidMaterialTransformPreset(options.androidMaterial)
    : [];
  const androidCompose = options.androidCompose
    ? createAndroidComposeTransformPreset(options.androidCompose)
    : [];
  return [...css, ...ios, ...android, ...androidCompose];
}

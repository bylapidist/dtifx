import { describe, expect, it } from 'vitest';

import type { FormatterInstanceConfig, TransformConfigEntry } from './index.js';
import {
  createAndroidComposeBuildPreset,
  createAndroidMaterialBuildPreset,
  createBuildPreset,
  createCssBuildPreset,
  createIosSwiftUiBuildPreset,
} from './build-presets.js';
import {
  TRANSFORM_GROUP_ANDROID_COMPOSE,
  TRANSFORM_GROUP_ANDROID_MATERIAL,
  TRANSFORM_GROUP_IOS_SWIFTUI,
  TRANSFORM_GROUP_WEB_BASE,
} from '../transform/transform-groups.js';

function assertTransform(
  entry: TransformConfigEntry,
  name: string,
  group?: string,
  options?: Readonly<Record<string, unknown>>,
): void {
  expect(entry.name).toBe(name);
  if (group === undefined) {
    expect(entry.group).toBeUndefined();
  } else {
    expect(entry.group).toBe(group);
  }
  if (options === undefined) {
    expect(entry.options).toBeUndefined();
  } else {
    expect(entry.options).toEqual(options);
    expect(entry.options).not.toBe(options);
  }
}

function assertFormatter(
  instance: FormatterInstanceConfig,
  name: string,
  directory: string,
  options?: Readonly<Record<string, unknown>>,
  id?: string,
): void {
  expect(instance.name).toBe(name);
  expect(instance.output).toEqual({ directory });
  if (options === undefined) {
    expect(instance.options).toBeUndefined();
  } else {
    expect(instance.options).toEqual(options);
    expect(instance.options).not.toBe(options);
  }
  if (id === undefined) {
    expect(instance.id).toBeUndefined();
  } else {
    expect(instance.id).toBe(id);
  }
}

describe('createCssBuildPreset', () => {
  it('returns CSS transforms and formatters by default', () => {
    const preset = createCssBuildPreset();
    expect(preset.transforms?.entries).toHaveLength(7);
    const entries = preset.transforms?.entries ?? [];
    assertTransform(entries[0]!, 'color.toCss', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[1]!, 'dimension.toRem', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[2]!, 'dimension.toPx', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[3]!, 'gradient.toCss', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[4]!, 'shadow.toCss', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[5]!, 'border.toCss', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[6]!, 'typography.toCss', TRANSFORM_GROUP_WEB_BASE);

    expect(preset.formatters).toHaveLength(1);
    assertFormatter(preset.formatters![0]!, 'css.variables', 'dist/css');
  });

  it('allows overriding transform and formatter options', () => {
    const colorOptions = { format: 'rgb' } as const;
    const formatterOptions = { filename: 'tokens.css' } as const;

    const preset = createCssBuildPreset({
      transforms: {
        baseGroup: 'custom-css',
        colorToCss: { options: colorOptions },
        gradientToCss: { options: { precision: 5 } },
      },
      formatters: {
        baseDirectory: 'public/css',
        variables: {
          id: 'css',
          output: { directory: 'assets/css' },
          options: formatterOptions,
        },
      },
    });

    const entries = preset.transforms?.entries ?? [];
    assertTransform(entries[0]!, 'color.toCss', 'custom-css', colorOptions);
    assertTransform(entries[1]!, 'dimension.toRem', 'custom-css');
    assertTransform(entries[2]!, 'dimension.toPx', 'custom-css');
    assertTransform(entries[3]!, 'gradient.toCss', 'custom-css', { precision: 5 });
    assertTransform(entries[4]!, 'shadow.toCss', 'custom-css');
    assertTransform(entries[5]!, 'border.toCss', 'custom-css');
    assertTransform(entries[6]!, 'typography.toCss', 'custom-css');

    expect(preset.formatters).toHaveLength(1);
    assertFormatter(preset.formatters![0]!, 'css.variables', 'assets/css', formatterOptions, 'css');
  });

  it('can disable transforms or formatters independently', () => {
    const preset = createCssBuildPreset({
      transforms: false,
      formatters: {},
    });

    expect(preset.transforms).toBeUndefined();
    expect(preset.formatters).toHaveLength(1);
  });
});

describe('createIosSwiftUiBuildPreset', () => {
  it('returns SwiftUI transforms and formatters', () => {
    const preset = createIosSwiftUiBuildPreset();
    const entries = preset.transforms?.entries ?? [];
    expect(entries).toHaveLength(5);
    assertTransform(entries[0]!, 'color.toSwiftUIColor', TRANSFORM_GROUP_IOS_SWIFTUI);
    assertTransform(entries[1]!, 'dimension.toSwiftUiPoints', TRANSFORM_GROUP_IOS_SWIFTUI);
    assertTransform(entries[2]!, 'gradient.toSwiftUI', TRANSFORM_GROUP_IOS_SWIFTUI);
    assertTransform(entries[3]!, 'shadow.toSwiftUI', TRANSFORM_GROUP_IOS_SWIFTUI);
    assertTransform(entries[4]!, 'typography.toSwiftUI', TRANSFORM_GROUP_IOS_SWIFTUI);

    expect(preset.formatters).toHaveLength(5);
  });
});

describe('createAndroidMaterialBuildPreset', () => {
  it('returns Android transforms and formatters', () => {
    const preset = createAndroidMaterialBuildPreset();
    const entries = preset.transforms?.entries ?? [];
    expect(entries).toHaveLength(6);
    assertTransform(entries[0]!, 'color.toAndroidArgb', TRANSFORM_GROUP_ANDROID_MATERIAL);
    assertTransform(entries[1]!, 'dimension.toAndroidDp', TRANSFORM_GROUP_ANDROID_MATERIAL);
    assertTransform(entries[2]!, 'dimension.toAndroidSp', TRANSFORM_GROUP_ANDROID_MATERIAL);
    assertTransform(entries[3]!, 'gradient.toAndroidMaterial', TRANSFORM_GROUP_ANDROID_MATERIAL);
    assertTransform(entries[4]!, 'shadow.toAndroidMaterial', TRANSFORM_GROUP_ANDROID_MATERIAL);
    assertTransform(entries[5]!, 'typography.toAndroidMaterial', TRANSFORM_GROUP_ANDROID_MATERIAL);

    expect(preset.formatters).toHaveLength(5);
  });
});

describe('createAndroidComposeBuildPreset', () => {
  it('returns Compose transforms and formatters', () => {
    const preset = createAndroidComposeBuildPreset();
    const entries = preset.transforms?.entries ?? [];
    expect(entries).toHaveLength(3);
    assertTransform(entries[0]!, 'color.toAndroidComposeColor', TRANSFORM_GROUP_ANDROID_COMPOSE);
    assertTransform(entries[1]!, 'border.toAndroidComposeShape', TRANSFORM_GROUP_ANDROID_COMPOSE);
    assertTransform(entries[2]!, 'typography.toAndroidCompose', TRANSFORM_GROUP_ANDROID_COMPOSE);

    expect(preset.formatters).toHaveLength(3);
    assertFormatter(preset.formatters![0]!, 'android.compose.colors', 'dist/android/compose');
  });
});

describe('createBuildPreset', () => {
  it('returns an empty configuration when no presets are enabled', () => {
    expect(createBuildPreset()).toEqual({});
    expect(createBuildPreset({ css: false, iosSwiftUi: false, androidMaterial: false })).toEqual(
      {},
    );
  });

  it('merges contributions from selected presets', () => {
    const preset = createBuildPreset({
      css: { formatters: false },
      androidMaterial: {
        transforms: { baseGroup: 'android.custom' },
      },
      androidCompose: {
        transforms: { baseGroup: 'compose.custom' },
      },
    });

    const entries = preset.transforms?.entries ?? [];
    expect(entries).toHaveLength(16);
    assertTransform(entries[0]!, 'color.toCss', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[1]!, 'dimension.toRem', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[2]!, 'dimension.toPx', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[3]!, 'gradient.toCss', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[4]!, 'shadow.toCss', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[5]!, 'border.toCss', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[6]!, 'typography.toCss', TRANSFORM_GROUP_WEB_BASE);
    assertTransform(entries[7]!, 'color.toAndroidArgb', 'android.custom');
    assertTransform(entries[8]!, 'dimension.toAndroidDp', 'android.custom');
    assertTransform(entries[9]!, 'dimension.toAndroidSp', 'android.custom');
    assertTransform(entries[10]!, 'gradient.toAndroidMaterial', 'android.custom');
    assertTransform(entries[11]!, 'shadow.toAndroidMaterial', 'android.custom');
    assertTransform(entries[12]!, 'typography.toAndroidMaterial', 'android.custom');
    assertTransform(entries[13]!, 'color.toAndroidComposeColor', 'compose.custom');
    assertTransform(entries[14]!, 'border.toAndroidComposeShape', 'compose.custom');
    assertTransform(entries[15]!, 'typography.toAndroidCompose', 'compose.custom');

    expect(preset.formatters).toHaveLength(8);
  });
});

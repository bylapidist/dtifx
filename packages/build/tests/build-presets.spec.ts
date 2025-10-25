import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { FormatterInstanceConfig, TransformConfigEntry } from '../src/config/index.js';
import type { CssBuildPresetOptions } from '../src/config/build-presets.js';

const {
  cssTransformPreset,
  iosSwiftUiTransformPreset,
  androidMaterialTransformPreset,
  androidComposeTransformPreset,
  cssFormatterPreset,
  iosSwiftUiFormatterPreset,
  androidMaterialFormatterPreset,
  androidComposeFormatterPreset,
  createCssTransformPresetMock,
  createIosSwiftUiTransformPresetMock,
  createAndroidMaterialTransformPresetMock,
  createAndroidComposeTransformPresetMock,
  createCssFormatterPresetMock,
  createIosSwiftUiFormatterPresetMock,
  createAndroidMaterialFormatterPresetMock,
  createAndroidComposeFormatterPresetMock,
} = vi.hoisted(() => {
  const cssTransforms: TransformConfigEntry[] = [
    {
      name: 'color.toCss',
      group: 'css',
      options: { format: 'rgb' } satisfies Readonly<Record<string, unknown>>,
    },
    {
      name: 'dimension.toRem',
      options: { precision: 2 } satisfies Readonly<Record<string, unknown>>,
    },
  ];
  const iosTransforms: TransformConfigEntry[] = [
    {
      name: 'color.toSwiftUIColor',
      group: 'swiftui',
      options: { palette: 'dynamic' } satisfies Readonly<Record<string, unknown>>,
    },
  ];
  const androidMaterialTransforms: TransformConfigEntry[] = [
    {
      name: 'color.toAndroidArgb',
      group: 'material',
      options: { mode: 'filled' } satisfies Readonly<Record<string, unknown>>,
    },
  ];
  const androidComposeTransforms: TransformConfigEntry[] = [
    {
      name: 'color.toCompose',
      group: 'compose',
      options: { theme: 'material3' } satisfies Readonly<Record<string, unknown>>,
    },
  ];
  const cssFormatters: FormatterInstanceConfig[] = [
    {
      name: 'css.variables',
      options: { scope: ':root' } satisfies Readonly<Record<string, unknown>>,
      output: { directory: 'dist/css' },
    },
  ];
  const iosFormatters: FormatterInstanceConfig[] = [
    {
      name: 'ios.swiftui.colors',
      output: { directory: 'dist/ios' },
    },
  ];
  const androidMaterialFormatters: FormatterInstanceConfig[] = [
    {
      id: 'android.material',
      name: 'android.material.resources',
      options: { theme: 'material' } satisfies Readonly<Record<string, unknown>>,
      output: { directory: 'dist/android' },
    },
  ];
  const androidComposeFormatters: FormatterInstanceConfig[] = [
    {
      name: 'android.compose.resources',
      options: { theme: 'material3' } satisfies Readonly<Record<string, unknown>>,
      output: { directory: 'dist/android/compose' },
    },
  ];
  return {
    cssTransformPreset: cssTransforms,
    iosSwiftUiTransformPreset: iosTransforms,
    androidMaterialTransformPreset: androidMaterialTransforms,
    androidComposeTransformPreset: androidComposeTransforms,
    cssFormatterPreset: cssFormatters,
    iosSwiftUiFormatterPreset: iosFormatters,
    androidMaterialFormatterPreset: androidMaterialFormatters,
    androidComposeFormatterPreset: androidComposeFormatters,
    createCssTransformPresetMock: vi.fn(() => cssTransforms),
    createIosSwiftUiTransformPresetMock: vi.fn(() => iosTransforms),
    createAndroidMaterialTransformPresetMock: vi.fn(() => androidMaterialTransforms),
    createAndroidComposeTransformPresetMock: vi.fn(() => androidComposeTransforms),
    createCssFormatterPresetMock: vi.fn(() => cssFormatters),
    createIosSwiftUiFormatterPresetMock: vi.fn(() => iosFormatters),
    createAndroidMaterialFormatterPresetMock: vi.fn(() => androidMaterialFormatters),
    createAndroidComposeFormatterPresetMock: vi.fn(() => androidComposeFormatters),
  } satisfies Record<string, unknown>;
}) as {
  cssTransformPreset: TransformConfigEntry[];
  iosSwiftUiTransformPreset: TransformConfigEntry[];
  androidMaterialTransformPreset: TransformConfigEntry[];
  androidComposeTransformPreset: TransformConfigEntry[];
  cssFormatterPreset: FormatterInstanceConfig[];
  iosSwiftUiFormatterPreset: FormatterInstanceConfig[];
  androidMaterialFormatterPreset: FormatterInstanceConfig[];
  androidComposeFormatterPreset: FormatterInstanceConfig[];
  createCssTransformPresetMock: Mock;
  createIosSwiftUiTransformPresetMock: Mock;
  createAndroidMaterialTransformPresetMock: Mock;
  createAndroidComposeTransformPresetMock: Mock;
  createCssFormatterPresetMock: Mock;
  createIosSwiftUiFormatterPresetMock: Mock;
  createAndroidMaterialFormatterPresetMock: Mock;
  createAndroidComposeFormatterPresetMock: Mock;
};

vi.mock('../src/config/transform-presets.js', () => ({
  createCssTransformPreset: createCssTransformPresetMock,
  createIosSwiftUiTransformPreset: createIosSwiftUiTransformPresetMock,
  createAndroidMaterialTransformPreset: createAndroidMaterialTransformPresetMock,
  createAndroidComposeTransformPreset: createAndroidComposeTransformPresetMock,
}));

vi.mock('../src/config/formatter-presets.js', () => ({
  createCssFormatterPreset: createCssFormatterPresetMock,
  createIosSwiftUiFormatterPreset: createIosSwiftUiFormatterPresetMock,
  createAndroidMaterialFormatterPreset: createAndroidMaterialFormatterPresetMock,
  createAndroidComposeFormatterPreset: createAndroidComposeFormatterPresetMock,
}));

import {
  createAndroidComposeFormatterPreset,
  createAndroidMaterialFormatterPreset,
  createCssFormatterPreset,
  createIosSwiftUiFormatterPreset,
} from '../src/config/formatter-presets.js';
import {
  createAndroidComposeTransformPreset,
  createAndroidMaterialTransformPreset,
  createCssTransformPreset,
  createIosSwiftUiTransformPreset,
} from '../src/config/transform-presets.js';
import { createBuildPreset, createCssBuildPreset } from '../src/config/build-presets.js';

describe('createCssBuildPreset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clones transform and formatter definitions from factories', () => {
    const preset = createCssBuildPreset();

    expect(createCssTransformPreset).toHaveBeenCalledWith(undefined);
    expect(createCssFormatterPreset).toHaveBeenCalledWith(undefined);

    expect(preset.transforms?.entries).toHaveLength(cssTransformPreset.length);
    expect(preset.formatters).toHaveLength(cssFormatterPreset.length);

    const [transformEntry] = preset.transforms?.entries ?? [];
    expect(transformEntry).not.toBe(cssTransformPreset[0]);
    expect(transformEntry?.options).not.toBe(cssTransformPreset[0].options);
    if (transformEntry?.options !== undefined) {
      (transformEntry.options as Record<string, unknown>).format = 'hex';
    }
    expect(cssTransformPreset[0].options).toEqual({ format: 'rgb' });

    const [formatterInstance] = preset.formatters ?? [];
    expect(formatterInstance).not.toBe(cssFormatterPreset[0]);
    expect(formatterInstance?.options).not.toBe(cssFormatterPreset[0].options);
    expect(formatterInstance?.output).not.toBe(cssFormatterPreset[0].output);
    if (formatterInstance?.options !== undefined) {
      (formatterInstance.options as Record<string, unknown>).scope = 'component';
    }
    if (formatterInstance !== undefined) {
      formatterInstance.output.directory = 'alt';
    }

    expect(cssFormatterPreset[0].options).toEqual({ scope: ':root' });
    expect(cssFormatterPreset[0].output.directory).toBe('dist/css');
  });

  it('omits disabled sections when overrides are false', () => {
    const preset = createCssBuildPreset({ transforms: false, formatters: false });

    expect(createCssTransformPreset).not.toHaveBeenCalled();
    expect(createCssFormatterPreset).not.toHaveBeenCalled();
    expect(preset).toEqual({});
  });

  it('passes override objects to factories', () => {
    const options: CssBuildPresetOptions = {
      transforms: { baseGroup: 'custom-group' },
      formatters: {
        baseDirectory: 'custom/dist',
        variables: { options: { accent: 'blue' } },
      },
    };

    createCssBuildPreset(options);

    expect(createCssTransformPreset).toHaveBeenCalledWith(options.transforms);
    expect(createCssFormatterPreset).toHaveBeenCalledWith(options.formatters);
  });
});

describe('createBuildPreset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges contributions for enabled platforms', () => {
    const preset = createBuildPreset({
      css: {},
      iosSwiftUi: false,
      androidMaterial: {},
      androidCompose: {},
    });

    expect(createCssTransformPreset).toHaveBeenCalledTimes(1);
    expect(createAndroidMaterialTransformPreset).toHaveBeenCalledTimes(1);
    expect(createAndroidComposeTransformPreset).toHaveBeenCalledTimes(1);
    expect(createIosSwiftUiTransformPreset).not.toHaveBeenCalled();

    expect(createCssFormatterPreset).toHaveBeenCalledTimes(1);
    expect(createAndroidMaterialFormatterPreset).toHaveBeenCalledTimes(1);
    expect(createAndroidComposeFormatterPreset).toHaveBeenCalledTimes(1);
    expect(createIosSwiftUiFormatterPreset).not.toHaveBeenCalled();

    expect(preset.transforms?.entries).toHaveLength(
      cssTransformPreset.length +
        androidMaterialTransformPreset.length +
        androidComposeTransformPreset.length,
    );
    expect(preset.formatters).toHaveLength(
      cssFormatterPreset.length +
        androidMaterialFormatterPreset.length +
        androidComposeFormatterPreset.length,
    );

    const transformEntries = preset.transforms?.entries ?? [];
    expect(transformEntries.slice(0, cssTransformPreset.length).map((entry) => entry.name)).toEqual(
      cssTransformPreset.map((entry) => entry.name),
    );

    const androidEntries = transformEntries.slice(cssTransformPreset.length);
    expect(androidEntries[0].name).toBe(androidMaterialTransformPreset[0].name);
    expect(androidEntries[1].name).toBe(androidComposeTransformPreset[0].name);
    expect(androidEntries[0]).not.toBe(androidMaterialTransformPreset[0]);
    if (androidEntries[0].options !== undefined) {
      (androidEntries[0].options as Record<string, unknown>).mode = 'outlined';
    }
    expect(androidMaterialTransformPreset[0].options).toEqual({ mode: 'filled' });

    const formatterEntries = preset.formatters ?? [];
    expect(formatterEntries[cssFormatterPreset.length]).not.toBe(androidMaterialFormatterPreset[0]);
    formatterEntries[cssFormatterPreset.length].output.directory = 'changed';
    expect(androidMaterialFormatterPreset[0].output.directory).toBe('dist/android');
  });

  it('returns an empty object when no presets are enabled', () => {
    expect(createBuildPreset({})).toEqual({});
    expect(
      createBuildPreset({
        css: false,
        iosSwiftUi: false,
        androidMaterial: false,
        androidCompose: false,
      }),
    ).toEqual({});

    expect(createCssTransformPreset).not.toHaveBeenCalled();
    expect(createCssFormatterPreset).not.toHaveBeenCalled();
  });
});

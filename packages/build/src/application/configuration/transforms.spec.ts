import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import {
  createCssTransformFactories,
  createDefaultTransformDefinitionRegistry,
  createAndroidMaterialTransformFactories,
  createAndroidComposeTransformFactories,
  createIosSwiftUiTransformFactories,
  loadTransformDefinitionRegistry,
} from './transforms.js';
import {
  colorToCssTransform,
  colorToAndroidArgbTransform,
  colorToAndroidComposeColorTransform,
  colorToSwiftUIColorTransform,
} from '../../transform/color-transforms.js';
import {
  dimensionToAndroidDpTransform,
  dimensionToAndroidSpTransform,
  dimensionToPxTransform,
  dimensionToRemTransform,
  dimensionToSwiftUiPointsTransform,
} from '../../transform/dimension-transforms.js';
import {
  gradientToAndroidMaterialTransform,
  gradientToCssTransform,
  gradientToSwiftUiTransform,
} from '../../transform/gradient-transforms.js';
import {
  borderToCssTransform,
  borderToAndroidComposeShapeTransform,
} from '../../transform/border-transforms.js';
import {
  typographyToCssTransform,
  typographyToAndroidMaterialTransform,
  typographyToAndroidComposeTransform,
  typographyToSwiftUiTransform,
} from '../../transform/typography-transforms.js';
import {
  shadowToAndroidMaterialTransform,
  shadowToCssTransform,
  shadowToSwiftUiTransform,
} from '../../transform/shadow-transforms.js';

const cssFactoryNames = [
  'color.toCss',
  'dimension.toRem',
  'dimension.toPx',
  'gradient.toCss',
  'border.toCss',
  'shadow.toCss',
  'typography.toCss',
] as const;

const iosFactoryNames = [
  'color.toSwiftUIColor',
  'dimension.toSwiftUiPoints',
  'gradient.toSwiftUI',
  'shadow.toSwiftUI',
  'typography.toSwiftUI',
] as const;

const androidFactoryNames = [
  'color.toAndroidArgb',
  'dimension.toAndroidDp',
  'dimension.toAndroidSp',
  'gradient.toAndroidMaterial',
  'shadow.toAndroidMaterial',
  'typography.toAndroidMaterial',
] as const;

const androidComposeFactoryNames = [
  'color.toAndroidComposeColor',
  'border.toAndroidComposeShape',
  'typography.toAndroidCompose',
] as const;

const baseOptions = {
  config: {} as BuildConfig,
  configDirectory: '/workspace/config',
  configPath: '/workspace/config/dtifx.config.mjs',
} as const;

describe('createCssTransformFactories', () => {
  it('returns CSS transform factories in registration order', () => {
    const factories = createCssTransformFactories();

    expect(factories.map((factory) => factory.name)).toStrictEqual([...cssFactoryNames]);
  });

  it('builds CSS transform definitions via factory invocation', () => {
    const factories = createCssTransformFactories();
    const context = { config: baseOptions.config };

    expect(
      factories.map((factory) => factory.create({ name: factory.name }, context)),
    ).toStrictEqual([
      colorToCssTransform,
      dimensionToRemTransform,
      dimensionToPxTransform,
      gradientToCssTransform,
      borderToCssTransform,
      shadowToCssTransform,
      typographyToCssTransform,
    ]);
  });
});

describe('createAndroidMaterialTransformFactories', () => {
  it('returns Android transform factories in registration order', () => {
    const factories = createAndroidMaterialTransformFactories();

    expect(factories.map((factory) => factory.name)).toStrictEqual([...androidFactoryNames]);
  });

  it('builds Android transform definitions via factory invocation', () => {
    const factories = createAndroidMaterialTransformFactories();
    const context = { config: baseOptions.config };

    expect(
      factories.map((factory) => factory.create({ name: factory.name }, context)),
    ).toStrictEqual([
      colorToAndroidArgbTransform,
      dimensionToAndroidDpTransform,
      dimensionToAndroidSpTransform,
      gradientToAndroidMaterialTransform,
      shadowToAndroidMaterialTransform,
      typographyToAndroidMaterialTransform,
    ]);
  });
});

describe('createAndroidComposeTransformFactories', () => {
  it('returns Android Compose transform factories in registration order', () => {
    const factories = createAndroidComposeTransformFactories();

    expect(factories.map((factory) => factory.name)).toStrictEqual([...androidComposeFactoryNames]);
  });

  it('builds Android Compose transform definitions via factory invocation', () => {
    const factories = createAndroidComposeTransformFactories();
    const context = { config: baseOptions.config };

    expect(
      factories.map((factory) => factory.create({ name: factory.name }, context)),
    ).toStrictEqual([
      colorToAndroidComposeColorTransform,
      borderToAndroidComposeShapeTransform,
      typographyToAndroidComposeTransform,
    ]);
  });
});

describe('createIosSwiftUiTransformFactories', () => {
  it('returns SwiftUI transform factories in registration order', () => {
    const factories = createIosSwiftUiTransformFactories();

    expect(factories.map((factory) => factory.name)).toStrictEqual([...iosFactoryNames]);
  });

  it('builds SwiftUI transform definitions via factory invocation', () => {
    const factories = createIosSwiftUiTransformFactories();
    const context = { config: baseOptions.config };

    expect(
      factories.map((factory) => factory.create({ name: factory.name }, context)),
    ).toStrictEqual([
      colorToSwiftUIColorTransform,
      dimensionToSwiftUiPointsTransform,
      gradientToSwiftUiTransform,
      shadowToSwiftUiTransform,
      typographyToSwiftUiTransform,
    ]);
  });
});

describe('createDefaultTransformDefinitionRegistry', () => {
  it('seeds the registry with the CSS transform factories', () => {
    const registry = createDefaultTransformDefinitionRegistry();

    expect(registry.list().map((factory) => factory.name)).toStrictEqual([
      ...cssFactoryNames,
      ...iosFactoryNames,
      ...androidFactoryNames,
      ...androidComposeFactoryNames,
    ]);
  });
});

describe('loadTransformDefinitionRegistry', () => {
  it('allows bare package names for transform plugins', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));

    await loadTransformDefinitionRegistry({
      ...baseOptions,
      plugins: ['example-transform-plugin'],
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith('example-transform-plugin');
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('resolves relative transform plugin paths against the configuration directory', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));

    await loadTransformDefinitionRegistry({
      ...baseOptions,
      plugins: ['./plugins/transform.js'],
      importModule: importer,
    });

    const expectedSpecifier = pathToFileURL(
      path.resolve(baseOptions.configDirectory, './plugins/transform.js'),
    ).href;

    expect(importer).toHaveBeenCalledWith(expectedSpecifier);
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('rejects transform plugin specifiers that use unsupported protocols', async () => {
    const importer = vi.fn();

    await expect(
      loadTransformDefinitionRegistry({
        ...baseOptions,
        plugins: ['data:application/javascript;base64,AA=='],
        importModule: importer,
      }),
    ).rejects.toThrow(
      'Transform plugin module specifiers must be bare package names or filesystem paths. ' +
        'Received "data:application/javascript;base64,AA==".',
    );

    expect(importer).not.toHaveBeenCalled();
  });
});

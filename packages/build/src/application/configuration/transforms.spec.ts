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
  createTransformConfiguration,
  loadTransformDefinitionRegistry,
  TransformDefinitionFactoryRegistry,
  type TransformDefinitionFactory,
  type TransformDefinitionFactoryContext,
  type TransformPluginImporter,
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

describe('createTransformConfiguration', () => {
  const minimalConfig = { transforms: { entries: [] } } as BuildConfig;

  it('throws when duplicate transform entries are provided', () => {
    const config = {
      ...minimalConfig,
      transforms: {
        entries: [{ name: 'color.toCss' }, { name: 'color.toCss' }],
      },
    } as BuildConfig;

    expect(() => createTransformConfiguration(config)).toThrow(
      'Duplicate transform configuration for "color.toCss".',
    );
  });

  it('throws when a transform entry references an unknown factory', () => {
    const config = {
      ...minimalConfig,
      transforms: {
        entries: [{ name: 'example.transform' }],
      },
    } as BuildConfig;

    expect(() =>
      createTransformConfiguration(config, {
        definitionRegistry: new TransformDefinitionFactoryRegistry(),
      }),
    ).toThrow('Unknown transform "example.transform" in configuration.');
  });

  it('normalises configuration entries and applies definition context overrides', () => {
    const config = {
      ...minimalConfig,
      transforms: {
        entries: [{ name: 'example.transform', group: '  custom-group  ' }],
      },
    } as BuildConfig;

    let capturedContext: TransformDefinitionFactoryContext | undefined;
    const factory: TransformDefinitionFactory = {
      name: 'example.transform',
      create(entry, context) {
        capturedContext = context;
        return {
          name: entry.name,
          selector: {} as never,
          group: 'factory-group',
          run: vi.fn(),
        };
      },
    };
    const registry = new TransformDefinitionFactoryRegistry([factory]);
    const overridesContext = {
      configDirectory: '/workspace/config',
      configPath: '/workspace/config/dtifx.config.mjs',
    } as unknown as TransformDefinitionFactoryContext;

    const result = createTransformConfiguration(config, {
      definitionRegistry: registry,
      definitionContext: overridesContext,
    });

    expect(capturedContext).toEqual({
      config,
      configDirectory: '/workspace/config',
      configPath: '/workspace/config/dtifx.config.mjs',
    });
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0]).toEqual(
      expect.objectContaining({
        name: 'example.transform',
        group: 'custom-group',
      }),
    );
    expect(result.registry.get('example.transform')).toBeDefined();
  });

  it('rejects non-string transform group overrides', () => {
    const config = {
      ...minimalConfig,
      transforms: {
        entries: [{ name: 'color.toCss', group: 123 as never }],
      },
    } as BuildConfig;

    expect(() => createTransformConfiguration(config)).toThrow(
      'Transform "color.toCss" group must be a string when provided.',
    );
  });

  it('rejects empty transform group overrides', () => {
    const config = {
      ...minimalConfig,
      transforms: {
        entries: [{ name: 'color.toCss', group: '   ' }],
      },
    } as BuildConfig;

    expect(() => createTransformConfiguration(config)).toThrow(
      'Transform "color.toCss" group must be a non-empty string.',
    );
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

  it('resolves absolute filesystem plugin specifiers to file URLs', async () => {
    const importer = vi.fn(async () => ({ default: vi.fn() }));
    const absolutePath = path.resolve('/tmp/plugins/transform.js');

    await loadTransformDefinitionRegistry({
      ...baseOptions,
      plugins: [absolutePath],
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledWith(pathToFileURL(absolutePath).href);
  });

  it('keeps file URL plugin specifiers unchanged', async () => {
    const importer = vi.fn(async () => ({ default: vi.fn() }));
    const fileUrl = 'file:///tmp/plugins/transform.js';

    await loadTransformDefinitionRegistry({
      ...baseOptions,
      plugins: [fileUrl],
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledWith(fileUrl);
  });

  it('supports registerTransforms named exports and default object exports', async () => {
    const namedPlugin = vi.fn(async () => {});
    const defaultPlugin = vi.fn(async () => {});

    const importer = vi
      .fn<Parameters<TransformPluginImporter>, ReturnType<TransformPluginImporter>>()
      .mockImplementationOnce(async () => ({ registerTransforms: namedPlugin }))
      .mockImplementationOnce(async () => ({ default: { registerTransforms: defaultPlugin } }));

    await loadTransformDefinitionRegistry({
      ...baseOptions,
      plugins: ['named-plugin', 'default-object-plugin'],
      importModule: importer,
    });

    expect(namedPlugin).toHaveBeenCalledTimes(1);
    expect(defaultPlugin).toHaveBeenCalledTimes(1);
  });

  it('normalises plugin object entries and freezes options', async () => {
    const plugin = vi.fn(async () => {});
    const importer = vi.fn(async () => ({ register: plugin }));

    await loadTransformDefinitionRegistry({
      ...baseOptions,
      plugins: [
        {
          module: '  ./plugins/transform.js  ',
          register: '  register  ',
          options: { flag: true },
        },
      ],
      importModule: importer,
    });

    const expectedSpecifier = pathToFileURL(
      path.resolve(baseOptions.configDirectory, './plugins/transform.js'),
    ).href;

    expect(importer).toHaveBeenCalledWith(expectedSpecifier);
    expect(plugin).toHaveBeenCalledTimes(1);
    const call = plugin.mock.calls[0]?.[0];
    expect(call?.options).toEqual({ flag: true });
    expect(Object.isFrozen(call?.options)).toBe(true);
  });

  it('rejects plugin objects with non-string register values', async () => {
    await expect(
      loadTransformDefinitionRegistry({
        ...baseOptions,
        plugins: [{ module: 'example-plugin', register: 123 as never }],
        importModule: vi.fn(),
      }),
    ).rejects.toThrow('Transform plugin "register" field must be a string when provided.');
  });

  it('rejects plugin objects with non-object options', async () => {
    await expect(
      loadTransformDefinitionRegistry({
        ...baseOptions,
        plugins: [{ module: 'example-plugin', options: ['invalid'] as never }],
        importModule: vi.fn(),
      }),
    ).rejects.toThrow('Transform plugin "options" field must be an object when provided.');
  });

  it('rejects empty plugin specifier strings', async () => {
    await expect(
      loadTransformDefinitionRegistry({
        ...baseOptions,
        plugins: ['   '],
        importModule: vi.fn(),
      }),
    ).rejects.toThrow('Transform plugin specifiers must be non-empty strings.');
  });

  it('rejects plugin entries that are not strings or objects', async () => {
    await expect(
      loadTransformDefinitionRegistry({
        ...baseOptions,
        plugins: [42 as never],
        importModule: vi.fn(),
      }),
    ).rejects.toThrow('Transform plugin entries must be strings or objects with a "module" field.');
  });

  it('rejects named plugin exports that are not functions', async () => {
    await expect(
      loadTransformDefinitionRegistry({
        ...baseOptions,
        plugins: [{ module: 'example-plugin', register: 'register' }],
        importModule: vi.fn(async () => ({ register: {} }) as never),
      }),
    ).rejects.toThrow('Transform plugin export "register" from example-plugin must be a function.');
  });

  it('rejects modules without register functions', async () => {
    await expect(
      loadTransformDefinitionRegistry({
        ...baseOptions,
        plugins: ['example-plugin'],
        importModule: vi.fn(async () => ({})),
      }),
    ).rejects.toThrow(
      'Transform plugin module example-plugin must export a function named "registerTransforms" or a default function export.',
    );
  });
});

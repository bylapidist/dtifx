import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { BuildConfig } from '../../config/index.js';
import { loadDependencyStrategyRegistry } from './dependencies.js';

const baseOptions = {
  config: {} as BuildConfig,
  configDirectory: '/workspace/config',
  configPath: '/workspace/config/dtifx.config.mjs',
} as const;

describe('loadDependencyStrategyRegistry', () => {
  it('allows bare package names for dependency strategy plugins', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));

    await loadDependencyStrategyRegistry({
      ...baseOptions,
      plugins: ['example-dependency-plugin'],
      importModule: importer,
    });

    expect(importer).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledWith('example-dependency-plugin');
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('resolves relative dependency strategy plugin paths against the configuration directory', async () => {
    const plugin = vi.fn();
    const importer = vi.fn(async () => ({ default: plugin }));

    await loadDependencyStrategyRegistry({
      ...baseOptions,
      plugins: ['./plugins/dependencies.js'],
      importModule: importer,
    });

    const expectedSpecifier = pathToFileURL(
      path.resolve(baseOptions.configDirectory, './plugins/dependencies.js'),
    ).href;

    expect(importer).toHaveBeenCalledWith(expectedSpecifier);
    expect(plugin).toHaveBeenCalledTimes(1);
  });

  it('rejects dependency strategy plugin specifiers that use unsupported protocols', async () => {
    const importer = vi.fn();

    await expect(
      loadDependencyStrategyRegistry({
        ...baseOptions,
        plugins: ['data:text/javascript,export default {}'],
        importModule: importer,
      }),
    ).rejects.toThrow(
      'Dependency strategy plugin module specifiers must be bare package names or filesystem paths. ' +
        'Received "data:text/javascript,export default {}".',
    );

    expect(importer).not.toHaveBeenCalled();
  });
});

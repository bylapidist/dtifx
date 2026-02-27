import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, resolveConfigPath } from './config-loader.js';
import { getFormatterConfigEntries } from './formatters.js';

describe('config-loader', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'dtifx-build-config-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('resolves the provided configuration path when present', async () => {
    const customConfigPath = path.join(workspace, 'custom.config.json');
    await writeConfig(customConfigPath);

    const resolved = await resolveConfigPath({ cwd: workspace, configPath: 'custom.config.json' });

    expect(resolved).toBe(customConfigPath);
  });

  it('discovers default configuration files when no override is provided', async () => {
    const defaultConfigPath = path.join(workspace, 'dtifx.config.json');
    await writeConfig(defaultConfigPath);

    const resolved = await resolveConfigPath({ cwd: workspace });

    expect(resolved).toBe(defaultConfigPath);
  });

  it('loads and normalises configuration data from disk', async () => {
    const configPath = path.join(workspace, 'dtifx.config.json');
    await writeConfig(configPath, {
      sources: [
        {
          kind: 'file',
          id: 'tokens',
          layer: 'base',
          pointerTemplate: {
            segments: ['tokens', { kind: 'placeholder', name: 'relative' }],
          },
          patterns: ['tokens/**/*.json'],
          rootDir: './tokens',
        },
      ],
      formatters: [
        {
          name: 'preview',
          output: { directory: './dist' },
        },
      ],
    });

    const loaded = await loadConfig(configPath);

    expect(loaded.path).toBe(configPath);
    expect(loaded.directory).toBe(workspace);
    expect(loaded.config.layers).toHaveLength(1);
    expect(loaded.config.layers[0]?.name).toBe('base');
    expect(loaded.config.sources).toHaveLength(1);

    const source = loaded.config.sources[0];
    if (!source || source.kind !== 'file') {
      throw new Error('expected file source');
    }
    expect(source.rootDir).toBe(path.resolve(workspace, 'tokens'));

    const formatter = getFormatterConfigEntries(loaded.config)?.[0];
    expect(formatter?.output.directory).toBe('./dist');
  });

  it('maps missing default config errors to build-specific messaging', async () => {
    await expect(resolveConfigPath({ cwd: workspace })).rejects.toThrow(
      'Unable to locate dtifx-build configuration file in the current directory.',
    );
  });

  it('preserves explicit path resolution errors when a configPath is provided', async () => {
    await expect(
      resolveConfigPath({ cwd: workspace, configPath: 'missing.config.json' }),
    ).rejects.toThrow('Configuration file not found: missing.config.json');
  });

  it('loads plugin-based sections and normalises formatter outputs', async () => {
    const configPath = path.join(workspace, 'dtifx.config.json');
    await writeConfig(configPath, {
      formatters: {
        entries: [
          {
            name: 'tokens.docs',
          },
        ],
        plugins: ['@acme/formatter-plugin', { module: '@acme/formatter-module', register: 'init' }],
      },
      transforms: {
        entries: [
          {
            name: 'token.rename',
            options: { prefix: 'web' },
          },
        ],
        plugins: ['@acme/transform-plugin'],
      },
      dependencies: {
        strategy: { name: 'default' },
        plugins: ['@acme/dependency-plugin'],
      },
      audit: {
        policies: [{ name: 'tokens.no-orphans' }],
        plugins: ['@acme/audit-plugin'],
      },
    });

    const loaded = await loadConfig(configPath);
    const formatterEntries = getFormatterConfigEntries(loaded.config);

    expect(formatterEntries).toEqual([
      {
        name: 'tokens.docs',
        output: {},
      },
    ]);

    expect(loaded.config.formatters).toMatchObject({
      plugins: ['@acme/formatter-plugin', { module: '@acme/formatter-module', register: 'init' }],
    });
    expect(loaded.config.transforms).toMatchObject({
      entries: [{ name: 'token.rename', options: { prefix: 'web' } }],
      plugins: ['@acme/transform-plugin'],
    });
    expect(loaded.config.dependencies).toMatchObject({
      strategy: { name: 'default' },
      plugins: ['@acme/dependency-plugin'],
    });
    expect(loaded.config.audit).toMatchObject({
      policies: [{ name: 'tokens.no-orphans' }],
      plugins: ['@acme/audit-plugin'],
    });
  });
  it('defaults file source root directories to the configuration directory', async () => {
    const configPath = path.join(workspace, 'dtifx.config.json');
    await writeConfig(configPath);

    const loaded = await loadConfig(configPath);

    const source = loaded.config.sources[0];
    if (!source || source.kind !== 'file') {
      throw new Error('expected file source');
    }

    expect(source.rootDir).toBe(workspace);
  });
});

/**
 * Optional overrides used to customise the configuration payload written during tests.
 */
interface PartialConfigOverrides {
  readonly sources?: readonly unknown[];
  readonly formatters?: unknown;
  readonly transforms?: unknown;
  readonly dependencies?: unknown;
  readonly audit?: unknown;
}

/**
 * Writes a minimal dtifx-build configuration file to disk for integration-style tests.
 * @param {string} filePath - Destination for the temporary configuration file.
 * @param {PartialConfigOverrides} [overrides] - Optional overrides to customise the base config.
 */
async function writeConfig(
  filePath: string,
  overrides: PartialConfigOverrides = {},
): Promise<void> {
  const config = {
    layers: [{ name: 'base' }],
    sources: overrides.sources ?? [
      {
        kind: 'file',
        id: 'tokens',
        layer: 'base',
        pointerTemplate: {
          segments: ['tokens', { kind: 'placeholder', name: 'relative' }],
        },
        patterns: ['tokens/**/*.json'],
      },
    ],
    formatters:
      overrides.formatters ??
      ({
        entries: [
          {
            name: 'preview',
            output: { directory: './dist' },
          },
        ],
      } satisfies Record<string, unknown>),
    ...(overrides.transforms ? { transforms: overrides.transforms } : {}),
    ...(overrides.dependencies ? { dependencies: overrides.dependencies } : {}),
    ...(overrides.audit ? { audit: overrides.audit } : {}),
  } satisfies Record<string, unknown>;

  await writeFile(filePath, `${JSON.stringify(config, undefined, 2)}\n`, 'utf8');
}

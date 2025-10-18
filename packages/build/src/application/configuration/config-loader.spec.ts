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
  } satisfies Record<string, unknown>;

  await writeFile(filePath, `${JSON.stringify(config, undefined, 2)}\n`, 'utf8');
}

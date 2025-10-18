import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfigModule, resolveConfigPath } from './index.js';

describe('config-loader (core)', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'dtifx-core-config-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('resolves the provided configuration path when present', async () => {
    const customConfigPath = path.join(workspace, 'custom.config.json');
    await writeJsonConfig(customConfigPath, {});

    const resolved = await resolveConfigPath({ cwd: workspace, configPath: 'custom.config.json' });

    expect(resolved).toBe(customConfigPath);
  });

  it('allows overriding search candidates while still honouring configPath', async () => {
    const customConfigPath = path.join(workspace, 'custom.config.json');
    await writeJsonConfig(customConfigPath, {});

    const resolved = await resolveConfigPath({
      cwd: workspace,
      configPath: 'custom.config.json',
      candidates: ['dtifx.config.js'],
    });

    expect(resolved).toBe(customConfigPath);
  });

  it('discovers default configuration files when no override is provided', async () => {
    const defaultConfigPath = path.join(workspace, 'dtifx.config.json');
    await writeJsonConfig(defaultConfigPath, {});

    const resolved = await resolveConfigPath({ cwd: workspace });

    expect(resolved).toBe(defaultConfigPath);
  });

  it('loads configuration modules and resolves function exports', async () => {
    const configPath = path.join(workspace, 'dtifx.config.json');
    await writeJsonConfig(configPath, { message: 'hello' });

    const loaded = await loadConfigModule<{ message: string }>({ path: configPath });

    expect(loaded.path).toBe(configPath);
    expect(loaded.directory).toBe(workspace);
    expect(loaded.config.message).toBe('hello');
  });

  it('supports JavaScript modules exporting async factories', async () => {
    const configPath = path.join(workspace, 'dtifx.config.mjs');
    await writeFile(
      configPath,
      String.raw`export const config = async () => ({
  greeting: 'hi',
});
`,
      'utf8',
    );

    const loaded = await loadConfigModule<{ greeting: string }>({ path: configPath });

    expect(loaded.path).toBe(configPath);
    expect(loaded.directory).toBe(workspace);
    expect(loaded.config.greeting).toBe('hi');
  });
});

async function writeJsonConfig(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value), 'utf8');
}

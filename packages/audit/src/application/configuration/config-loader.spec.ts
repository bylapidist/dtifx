import { describe, expect, it, vi } from 'vitest';

const { resolveConfigPathMock, loadConfigModuleMock } = vi.hoisted(() => ({
  resolveConfigPathMock: vi.fn(async () => '/project/dtifx.config.mjs'),
  loadConfigModuleMock: vi.fn(async () => ({
    path: '/project/dtifx.config.mjs',
    directory: '/project',
    config: { audit: { policies: [] } },
  })),
}));

vi.mock('@dtifx/core/config', () => ({
  resolveConfigPath: resolveConfigPathMock,
  loadConfigModule: loadConfigModuleMock,
}));

import { loadAuditConfiguration, resolveAuditConfigPath } from './config-loader.js';

describe('resolveAuditConfigPath', () => {
  it('delegates to the shared config resolver', async () => {
    const path = await resolveAuditConfigPath({ configPath: './dtifx.config.mjs' });

    expect(resolveConfigPathMock).toHaveBeenCalledWith({ configPath: './dtifx.config.mjs' });
    expect(path).toBe('/project/dtifx.config.mjs');
  });
});

describe('loadAuditConfiguration', () => {
  it('loads the configuration module and returns audit metadata', async () => {
    const loaded = await loadAuditConfiguration({ path: '/project/dtifx.config.mjs' });

    expect(loadConfigModuleMock).toHaveBeenCalledWith({ path: '/project/dtifx.config.mjs' });
    expect(loaded).toEqual({
      path: '/project/dtifx.config.mjs',
      directory: '/project',
      config: { audit: { policies: [] } },
    });
  });

  it('throws when the module exports a non-object value', async () => {
    loadConfigModuleMock.mockResolvedValueOnce({
      path: '/project/dtifx.config.mjs',
      directory: '/project',
      config: undefined,
    });

    await expect(
      loadAuditConfiguration({ path: '/project/dtifx.config.mjs' }),
    ).rejects.toThrowError(
      'Configuration at /project/dtifx.config.mjs must export an object or promise resolving to an object.',
    );
  });
});

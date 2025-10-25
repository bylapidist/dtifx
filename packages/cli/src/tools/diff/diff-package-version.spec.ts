import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateRequire = vi.hoisted(() => vi.fn<(specifier: string | URL) => StubRequire>());

vi.mock('node:module', () => ({
  createRequire: mockCreateRequire,
}));

import { loadDiffPackageVersion } from './diff-package-version.js';

type StubRequire = NodeRequire & {
  setManifest(manifestPath: string, manifest: unknown): void;
};

const createStubRequire = (): StubRequire => {
  const manifests = new Map<string, unknown>();
  const requireImplementation = ((request: string) => {
    if (!manifests.has(request)) {
      throw Object.assign(new Error(`Cannot find module ${request}`), { code: 'MODULE_NOT_FOUND' });
    }
    return manifests.get(request);
  }) as NodeRequire;

  const resolve = vi.fn((specifier: string) => {
    if (specifier === '@dtifx/diff') {
      return '/virtual/node_modules/@dtifx/diff/dist/index.js';
    }
    throw new Error(`Cannot resolve ${specifier}`);
  });

  const stubRequire = Object.assign(requireImplementation, {
    cache: Object.create(null),
    extensions: Object.create(null),
    main: undefined,
    resolve,
    setManifest: (manifestPath: string, manifest: unknown) => {
      manifests.set(manifestPath, manifest);
    },
  });

  return stubRequire;
};

describe('loadDiffPackageVersion', () => {
  beforeEach(() => {
    mockCreateRequire.mockReset();
  });

  it('returns the installed @dtifx/diff version when available', () => {
    const stubRequire = createStubRequire();
    stubRequire.setManifest('/virtual/node_modules/@dtifx/diff/package.json', {
      name: '@dtifx/diff',
      version: '1.2.3',
    });

    mockCreateRequire.mockReturnValue(stubRequire);

    expect(loadDiffPackageVersion()).toBe('1.2.3');
    expect(stubRequire.resolve).toHaveBeenCalledWith('@dtifx/diff');
  });

  it('walks up directories until it finds the package manifest', () => {
    const stubRequire = createStubRequire();
    mockCreateRequire.mockReturnValue(stubRequire);
    vi.mocked(stubRequire.resolve).mockReturnValue(
      '/virtual/node_modules/@dtifx/diff/lib/index.js',
    );

    stubRequire.setManifest('/virtual/node_modules/@dtifx/diff/package.json', {
      name: '@dtifx/diff',
      version: '9.9.9',
    });

    expect(loadDiffPackageVersion()).toBe('9.9.9');
  });

  it('returns undefined when the package cannot be resolved', () => {
    const stubRequire = createStubRequire();
    mockCreateRequire.mockReturnValue(stubRequire);
    vi.mocked(stubRequire.resolve).mockImplementation(() => {
      throw new Error('missing package');
    });

    expect(loadDiffPackageVersion()).toBeUndefined();
  });
});

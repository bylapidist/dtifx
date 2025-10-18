import type { Stats } from 'node:fs';
import { mkdtemp, readFile as fsReadFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { pointerTemplate, placeholder } from './config.js';
import { DefaultSourceRepository } from './default-source-repository.js';
import type { TokenSourceDiscoveryContext } from './repository.js';

describe('DefaultSourceRepository', () => {
  it('discovers file sources and parses documents', async () => {
    const repository = new DefaultSourceRepository({
      glob: vi.fn().mockResolvedValue(['/workspace/project/tokens.json']),
      readFile: vi.fn().mockResolvedValue('{"collections":{}}'),
      lstat: vi.fn().mockResolvedValue({ isSymbolicLink: () => false } as Stats),
      cwd: () => '/workspace/project',
    });

    const context: TokenSourceDiscoveryContext = {
      layer: { name: 'foundation' },
      source: {
        kind: 'file',
        id: 'tokens',
        layer: 'foundation',
        pointerTemplate: pointerTemplate(placeholder('source')),
        patterns: ['tokens.json'],
      },
    };

    const result = await repository.discover(context);

    expect(result.issues).toHaveLength(0);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      uri: 'file:///workspace/project/tokens.json',
      pointerPrefix: '#/tokens',
      context: {
        pointerPrefix: '#/tokens',
        uri: 'file:///workspace/project/tokens.json',
        sourceId: 'tokens',
      },
    });
  });

  it('ignores symbolic links that resolve outside the root', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'dtifx-core-source-root-'));
    const outsideDir = await mkdtemp(path.join(tmpdir(), 'dtifx-core-outside-'));
    const outsideFile = path.join(outsideDir, 'external.json');
    await writeFile(outsideFile, '{"collections":{}}', 'utf8');

    const insideFile = path.join(rootDir, 'tokens.json');
    await writeFile(insideFile, '{"collections":{}}', 'utf8');

    const symlinkPath = path.join(rootDir, 'symlink.json');
    await symlink(outsideFile, symlinkPath);

    const readFile = vi.fn((filePath: string, encoding: BufferEncoding) =>
      fsReadFile(filePath, encoding),
    );

    const repository = new DefaultSourceRepository({
      glob: vi.fn().mockResolvedValue([insideFile, symlinkPath]),
      readFile,
      cwd: () => rootDir,
    });

    const context: TokenSourceDiscoveryContext = {
      layer: { name: 'foundation' },
      source: {
        kind: 'file',
        id: 'tokens',
        layer: 'foundation',
        pointerTemplate: pointerTemplate(placeholder('stem')),
        patterns: ['**/*.json'],
      },
    };

    const result = await repository.discover(context);

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith(expect.stringContaining('tokens.json'), 'utf8');
    expect(result.issues).toHaveLength(0);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      uri: pathToFileURL(insideFile).toString(),
    });
  });

  it('reports virtual source errors when document loader throws', async () => {
    const repository = new DefaultSourceRepository();

    const context: TokenSourceDiscoveryContext = {
      layer: { name: 'virtual' },
      source: {
        kind: 'virtual',
        id: 'design',
        layer: 'virtual',
        pointerTemplate: pointerTemplate(placeholder('source')),
        document: vi.fn().mockRejectedValue(new Error('boom')),
      },
    };

    const result = await repository.discover(context);

    expect(result.documents).toHaveLength(0);
    expect(result.issues).toEqual([
      expect.objectContaining({
        kind: 'repository',
        code: 'virtual-error',
        sourceId: 'design',
        uri: 'virtual:design',
      }),
    ]);
  });
});

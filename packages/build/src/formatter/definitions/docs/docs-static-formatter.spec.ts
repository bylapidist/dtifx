import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import type { JsonPointer } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import type { BuildConfig } from '../../../config/index.js';
import type { BuildTokenSnapshot } from '../../../domain/models/tokens.js';
import type { FormatterToken } from '../../formatter-registry.js';
import { createDocsStaticFormatterFactory } from './docs-static-formatter.js';

function createFormatterToken(
  pointer: JsonPointer,
  assetPath: string,
  baseUri: string,
): FormatterToken {
  const snapshot = {
    pointer,
    token: {
      id: 'color.primary',
      pointer,
      type: 'color',
      value: {
        colorSpace: 'srgb',
        components: [1, 0, 0],
        preview: { url: './swatch.svg' },
      },
    },
    metadata: { description: 'Primary brand color', tags: ['brand'] },
    resolution: { type: 'color', value: '#ff0000' },
    provenance: {
      sourceId: 'design-tokens',
      layer: 'foundation',
      layerIndex: 0,
      uri: baseUri,
      pointerPrefix: '#/tokens',
    },
    context: { theme: 'foundation' },
  } as unknown as BuildTokenSnapshot;

  const rawValue = {
    colorSpace: 'srgb',
    components: [1, 0, 0],
    preview: { url: './swatch.svg' },
  };

  return {
    snapshot,
    pointer,
    type: 'color',
    value: rawValue,
    raw: rawValue,
    metadata: snapshot.metadata,
    transforms: new Map<string, unknown>([
      ['css', { value: 'var(--color-primary)', swatch: 'url("./swatch.svg")', assetPath }],
    ]),
  } satisfies FormatterToken;
}

function parseDocsModel(script: string): unknown {
  const [, rhs] = script.split('=', 2);
  if (!rhs) {
    throw new Error('Documentation data script is malformed.');
  }
  const trimmed = rhs.trim();
  const json = trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
  return JSON.parse(json);
}

describe('createDocsStaticFormatterFactory', () => {
  it('emits a static documentation bundle with copied assets', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'docs-static-'));
    const assetPath = path.join(tempDir, 'swatch.svg');
    await writeFile(
      assetPath,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
      'utf8',
    );
    const provenanceUri = pathToFileURL(path.join(tempDir, 'tokens.json')).toString();

    const factory = createDocsStaticFormatterFactory();
    const entry = { name: 'docs.static', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const pointer = '#/tokens/library/color/primary' as JsonPointer;
    const token = createFormatterToken(pointer, assetPath, provenanceUri);

    try {
      const artifacts = await definition.run({ tokens: [token] });

      const paths = artifacts.map((artifact) => artifact.path);
      expect(paths).toEqual(
        expect.arrayContaining([
          'index.html',
          'assets/app.js',
          'assets/styles.css',
          'assets/docs-data.js',
        ]),
      );
      const mediaArtifacts = paths.filter((artifactPath) =>
        artifactPath.startsWith('assets/media/'),
      );
      expect(mediaArtifacts.length).toBe(1);

      const dataArtifact = artifacts.find((artifact) => artifact.path === 'assets/docs-data.js');
      expect(dataArtifact?.encoding).toBe('utf8');
      const model = parseDocsModel(String(dataArtifact?.contents)) as {
        readonly tokenCount: number;
        readonly assets: readonly { readonly outputPath: string; readonly status: string }[];
      };
      expect(model.tokenCount).toBe(1);
      expect(model.assets).toEqual([expect.objectContaining({ status: 'copied' })]);

      const html = String(
        artifacts.find((artifact) => artifact.path === 'index.html')?.contents ?? '',
      );
      expect(html).toContain('assets/styles.css');
      expect(html).toContain('assets/app.js');

      const assetArtifact = artifacts.find((artifact) => artifact.path.startsWith('assets/media/'));
      expect(assetArtifact?.encoding).toBe('buffer');
      expect(Buffer.from(assetArtifact?.contents as Uint8Array).toString()).toContain('<svg');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('honours custom title and description options', async () => {
    const factory = createDocsStaticFormatterFactory();
    const entry = {
      name: 'docs.static',
      output: {},
      options: { title: 'Token Atlas', description: 'Brand documentation bundle' },
    };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const pointer = '#/tokens/example' as JsonPointer;
    const provenanceUri = pathToFileURL(path.join(tmpdir(), 'tokens.json')).toString();
    const token = createFormatterToken(pointer, path.join(tmpdir(), 'missing.svg'), provenanceUri);

    const artifacts = await definition.run({ tokens: [token] });
    const html = String(
      artifacts.find((artifact) => artifact.path === 'index.html')?.contents ?? '',
    );
    expect(html).toContain('Token Atlas');
    expect(html).toContain('Brand documentation bundle');

    const dataArtifact = artifacts.find((artifact) => artifact.path === 'assets/docs-data.js');
    const model = parseDocsModel(String(dataArtifact?.contents)) as {
      readonly modelTitle: string | undefined;
      readonly title: string;
      readonly description?: string;
    };
    expect(model).toMatchObject({
      title: 'Token Atlas',
      description: 'Brand documentation bundle',
    });
  });
});

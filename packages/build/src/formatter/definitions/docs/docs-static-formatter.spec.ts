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
  transformEntries?: readonly (readonly [string, unknown])[],
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

  const transforms = transformEntries ?? [
    ['css', { value: 'var(--color-primary)', swatch: 'url("./swatch.svg")', assetPath }],
  ];

  return {
    snapshot,
    pointer,
    type: 'color',
    value: rawValue,
    raw: rawValue,
    metadata: snapshot.metadata,
    transforms: new Map<string, unknown>(transforms),
  } satisfies FormatterToken;
}

function parseDocsModel(script: string): unknown {
  const marker = '__DTIFX_DOCS__';
  const markerIndex = script.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error('Documentation data script is malformed.');
  }
  const equalsIndex = script.indexOf('=', markerIndex);
  if (equalsIndex === -1) {
    throw new Error('Documentation data script is malformed.');
  }
  const trimmed = script.slice(equalsIndex + 1).trim();
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

  it('includes code snippets for supported transform outputs', async () => {
    const factory = createDocsStaticFormatterFactory();
    const entry = { name: 'docs.static', output: {} };
    const context = { config: {} as BuildConfig };
    const definition = factory.create(entry, context);

    const pointer = '#/tokens/library/color/snippet' as JsonPointer;
    const provenanceUri = pathToFileURL(path.join(tmpdir(), 'tokens.json')).toString();
    const transforms: readonly (readonly [string, unknown])[] = [
      [
        'color.toCss',
        {
          srgbHex: '#3366ff',
          oklch: { l: 0.6, c: 0.2, h: 250, css: 'oklch(0.6000 0.2000 250.0000)' },
          relativeLuminance: 0.33,
        },
      ],
      ['color.toSwiftUIColor', { red: 0.2, green: 0.4, blue: 0.9, opacity: 1, hex: '#3366ff' }],
      ['color.toAndroidComposeColor', { argbHex: '#ff3366ff', hexLiteral: '0xFF3366FF' }],
    ];
    const token = createFormatterToken(
      pointer,
      path.join(tmpdir(), 'snippet.svg'),
      provenanceUri,
      transforms,
    );

    const artifacts = await definition.run({ tokens: [token] });
    const dataArtifact = artifacts.find((artifact) => artifact.path === 'assets/docs-data.js');
    const model = parseDocsModel(String(dataArtifact?.contents)) as {
      readonly groups: readonly {
        readonly type: string;
        readonly tokens: readonly {
          readonly pointer: string;
          readonly examples: readonly {
            readonly transform?: string;
            readonly snippets?: readonly {
              readonly language: string;
              readonly code: string;
            }[];
          }[];
        }[];
      }[];
    };

    const group = model.groups.find((candidate) => candidate.type === 'color');
    expect(group).toBeDefined();
    const entryWithSnippets = group?.tokens.find((candidate) => candidate.pointer === pointer);
    expect(entryWithSnippets).toBeDefined();

    const cssExample = entryWithSnippets?.examples.find(
      (example) => example.transform === 'color.toCss',
    );
    expect(cssExample?.snippets?.[0]).toEqual(
      expect.objectContaining({
        language: 'css',
        code: expect.stringContaining('--tokens-library-color-snippet'),
      }),
    );

    const swiftExample = entryWithSnippets?.examples.find(
      (example) => example.transform === 'color.toSwiftUIColor',
    );
    expect(swiftExample?.snippets?.[0]).toEqual(
      expect.objectContaining({
        language: 'swift',
        code: expect.stringContaining('Color('),
      }),
    );

    const composeExample = entryWithSnippets?.examples.find(
      (example) => example.transform === 'color.toAndroidComposeColor',
    );
    expect(composeExample?.snippets?.[0]).toEqual(
      expect.objectContaining({
        language: 'kotlin',
        code: expect.stringContaining('Color(0xFF3366FF)'),
      }),
    );
  });
});

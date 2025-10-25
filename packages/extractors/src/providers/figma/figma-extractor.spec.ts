import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractFigmaTokens } from './figma-extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDirectory = path.resolve(__dirname, '../../../tests/fixtures/figma');

const loadFixture = async (name: string): Promise<unknown> => {
  const filePath = path.join(fixturesDirectory, `${name}.json`);
  const contents = await readFile(filePath, 'utf8');
  return JSON.parse(contents) as unknown;
};

const createResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  }) as Response;

const resolveRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return (input as Request).url;
};

interface NodesFixture {
  nodes?: Record<string, { document?: unknown } | undefined>;
}

describe('extractFigmaTokens', () => {
  const fileKey = 'test-file-key';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  it('converts Figma styles into DTIF token documents', async () => {
    const fileFixture = await loadFixture('file');
    const nodesFixture = await loadFixture('nodes');

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = resolveRequestUrl(input);
      if (url.includes(`/v1/files/${fileKey}/nodes`)) {
        return createResponse(nodesFixture);
      }
      if (url.includes(`/v1/files/${fileKey}`)) {
        return createResponse(fileFixture);
      }
      throw new Error(`Unexpected request for ${url}`);
    });

    const { document, warnings } = await extractFigmaTokens({
      fileKey,
      personalAccessToken: 'token',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(warnings).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const colorToken = (document as Record<string, any>).color?.surface?.background;
    expect(colorToken?.$type).toBe('color');
    expect(colorToken?.$value?.components).toEqual([0.125, 0.2, 0.35]);
    expect(colorToken?.$value?.alpha).toBeCloseTo(0.76, 2);
    expect(colorToken?.$extensions?.['net.lapidist.sources.figma']).toMatchObject({
      styleKey: 'color-style-key',
      nodeId: '1:3',
    });

    const gradientToken = (document as Record<string, any>).gradient?.hero?.primary;
    expect(gradientToken?.$type).toBe('gradient');
    expect(gradientToken?.$value?.gradientType).toBe('linear');
    expect(gradientToken?.$value?.stops).toHaveLength(3);
    expect(gradientToken?.$value?.angle).toBeGreaterThan(0);

    const typographyToken = (document as Record<string, any>).typography?.heading?.h1;
    expect(typographyToken?.$type).toBe('typography');
    expect(typographyToken?.$value?.fontFamily).toBe('inter');
    expect(typographyToken?.$value?.fontSize).toMatchObject({ unit: 'px', value: 24 });
    expect(typographyToken?.$value?.color?.hex).toBe('#F23333');

    const assetToken = (document as Record<string, any>).asset?.illustration?.hero;
    expect(assetToken?.$type).toBe('string');
    expect(assetToken?.$value).toMatch(`https://api.figma.com/v1/images/${fileKey}?`);
  });

  it('uses the provided API base URL when constructing image tokens', async () => {
    const fileFixture = await loadFixture('file');
    const nodesFixture = await loadFixture('nodes');
    const apiBaseUrl = 'https://proxy.example.com/api';
    const expectedBaseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`;

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = resolveRequestUrl(input);
      expect(url.startsWith(expectedBaseUrl)).toBe(true);
      if (url.includes(`/v1/files/${fileKey}/nodes`)) {
        return createResponse(nodesFixture);
      }
      if (url.includes(`/v1/files/${fileKey}`)) {
        return createResponse(fileFixture);
      }
      throw new Error(`Unexpected request for ${url}`);
    });

    const { document } = await extractFigmaTokens({
      fileKey,
      personalAccessToken: 'token',
      fetch: fetchMock as unknown as typeof fetch,
      apiBaseUrl,
    });

    const assetToken = (document as Record<string, any>).asset?.illustration?.hero;
    expect(assetToken?.$type).toBe('string');
    expect(assetToken?.$value).toMatch(`${expectedBaseUrl}v1/images/${fileKey}?`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('records warnings when styles cannot be resolved', async () => {
    const fileFixture = await loadFixture('file');
    const nodesFixture = await loadFixture('nodes');
    const partialNodes: NodesFixture = {
      nodes: {
        '1:3': (nodesFixture as NodesFixture).nodes?.['1:3'],
      },
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = resolveRequestUrl(input);
      if (url.includes(`/v1/files/${fileKey}/nodes`)) {
        return createResponse(partialNodes);
      }
      if (url.includes(`/v1/files/${fileKey}`)) {
        return createResponse(fileFixture);
      }
      throw new Error(`Unexpected request for ${url}`);
    });

    const result = await extractFigmaTokens({
      fileKey,
      personalAccessToken: 'token',
      fetch: fetchMock as unknown as typeof fetch,
      nodeIds: ['1:3', '2:5'],
    });

    expect(result.document.color?.surface?.background).toBeDefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing-style-node' })]),
    );
  });

  it('normalises style data and surfaces warnings for unsupported paints', async () => {
    const fileFixture = {
      styles: {
        'base-color': {
          key: 'base-color',
          name: 'Color',
          style_type: 'FILL',
          node_id: '1:0',
          description: 'Top-level color token',
        },
        'accent-color': {
          key: 'accent-color',
          name: 'Color / Accent Primary',
          style_type: 'FILL',
          node_id: '1:1',
        },
        'radial-gradient': {
          key: 'radial-gradient',
          name: 'Gradient / Hero / Primary',
          style_type: 'FILL',
          node_id: '1:2',
        },
        'image-asset': {
          key: 'image-asset',
          name: 'Asset // Logo   Hero',
          style_type: 'FILL',
          node_id: '1:3',
        },
        'missing-paint': {
          key: 'missing-paint',
          name: 'Color/Missing',
          style_type: 'FILL',
          node_id: '1:4',
        },
        'unsupported-paint': {
          key: 'unsupported-paint',
          name: 'Color/Video',
          style_type: 'FILL',
          node_id: '1:5',
        },
        'detailed-text': {
          key: 'detailed-text',
          name: 'Typography/Heading/Accent',
          style_type: 'TEXT',
          node_id: '1:6',
        },
        'missing-text-style': {
          key: 'missing-text-style',
          name: 'Typography/Broken',
          style_type: 'TEXT',
          node_id: '1:7',
        },
        'gradient-without-stops': {
          key: 'gradient-without-stops',
          name: 'Gradient/Empty',
          style_type: 'FILL',
          node_id: '1:8',
        },
        'text-without-fill': {
          key: 'text-without-fill',
          name: 'Typography/NoFill',
          style_type: 'TEXT',
          node_id: '1:9',
        },
        'unsupported-style': {
          key: 'unsupported-style',
          name: 'Effect/Drop Shadow',
          style_type: 'EFFECT',
        },
      },
    } satisfies Record<string, unknown>;

    const nodesFixture: NodesFixture = {
      nodes: {
        '1:0': {
          document: {
            id: '1:0',
            fills: [
              {
                type: 'SOLID',
                color: { r: 0.4, g: 0.2, b: 0.1 },
              },
            ],
          },
        },
        '1:1': {
          document: {
            id: '1:1',
            fills: [
              {
                type: 'SOLID',
                color: { r: 2, g: -1, b: 0.5 },
                opacity: 1.5,
              },
            ],
          },
        },
        '1:2': {
          document: {
            id: '1:2',
            fills: [
              {
                type: 'GRADIENT_DIAMOND',
                opacity: 0.5,
                gradientStops: [
                  { position: -0.25, color: { r: 0, g: 0.2, b: 0.4, a: 0.8 } },
                  { position: 0.75 },
                  { position: 1.25, color: { r: 1, g: 1, b: 1 } },
                ],
                gradientHandlePositions: [
                  { x: 0.1, y: 0.2 },
                  { x: 0.4, y: 0.9 },
                ],
              },
            ],
          },
        },
        '1:3': {
          document: {
            id: '1:3',
            fills: [
              { type: 'IMAGE', imageRef: 'ignored', visible: false },
              { type: 'IMAGE', imageRef: 'visible-image', visible: true },
            ],
          },
        },
        '1:4': {
          document: {
            id: '1:4',
            fills: 'MIXED',
          },
        },
        '1:5': {
          document: {
            id: '1:5',
            fills: [
              {
                type: 'VIDEO',
                visible: true,
              },
            ],
          },
        },
        '1:6': {
          document: {
            id: '1:6',
            style: {
              fontName: { family: 'Inter', style: 'Bold Italic' },
              fontWeight: 500,
              fontSize: 16,
              lineHeightPx: 20,
              letterSpacing: 12.3456,
              letterSpacingUnit: 'PERCENT',
              paragraphSpacing: 8,
              textCase: 'SMALL_CAPS_FORCED',
              textDecoration: 'STRIKETHROUGH',
            },
            fills: [
              { type: 'SOLID', visible: false },
              {
                type: 'SOLID',
                visible: true,
                color: { r: 0.8, g: 0.6, b: 0.4 },
                opacity: 0.3,
              },
            ],
          },
        },
        '1:7': {
          document: {
            id: '1:7',
            fills: [
              {
                type: 'SOLID',
                visible: true,
                color: { r: 0, g: 0, b: 0 },
              },
            ],
          },
        },
        '1:8': {
          document: {
            id: '1:8',
            fills: [
              {
                type: 'GRADIENT_LINEAR',
                gradientStops: [{ position: 0.25 }],
              },
            ],
          },
        },
        '1:9': {
          document: {
            id: '1:9',
            style: {
              fontSize: 10,
            },
            fills: [
              {
                type: 'GRADIENT_LINEAR',
                visible: true,
              },
            ],
          },
        },
      },
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = resolveRequestUrl(input);
      if (url.includes(`/v1/files/${fileKey}/nodes`)) {
        return createResponse(nodesFixture);
      }
      if (url.includes(`/v1/files/${fileKey}`)) {
        return createResponse(fileFixture);
      }
      throw new Error(`Unexpected request for ${url}`);
    });

    const { document, warnings } = await extractFigmaTokens({
      fileKey,
      personalAccessToken: 'token',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const accentColor = (document as Record<string, any>).color?.['accent-primary'];
    expect(accentColor?.$type).toBe('color');
    expect(accentColor?.$value?.components).toEqual([1, 0, 0.5]);
    expect(accentColor?.$value?.alpha).toBeUndefined();

    const gradientToken = (document as Record<string, any>).gradient?.hero?.primary;
    expect(gradientToken?.$type).toBe('gradient');
    expect(gradientToken?.$value?.gradientType).toBe('radial');
    expect(gradientToken?.$value?.stops).toHaveLength(2);
    expect(gradientToken?.$value?.angle).toBeGreaterThan(0);
    expect(gradientToken?.$value?.center).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });

    const assetToken = (document as Record<string, any>).asset?.['logo-hero'];
    expect(assetToken?.$type).toBe('string');
    expect(assetToken?.$value).toContain(`/v1/images/${fileKey}`);
    expect(assetToken?.$value).toContain('ids=1%3A3');

    const typographyToken = (document as Record<string, any>).typography?.heading?.accent;
    expect(typographyToken?.$value?.fontFamily).toBe('inter');
    expect(typographyToken?.$value?.fontStyle).toBe('Bold Italic');
    expect(typographyToken?.$value?.letterSpacing).toBe('12.3456%');
    expect(typographyToken?.$value?.textCase).toBe('small-caps-forced');
    expect(typographyToken?.$value?.textDecoration).toBe('line-through');
    expect(typographyToken?.$value?.color?.hex).toBe('#CC9966');
    expect(typographyToken?.$value?.color?.alpha).toBeCloseTo(0.3, 2);

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported-style-type' }),
        expect.objectContaining({ code: 'missing-style-paint' }),
        expect.objectContaining({ code: 'unsupported-paint' }),
        expect.objectContaining({ code: 'missing-text-style' }),
        expect.objectContaining({ code: 'missing-text-fill' }),
        expect.objectContaining({ code: 'unmapped-gradient' }),
      ]),
    );
  });
});

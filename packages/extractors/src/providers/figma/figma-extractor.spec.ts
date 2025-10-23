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
});

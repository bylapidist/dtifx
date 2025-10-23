import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { extractPenpotTokens } from './penpot-extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDirectory = path.resolve(__dirname, '../../../tests/fixtures/penpot');

const loadFixture = async (name: string): Promise<unknown> => {
  const filePath = path.join(fixturesDirectory, `${name}.json`);
  const contents = await readFile(filePath, 'utf8');
  return JSON.parse(contents) as unknown;
};

describe('extractPenpotTokens', () => {
  it('maps Penpot styles to DTIF tokens', async () => {
    const stylesFixture = await loadFixture('styles');
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => stylesFixture,
        }) as Response,
    );

    const { document, warnings } = await extractPenpotTokens({
      fileId: 'file-id',
      accessToken: 'token',
      apiBaseUrl: 'https://penpot.test/api/',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(warnings).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const colorToken = (document as Record<string, any>).color?.surface?.background;
    expect(colorToken?.$type).toBe('color');
    expect(colorToken?.$value?.components).toEqual([0.125, 0.25, 0.375]);
    expect(colorToken?.$value?.alpha).toBeCloseTo(0.8, 2);
    expect(colorToken?.$extensions?.['net.lapidist.sources.penpot']).toMatchObject({
      id: 'color-surface',
    });

    const gradientToken = (document as Record<string, any>).gradient?.hero?.primary;
    expect(gradientToken?.$value?.stops).toHaveLength(2);

    const typographyToken = (document as Record<string, any>).typography?.heading?.h1;
    expect(typographyToken?.$value?.fontFamily).toBe('Inter');
    expect(typographyToken?.$value?.color?.hex).toBe('#F23333');
  });

  it('captures warnings when responses are incomplete', async () => {
    const payload = {
      colors: [{ id: 'color-1', name: 'Color/Invalid' }],
      gradients: [{ id: 'gradient-1', name: 'Gradient/Invalid', kind: 'angular' }],
      typography: [{ id: 'typography-1', name: 'Typography/Invalid' }],
    };

    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => payload,
        }) as Response,
    );

    const result = await extractPenpotTokens({
      fileId: 'file-id',
      accessToken: 'token',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.document).toBeDefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-color-value' }),
        expect.objectContaining({ code: 'unsupported-gradient-type' }),
        expect.objectContaining({ code: 'missing-typography-value' }),
      ]),
    );
  });
});

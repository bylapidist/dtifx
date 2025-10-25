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

  it('normalises gradients and typography metadata with partial data', async () => {
    const payload = {
      colors: [
        {
          id: 'color-out-of-range',
          name: 'Color/OutOfRange',
          color: { r: 1.2, g: -0.1, b: 0.5, a: 2 },
        },
      ],
      gradients: [
        {
          id: 'gradient-partial',
          name: 'Gradient/Partial',
          kind: 'linear',
          angle: 47.1234,
          stops: [{ position: -0.25, color: { r: 0.1, g: 0.5, b: 1, a: 0.5 } }, { position: 1.75 }],
        },
      ],
      typography: [
        {
          id: 'typography-detailed',
          name: 'Typography/Detailed',
          fontFamily: 'Roboto',
          fontSize: 16,
          fontWeight: 575,
          lineHeight: 20,
          letterSpacing: 1.5,
          paragraphSpacing: 8,
          textCase: 'small-caps',
          textDecoration: 'strikethrough',
          color: { r: 0.2, g: 0.4, b: 0.6, a: 0.4 },
        },
      ],
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

    const { document, warnings } = await extractPenpotTokens({
      fileId: 'file-id',
      accessToken: 'token',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const colorToken = (document as Record<string, any>).color?.outofrange;
    expect(colorToken?.$value?.components).toEqual([1, 0, 0.5]);
    expect(colorToken?.$value?.alpha).toBeUndefined();

    const gradientToken = (document as Record<string, any>).gradient?.partial;
    expect(gradientToken?.$value?.stops).toHaveLength(1);
    expect(gradientToken?.$value?.angle).toBeCloseTo(47.1234, 6);

    const typographyToken = (document as Record<string, any>).typography?.detailed;
    expect(typographyToken?.$value?.fontFamily).toBe('Roboto');
    expect(typographyToken?.$value?.fontWeight).toBe(575);
    expect(typographyToken?.$value?.textCase).toBe('small-caps');
    expect(typographyToken?.$value?.textDecoration).toBe('line-through');
    expect(typographyToken?.$value?.color?.hex).toBe('#336699');
    expect(typographyToken?.$value?.color?.alpha).toBeCloseTo(0.4, 2);

    expect(warnings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing-gradient-stop' })]),
    );
  });

  it('throws when the Penpot API responds with an error status', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
        }) as Response,
    );

    await expect(
      extractPenpotTokens({
        fileId: 'file-id',
        accessToken: 'token',
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/Penpot request/);
  });

  it('throws when the Penpot API returns a malformed payload', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => {},
        }) as Response,
    );

    await expect(
      extractPenpotTokens({
        fileId: 'file-id',
        accessToken: 'token',
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow('Penpot styles response was not an object.');
  });
});

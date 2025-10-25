import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { extractSketchTokens } from './sketch-extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDirectory = path.resolve(__dirname, '../../../tests/fixtures/sketch');

describe('extractSketchTokens', () => {
  it('converts Sketch shared styles into DTIF tokens', async () => {
    const filePath = path.join(fixturesDirectory, 'document.json');

    const { document, warnings } = await extractSketchTokens({ filePath });

    expect(warnings).toHaveLength(0);

    const colorToken = (document as Record<string, any>).color?.surface?.background;
    expect(colorToken?.$type).toBe('color');
    expect(colorToken?.$value?.components).toEqual([0.125, 0.25, 0.375]);
    expect(colorToken?.$value?.alpha).toBeCloseTo(0.76, 2);
    expect(colorToken?.$extensions?.['net.lapidist.sources.sketch']).toMatchObject({
      id: 'color-primary',
      name: 'Color/Surface/Background',
    });

    const gradientToken = (document as Record<string, any>).gradient?.hero?.primary;
    expect(gradientToken?.$type).toBe('gradient');
    expect(gradientToken?.$value?.gradientType).toBe('linear');
    expect(gradientToken?.$value?.stops).toHaveLength(3);

    const typographyToken = (document as Record<string, any>).typography?.heading?.h1;
    expect(typographyToken?.$type).toBe('typography');
    expect(typographyToken?.$value?.fontFamily).toBe('Inter');
    expect(typographyToken?.$value?.fontSize).toMatchObject({ unit: 'px', value: 24 });
    expect(typographyToken?.$value?.color?.hex).toBe('#F23333');
  });

  it('records warnings when styles are incomplete', async () => {
    const payload = {
      colorVariables: [{ id: 'missing-color', name: 'Color/Missing' }],
      gradientStyles: [{ id: 'unknown-gradient', name: 'Gradient/Unsupported', type: 'angular' }],
      textStyles: [{ id: 'empty-typography', name: 'Typography/Empty' }],
    };

    const result = await extractSketchTokens({
      filePath: 'ignored',
      readFile: async () => JSON.stringify(payload),
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

  it('normalises gradients and typography metadata from Sketch payloads', async () => {
    const payload = {
      colorVariables: [
        {
          id: 'color-range',
          name: 'Color/Range',
          value: { red: 1.2, green: -0.2, blue: 0.4, alpha: 2 },
        },
      ],
      gradientStyles: [
        {
          id: 'gradient-partial',
          name: 'Gradient/Partial',
          type: 'radial',
          angle: 123.4567,
          stops: [
            { position: -0.5, color: { red: 0.2, green: 0.4, blue: 0.6, alpha: 0.5 } },
            { position: 1.5 },
          ],
        },
      ],
      textStyles: [
        {
          id: 'typography-detailed',
          name: 'Typography/Detailed',
          fontFamily: 'Roboto',
          fontSize: 16,
          fontWeight: 575,
          lineHeight: 20,
          letterSpacing: 1.25,
          paragraphSpacing: 8,
          textCase: 'small-caps',
          textDecoration: 'strikethrough',
          color: { red: 0.3, green: 0.2, blue: 0.1, alpha: 0.75 },
        },
      ],
    };

    const { document, warnings } = await extractSketchTokens({
      filePath: 'ignored',
      readFile: async () => JSON.stringify(payload),
    });

    const colorToken = (document as Record<string, any>).color?.range;
    expect(colorToken?.$value?.components).toEqual([1, 0, 0.4]);
    expect(colorToken?.$value?.alpha).toBeUndefined();

    const gradientToken = (document as Record<string, any>).gradient?.partial;
    expect(gradientToken?.$value?.gradientType).toBe('radial');
    expect(gradientToken?.$value?.stops).toHaveLength(1);
    expect(gradientToken?.$value?.angle).toBeCloseTo(123.4567, 6);

    const typographyToken = (document as Record<string, any>).typography?.detailed;
    expect(typographyToken?.$value?.fontFamily).toBe('Roboto');
    expect(typographyToken?.$value?.fontWeight).toBe(575);
    expect(typographyToken?.$value?.textCase).toBe('small-caps');
    expect(typographyToken?.$value?.textDecoration).toBe('line-through');
    expect(typographyToken?.$value?.color?.hex).toBe('#4D331A');
    expect(typographyToken?.$value?.color?.alpha).toBeCloseTo(0.75, 2);

    expect(warnings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'missing-gradient-stop' })]),
    );
  });

  it('throws when the Sketch document payload is malformed', async () => {
    await expect(
      extractSketchTokens({
        filePath: 'ignored',
        readFile: async () => 'null',
      }),
    ).rejects.toThrow('Sketch document payload was not an object.');
  });
});

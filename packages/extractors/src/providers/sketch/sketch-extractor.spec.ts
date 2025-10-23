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
});

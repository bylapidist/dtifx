import { describe, expect, it } from 'vitest';

import { colorToCssTransform, colorTokenVariantsTransform } from './color-transforms.js';
import { createCssTransforms } from './css-transforms.js';
import { dimensionToPxTransform, dimensionToRemTransform } from './dimension-transforms.js';
import { gradientToCssTransform } from './gradient-transforms.js';
import { borderToCssTransform } from './border-transforms.js';
import { shadowToCssTransform } from './shadow-transforms.js';
import { fontToCssTransform } from './font-transforms.js';
import { typographyToCssTransform } from './typography-transforms.js';

describe('createCssTransforms', () => {
  it('includes the built-in CSS transforms in registration order', () => {
    expect(createCssTransforms()).toStrictEqual([
      colorToCssTransform,
      colorTokenVariantsTransform,
      dimensionToRemTransform,
      dimensionToPxTransform,
      gradientToCssTransform,
      borderToCssTransform,
      shadowToCssTransform,
      fontToCssTransform,
      typographyToCssTransform,
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import { createAndroidMaterialTransforms } from './android-material-transforms.js';
import { colorToAndroidArgbTransform } from './color-transforms.js';
import {
  dimensionToAndroidDpTransform,
  dimensionToAndroidSpTransform,
} from './dimension-transforms.js';
import { gradientToAndroidMaterialTransform } from './gradient-transforms.js';
import { shadowToAndroidMaterialTransform } from './shadow-transforms.js';
import { typographyToAndroidMaterialTransform } from './typography-transforms.js';

describe('createAndroidMaterialTransforms', () => {
  it('returns Android transform definitions in registration order', () => {
    const transforms = createAndroidMaterialTransforms();

    expect(transforms).toStrictEqual([
      colorToAndroidArgbTransform,
      dimensionToAndroidDpTransform,
      dimensionToAndroidSpTransform,
      gradientToAndroidMaterialTransform,
      shadowToAndroidMaterialTransform,
      typographyToAndroidMaterialTransform,
    ]);
  });
});

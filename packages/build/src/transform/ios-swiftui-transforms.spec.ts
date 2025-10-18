import { describe, expect, it } from 'vitest';

import { createIosSwiftUiTransforms } from './ios-swiftui-transforms.js';
import { colorToSwiftUIColorTransform } from './color-transforms.js';
import { dimensionToSwiftUiPointsTransform } from './dimension-transforms.js';
import { typographyToSwiftUiTransform } from './typography-transforms.js';
import { gradientToSwiftUiTransform } from './gradient-transforms.js';
import { shadowToSwiftUiTransform } from './shadow-transforms.js';

describe('createIosSwiftUiTransforms', () => {
  it('returns SwiftUI transform definitions in registration order', () => {
    const transforms = createIosSwiftUiTransforms();

    expect(transforms).toStrictEqual([
      colorToSwiftUIColorTransform,
      dimensionToSwiftUiPointsTransform,
      typographyToSwiftUiTransform,
      gradientToSwiftUiTransform,
      shadowToSwiftUiTransform,
    ]);
  });
});

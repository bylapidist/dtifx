import { describe, expect, it } from 'vitest';

import { createAndroidComposeTransforms } from './android-compose-transforms.js';
import { colorToAndroidComposeColorTransform } from './color-transforms.js';
import { borderToAndroidComposeShapeTransform } from './border-transforms.js';
import { typographyToAndroidComposeTransform } from './typography-transforms.js';

describe('createAndroidComposeTransforms', () => {
  it('returns Compose transform definitions in registration order', () => {
    const transforms = createAndroidComposeTransforms();

    expect(transforms).toStrictEqual([
      colorToAndroidComposeColorTransform,
      borderToAndroidComposeShapeTransform,
      typographyToAndroidComposeTransform,
    ]);
  });
});

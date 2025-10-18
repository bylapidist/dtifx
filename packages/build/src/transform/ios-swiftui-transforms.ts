import type { TransformDefinition } from './transform-registry.js';
import { createIosSwiftUiColorTransforms } from './color-transforms.js';
import { createIosSwiftUiDimensionTransforms } from './dimension-transforms.js';
import { createIosSwiftUiTypographyTransforms } from './typography-transforms.js';
import { createIosSwiftUiGradientTransforms } from './gradient-transforms.js';
import { createIosSwiftUiShadowTransforms } from './shadow-transforms.js';

/**
 * Builds the collection of SwiftUI oriented transform definitions provided by the
 * build system.
 *
 * @returns {readonly TransformDefinition[]} Transform definitions ready to be
 * registered in the default iOS SwiftUI transform group.
 */
export function createIosSwiftUiTransforms(): readonly TransformDefinition[] {
  return [
    ...createIosSwiftUiColorTransforms(),
    ...createIosSwiftUiDimensionTransforms(),
    ...createIosSwiftUiTypographyTransforms(),
    ...createIosSwiftUiGradientTransforms(),
    ...createIosSwiftUiShadowTransforms(),
  ];
}

import type { TransformDefinition } from './transform-registry.js';
import { createAndroidMaterialColorTransforms } from './color-transforms.js';
import { createAndroidMaterialDimensionTransforms } from './dimension-transforms.js';
import { createAndroidMaterialGradientTransforms } from './gradient-transforms.js';
import { createAndroidMaterialShadowTransforms } from './shadow-transforms.js';
import { createAndroidMaterialTypographyTransforms } from './typography-transforms.js';

/**
 * Builds the collection of Android Material transform definitions provided by the
 * build system.
 *
 * @returns {readonly TransformDefinition[]} Transform definitions ready to be
 * registered in the default Android transform group.
 */
export function createAndroidMaterialTransforms(): readonly TransformDefinition[] {
  return [
    ...createAndroidMaterialColorTransforms(),
    ...createAndroidMaterialDimensionTransforms(),
    ...createAndroidMaterialGradientTransforms(),
    ...createAndroidMaterialShadowTransforms(),
    ...createAndroidMaterialTypographyTransforms(),
  ];
}

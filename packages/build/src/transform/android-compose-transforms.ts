import type { TransformDefinition } from './transform-registry.js';
import { createAndroidComposeColorTransforms } from './color-transforms.js';
import { createAndroidComposeBorderTransforms } from './border-transforms.js';
import { createAndroidComposeTypographyTransforms } from './typography-transforms.js';

/**
 * Builds the collection of Jetpack Compose transform definitions provided by the
 * build system.
 *
 * @returns {readonly TransformDefinition[]} Transform definitions ready to be
 * registered in the default Android Compose transform group.
 */
export function createAndroidComposeTransforms(): readonly TransformDefinition[] {
  return [
    ...createAndroidComposeColorTransforms(),
    ...createAndroidComposeBorderTransforms(),
    ...createAndroidComposeTypographyTransforms(),
  ];
}

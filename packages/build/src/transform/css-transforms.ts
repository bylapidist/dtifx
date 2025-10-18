import { createColorTransforms } from './color-transforms.js';
import { createDimensionTransforms } from './dimension-transforms.js';
import { createGradientTransforms } from './gradient-transforms.js';
import { createCssBorderTransforms } from './border-transforms.js';
import { createCssShadowTransforms } from './shadow-transforms.js';
import { createFontTransforms } from './font-transforms.js';
import { createTypographyTransforms } from './typography-transforms.js';
import type { TransformDefinition } from './transform-registry.js';

/**
 * Builds the collection of CSS oriented transform definitions provided by the
 * build system.
 *
 * @returns {readonly TransformDefinition[]} Transform definitions ready to be
 * registered in the default CSS transform group.
 */
export function createCssTransforms(): readonly TransformDefinition[] {
  return [
    ...createColorTransforms(),
    ...createDimensionTransforms(),
    ...createGradientTransforms(),
    ...createCssBorderTransforms(),
    ...createCssShadowTransforms(),
    ...createFontTransforms(),
    ...createTypographyTransforms(),
  ];
}

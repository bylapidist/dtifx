import { createCssTransforms } from './css-transforms.js';
import type { TransformDefinition } from './transform-registry.js';

/**
 * Aggregates the built-in transform definitions provided by the build system.
 * @returns {readonly TransformDefinition[]} Transform definitions that should be registered by default.
 */
export function createDefaultTransforms(): readonly TransformDefinition[] {
  return createCssTransforms();
}

import { detectParallelism } from '@dtifx/core';

/**
 * Determines the recommended level of parallelism for diff operations based on
 * the host machine's reported CPU availability.
 *
 * @returns The number of concurrent workers the diff engine should use.
 */
export function getDefaultConcurrency(): number {
  return detectParallelism();
}

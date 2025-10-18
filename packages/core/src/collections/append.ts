/**
 * Appends the provided items to the supplied mutable array when at least one
 * item is present.
 *
 * @param target - The array to extend.
 * @param items - The values to append to the array.
 */
export function append<T>(target: T[], ...items: readonly T[]): void {
  if (items.length === 0) {
    return;
  }

  target.push(...items);
}

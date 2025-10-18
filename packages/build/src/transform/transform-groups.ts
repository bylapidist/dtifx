export const TRANSFORM_GROUP_WEB_BASE = 'web/base';
export const TRANSFORM_GROUP_IOS_SWIFTUI = 'ios/swiftui';
export const TRANSFORM_GROUP_ANDROID_MATERIAL = 'android/material';
export const TRANSFORM_GROUP_ANDROID_COMPOSE = 'android/compose';
export const TRANSFORM_GROUP_ANALYTICS_RAW = 'analytics/raw';
export const TRANSFORM_GROUP_LEGACY_CORE = 'core';
export const TRANSFORM_GROUP_DEFAULT = TRANSFORM_GROUP_WEB_BASE;

const ORDERED_GROUPS: readonly string[] = [
  TRANSFORM_GROUP_WEB_BASE,
  TRANSFORM_GROUP_IOS_SWIFTUI,
  TRANSFORM_GROUP_ANDROID_MATERIAL,
  TRANSFORM_GROUP_ANDROID_COMPOSE,
  TRANSFORM_GROUP_ANALYTICS_RAW,
  TRANSFORM_GROUP_LEGACY_CORE,
  'default',
];

const ORDER_LOOKUP = new Map<string, number>(
  ORDERED_GROUPS.map((group, index) => [group, index] as const),
);

const LEGACY_ALIASES = new Map<string, string>([
  [TRANSFORM_GROUP_LEGACY_CORE, TRANSFORM_GROUP_WEB_BASE],
]);

/**
 * Normalises a user-provided transform group name by trimming whitespace,
 * resolving legacy aliases, and defaulting to the canonical web baseline when
 * no value is provided.
 * @param {string | undefined} group The transform group name supplied by the caller.
 * @returns {string} The canonical transform group identifier.
 */
export function normaliseTransformGroupName(group?: string): string {
  if (group === undefined) {
    return TRANSFORM_GROUP_DEFAULT;
  }
  const trimmed = group.trim();
  if (trimmed.length === 0) {
    return TRANSFORM_GROUP_DEFAULT;
  }
  const alias = LEGACY_ALIASES.get(trimmed);
  return alias ?? trimmed;
}

/**
 * Orders two transform group identifiers using the predefined priority list.
 * Unknown groups are grouped after the known set while still sorting
 * lexicographically to maintain deterministic ordering.
 * @param {string} left The first transform group identifier to compare.
 * @param {string} right The second transform group identifier to compare.
 * @returns {number} A numeric sort order compatible with Array.prototype.sort.
 */
export function compareTransformGroups(left: string, right: string): number {
  const normalisedLeft = normaliseTransformGroupName(left);
  const normalisedRight = normaliseTransformGroupName(right);
  const leftOrder = ORDER_LOOKUP.get(normalisedLeft) ?? ORDER_LOOKUP.size;
  const rightOrder = ORDER_LOOKUP.get(normalisedRight) ?? ORDER_LOOKUP.size;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return normalisedLeft.localeCompare(normalisedRight);
}

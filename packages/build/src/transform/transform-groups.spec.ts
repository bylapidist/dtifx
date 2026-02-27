import { describe, expect, it } from 'vitest';

import {
  TRANSFORM_GROUP_DEFAULT,
  compareTransformGroups,
  normaliseTransformGroupName,
} from './transform-groups.js';

describe('transform-groups', () => {
  it('normalises missing, blank, and legacy group names', () => {
    expect(normaliseTransformGroupName()).toBe(TRANSFORM_GROUP_DEFAULT);
    expect(normaliseTransformGroupName('   ')).toBe(TRANSFORM_GROUP_DEFAULT);
    expect(normaliseTransformGroupName('core')).toBe('web/base');
    expect(normaliseTransformGroupName('android/material')).toBe('android/material');
  });

  it('orders known groups before unknown groups and sorts unknown groups lexicographically', () => {
    const groups = ['z-unknown', 'ios/swiftui', 'a-unknown', 'android/material'];

    const sorted = groups.toSorted(compareTransformGroups);

    expect(sorted).toEqual(['ios/swiftui', 'android/material', 'a-unknown', 'z-unknown']);
  });

  it('returns zero when both groups resolve to the same canonical value', () => {
    expect(compareTransformGroups('core', 'web/base')).toBe(0);
  });
});

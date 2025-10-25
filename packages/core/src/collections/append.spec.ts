import { describe, expect, it } from 'vitest';

import { append } from './append.js';

describe('append', () => {
  it('appends provided items to the target array', () => {
    const target = [1, 2];

    append(target, 3, 4);

    expect(target).toEqual([1, 2, 3, 4]);
  });

  it('does not mutate the target when no items are provided', () => {
    const target = ['a'];

    append(target);

    expect(target).toEqual(['a']);
  });
});

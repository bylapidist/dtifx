import { test } from 'vitest';
import assert from 'node:assert/strict';

import { resolveDiffFilter, type DiffFilterOptions } from '../../src/application/filters.js';
import type { TokenChangeImpact, TokenChangeKind } from '../../src/domain/diff-types.js';

test('resolveDiffFilter returns unapplied when no options are provided', () => {
  const result = resolveDiffFilter();

  assert.deepEqual(result, { applied: false });
});

test('resolveDiffFilter ignores empty filter criteria', () => {
  const options: DiffFilterOptions = {
    types: ['   '],
    paths: [''],
    groups: ['\t'],
    impacts: [' ' as TokenChangeImpact],
    kinds: ['' as TokenChangeKind],
  };

  const result = resolveDiffFilter(options);

  assert.deepEqual(result, { applied: false });
});

test('resolveDiffFilter returns only sanitised filter properties', () => {
  const options: DiffFilterOptions = {
    types: ['color', ''],
    paths: [' /globals/background '],
    groups: ['Global', ''],
    impacts: ['breaking', 'non-breaking', 42 as unknown as TokenChangeImpact],
    kinds: ['added', 123 as unknown as TokenChangeKind, 'renamed'],
  };

  const result = resolveDiffFilter(options);

  assert.equal(result.applied, true);
  assert.deepEqual(result.filter, {
    types: ['color'],
    paths: [' /globals/background '],
    groups: ['Global'],
    impacts: ['breaking', 'non-breaking'],
    kinds: ['added', 'renamed'],
  });
});

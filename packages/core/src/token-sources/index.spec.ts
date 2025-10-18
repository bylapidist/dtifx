import { describe, expect, it } from 'vitest';

import { formatTokenSourceScope } from './index.js';

describe('token-sources', () => {
  describe('formatTokenSourceScope', () => {
    it('prefixes the provided label', () => {
      expect(formatTokenSourceScope('previous')).toBe('token-source:previous');
      expect(formatTokenSourceScope('next')).toBe('token-source:next');
    });
  });
});

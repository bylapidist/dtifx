import { describe, expect, it } from 'vitest';

import { formatFailureMessage } from './failures.js';

describe('formatFailureMessage', () => {
  it('formats breaking change failures with pluralization', () => {
    const message = formatFailureMessage({
      reason: 'breaking-changes',
      matchedCount: 2,
    } as unknown as Parameters<typeof formatFailureMessage>[0]);

    expect(message).toBe(
      'DTIFx diff: failing because 2 breaking changes detected (--fail-on-breaking).',
    );
  });

  it('formats token change failures with singular labels', () => {
    const message = formatFailureMessage({
      reason: 'token-changes',
      matchedCount: 1,
    } as unknown as Parameters<typeof formatFailureMessage>[0]);

    expect(message).toBe(
      'DTIFx diff: failing because 1 token change detected (--fail-on-changes).',
    );
  });

  it('falls back to a generic failure message for other reasons', () => {
    const message = formatFailureMessage({
      reason: 'custom-policy',
    } as unknown as Parameters<typeof formatFailureMessage>[0]);

    expect(message).toBe('DTIFx diff: failing because a diff failure policy was triggered.');
  });
});

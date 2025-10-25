import { describe, expect, it } from 'vitest';

import { formatCliError } from './format-cli-error.js';

describe('formatCliError', () => {
  it('prefers stack traces from Error instances', () => {
    const error = new Error('boom');
    error.stack = 'Captured stack trace';

    expect(formatCliError(error)).toBe('Captured stack trace');
  });

  it('returns error messages when stack traces are unavailable', () => {
    const error = new Error('missing stack');
    error.stack = undefined;

    expect(formatCliError(error)).toBe('missing stack');
  });

  it('returns string errors as-is', () => {
    expect(formatCliError('plain error')).toBe('plain error');
  });

  it('inspects non-error values for debugging context', () => {
    const diagnostic = { reason: 'validation failed', details: { field: 'name', code: 422 } };

    expect(formatCliError(diagnostic)).toContain("reason: 'validation failed'");
    expect(formatCliError(diagnostic)).toContain("field: 'name'");
  });
});

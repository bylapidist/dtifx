import { describe, expect, it, vi } from 'vitest';

import {
  escapeHtml,
  escapeMarkdown,
  formatDurationMs,
  formatUnknownError,
  serialiseError,
  writeJson,
  writeLine,
  type WritableTarget,
} from './formatting.js';

describe('reporting formatting helpers', () => {
  it('escapes HTML control characters', () => {
    expect(escapeHtml(`<span class="alert">Tom's & Jerry</span>`)).toBe(
      '&lt;span class=&quot;alert&quot;&gt;Tom&#39;s &amp; Jerry&lt;/span&gt;',
    );
  });

  it('escapes markdown syntax characters', () => {
    expect(escapeMarkdown('[link](value) *strong* _em_')).toBe(
      String.raw`\\[link\\]\\(value\\) \\*strong\\* \\_em\\_`,
    );
  });

  it('formats durations with a single decimal place', () => {
    expect(formatDurationMs(12.345)).toBe('12.3ms');
  });

  it('formats unknown errors', () => {
    const error = new Error('boom');
    expect(formatUnknownError(error)).toBe('Error: boom');
    expect(formatUnknownError('failure')).toBe('failure');
  });

  it('serialises error instances with stack traces when available', () => {
    const error = new Error('explode');
    error.stack = 'Error: explode\n    at here';
    expect(serialiseError(error)).toEqual({
      name: 'Error',
      message: 'explode',
      stack: error.stack,
    });
  });

  it('serialises non-error values with a default name', () => {
    expect(serialiseError('nope')).toEqual({
      name: 'UnknownError',
      message: 'nope',
    });
  });

  it('writes JSON payloads with a newline terminator', () => {
    const target: WritableTarget = { write: vi.fn() };
    writeJson(target, { value: 1 });
    expect(target.write).toHaveBeenCalledWith('{"value":1}\n');
  });

  it('writes text payloads with a newline terminator', () => {
    const target: WritableTarget = { write: vi.fn() };
    writeLine(target, 'status: ok');
    expect(target.write).toHaveBeenCalledWith('status: ok\n');
  });
});

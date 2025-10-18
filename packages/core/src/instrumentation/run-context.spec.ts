import { describe, expect, it } from 'vitest';

import {
  createRunContext,
  describeRunComparison,
  formatRunDuration,
  formatRunTimestamp,
  type RunContext,
} from './run-context.js';

describe('instrumentation/run-context', () => {
  describe('createRunContext', () => {
    it('normalises ISO timestamps when provided with a Date', () => {
      const startedAt = new Date('2024-01-02T03:04:05.678Z');

      const context = createRunContext({
        previous: 'alpha',
        next: 'beta',
        startedAt,
        durationMs: 1500,
      });

      expect(context).toEqual<RunContext>({
        previous: 'alpha',
        next: 'beta',
        startedAt: startedAt.toISOString(),
        durationMs: 1500,
      });
    });

    it('omits undefined properties to keep payloads compact', () => {
      const context = createRunContext({});

      expect(context).toEqual<RunContext>({});
    });

    it('preserves string timestamps verbatim', () => {
      const context = createRunContext({
        startedAt: '2023-11-05T12:34:56.000Z',
      });

      expect(context.startedAt).toBe('2023-11-05T12:34:56.000Z');
    });
  });

  describe('describeRunComparison', () => {
    it('describes both previous and next sources', () => {
      const description = describeRunComparison({ previous: 'v1', next: 'v2' });

      expect(description).toBe('v1 → v2');
    });

    it('falls back to next source when previous is missing', () => {
      const description = describeRunComparison({ next: 'v2' });

      expect(description).toBe('v2');
    });

    it('falls back to previous source when next is missing', () => {
      const description = describeRunComparison({ previous: 'v1' });

      expect(description).toBe('v1');
    });

    it('returns undefined when no sources are available', () => {
      const missingContext: RunContext | undefined = undefined;
      const description = describeRunComparison(missingContext);

      expect(description).toBeUndefined();
    });
  });

  describe('formatRunTimestamp', () => {
    it('formats ISO timestamps into UTC strings', () => {
      const context: RunContext = {
        startedAt: '2024-02-03T10:15:00.000Z',
      };

      expect(formatRunTimestamp(context)).toBe('2024-02-03 10:15 UTC');
    });

    it('returns undefined when timestamp is missing', () => {
      const missingContext: RunContext | undefined = undefined;
      expect(formatRunTimestamp(missingContext)).toBeUndefined();
    });

    it('returns undefined for invalid timestamps', () => {
      const context: RunContext = { startedAt: 'not-a-date' };

      expect(formatRunTimestamp(context)).toBeUndefined();
    });
  });

  describe('formatRunDuration', () => {
    it('formats durations shorter than one second in milliseconds', () => {
      const context: RunContext = { durationMs: 250.4 };

      expect(formatRunDuration(context)).toBe('250ms');
    });

    it('formats multi-second durations with precision up to one decimal place', () => {
      const context: RunContext = { durationMs: 1500 };

      expect(formatRunDuration(context)).toBe('1.5s');
    });

    it('rounds longer durations to whole seconds', () => {
      const context: RunContext = { durationMs: 12_345 };

      expect(formatRunDuration(context)).toBe('12s');
    });

    it('returns undefined when duration is missing or invalid', () => {
      const missingContext: RunContext | undefined = undefined;
      expect(formatRunDuration(missingContext)).toBeUndefined();
      expect(formatRunDuration({ durationMs: Number.NaN })).toBeUndefined();
      expect(formatRunDuration({ durationMs: -1 })).toBeUndefined();
    });
  });
});

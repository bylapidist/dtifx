import { afterEach, describe, expect, it, vi } from 'vitest';

import { JsonLineLogger, noopLogger } from './structured-logger.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('JsonLineLogger', () => {
  it('serialises log entries as newline-delimited JSON', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const write = vi.fn();
    const logger = new JsonLineLogger({ write });

    const entry = {
      level: 'info',
      name: 'core',
      event: 'runtime.stage',
      data: { stage: 'planning' },
    } as const;

    logger.log(entry);

    expect(write).toHaveBeenCalledWith(
      `${JSON.stringify({
        ...entry,
        timestamp: '2024-01-01T00:00:00.000Z',
      })}\n`,
    );
  });
});

describe('noopLogger', () => {
  it('ignores log entries', () => {
    const logger = noopLogger;
    expect(() => logger.log({ level: 'debug', name: 'noop', event: 'ignored' })).not.toThrow();
  });
});

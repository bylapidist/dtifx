import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { normaliseConcurrency, runTaskQueue, type TaskDefinition } from './queue.js';

afterEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('runTaskQueue', () => {
  it('respects concurrency limits and preserves order', async () => {
    let running = 0;
    let peak = 0;

    const tasks: TaskDefinition<number>[] = Array.from({ length: 6 }, (_, index) => ({
      id: `task-${index.toString(10)}`,
      run: async () => {
        running += 1;
        peak = Math.max(peak, running);
        await delay(index % 2 === 0 ? 5 : 15);
        running -= 1;
        return index;
      },
    }));

    const { results, metrics } = await runTaskQueue(tasks, { concurrency: 2 });

    expect(metrics.concurrency).toBe(2);
    expect(metrics.taskCount).toBe(tasks.length);
    expect(peak).toBeLessThanOrEqual(2);
    expect(results.map((result) => result.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(results.map((result) => result.value)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('maintains deterministic ordering despite completion timing', async () => {
    const tasks: TaskDefinition<string>[] = [
      {
        id: 'slow',
        run: async () => {
          await delay(25);
          return 'slow';
        },
      },
      {
        id: 'fast',
        run: async () => {
          await delay(5);
          return 'fast';
        },
      },
    ];

    const { results } = await runTaskQueue(tasks, { concurrency: 2 });

    expect(results.map((result) => result.id)).toEqual(['slow', 'fast']);
    expect(results.map((result) => result.value)).toEqual(['slow', 'fast']);
  });

  it('propagates the first error and halts subsequent work', async () => {
    const tasks: TaskDefinition<number>[] = [
      {
        id: 'ok',
        run: async () => 1,
      },
      {
        id: 'boom',
        run: async () => {
          throw new Error('failure');
        },
      },
      {
        id: 'later',
        run: async () => 3,
      },
    ];

    await expect(runTaskQueue(tasks, { concurrency: 2 })).rejects.toThrow('failure');
  });

  it('derives metrics from the provided task list when concurrency exceeds work items', async () => {
    const tasks: TaskDefinition<number>[] = [
      {
        id: 'first',
        run: async () => 1,
      },
      {
        id: 'second',
        run: async () => 2,
      },
    ];

    const { results, metrics } = await runTaskQueue(tasks, { concurrency: 10 });

    expect(metrics).toEqual({ concurrency: 2, taskCount: 2 });
    expect(results.map((result) => result.value)).toEqual([1, 2]);
  });
});

describe('normaliseConcurrency', () => {
  it('validates requested values', () => {
    expect(() => {
      normaliseConcurrency(0, 5);
    }).toThrow(/positive finite number/i);
    expect(() => {
      normaliseConcurrency(-2, 5);
    }).toThrow(/positive finite number/i);
  });

  it('returns zero when there is no work', () => {
    expect(normaliseConcurrency(undefined, 0)).toBe(0);
  });

  it('falls back to detected parallelism when unspecified', async () => {
    vi.doMock('./detect.js', () => ({
      detectParallelism: () => 8,
    }));

    const { normaliseConcurrency: mockedNormaliseConcurrency } = await import('./queue.js');

    expect(mockedNormaliseConcurrency(undefined, 12)).toBe(8);
  });
});

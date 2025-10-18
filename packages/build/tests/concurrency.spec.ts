import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';

import {
  normaliseConcurrency,
  runTaskQueue,
  type TaskDefinition,
} from '../src/concurrency/task-queue.js';

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
});

describe('normaliseConcurrency', () => {
  it('validates requested values', () => {
    expect(() => {
      normaliseConcurrency(0, 5);
    }).toThrow(/positive finite number/i);
    expect(() => {
      normaliseConcurrency(-2, 5);
    }).toThrow(/positive finite number/i);

    const value = normaliseConcurrency(undefined, 3);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThanOrEqual(3);
  });
});

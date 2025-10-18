import { describe, expect, it, vi } from 'vitest';

import type { ScheduledTask } from '../../domain/ports/scheduler.js';
import { SequentialTaskScheduler } from './sequential-task-scheduler.js';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve } as const;
}

describe('SequentialTaskScheduler', () => {
  it('runs scheduled tasks sequentially', async () => {
    const scheduler = new SequentialTaskScheduler();
    const events: string[] = [];
    let active = 0;

    const createTask = (id: string): ScheduledTask<string> => ({
      id,
      run: vi.fn(async () => {
        events.push(`start:${id}`);
        expect(active).toBe(0);
        active += 1;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        active -= 1;
        events.push(`end:${id}`);
        return id;
      }),
    });

    const completions = await Promise.all([
      scheduler.schedule(createTask('a')),
      scheduler.schedule(createTask('b')),
      scheduler.schedule(createTask('c')),
    ]);

    expect(completions).toEqual([
      { id: 'a', value: 'a' },
      { id: 'b', value: 'b' },
      { id: 'c', value: 'c' },
    ]);
    expect(events).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);

    await scheduler.shutdown();
    expect(scheduler.running).toBe(false);
  });

  it('reflects queue state in running flag', async () => {
    const scheduler = new SequentialTaskScheduler();

    expect(scheduler.running).toBe(false);

    const completionPromise = scheduler.schedule({
      id: 'task',
      run: async () => 'value',
    });

    expect(scheduler.running).toBe(true);

    await completionPromise;
    await scheduler.shutdown();

    expect(scheduler.running).toBe(false);
  });

  it('awaits pending work during shutdown', async () => {
    const scheduler = new SequentialTaskScheduler();
    const deferred = createDeferred<string>();

    const completionPromise = scheduler.schedule({
      id: 'task',
      run: async () => {
        return await deferred.promise;
      },
    });

    const shutdownPromise = scheduler.shutdown();

    expect(scheduler.running).toBe(true);

    deferred.resolve('done');

    await shutdownPromise;

    await expect(completionPromise).resolves.toEqual({ id: 'task', value: 'done' });
    expect(scheduler.running).toBe(false);
  });
});

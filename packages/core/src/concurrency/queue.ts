import pMap from 'p-map';

import { detectParallelism } from './detect.js';

export interface TaskDefinition<T> {
  readonly id: string;
  run(): Promise<T> | T;
}

export interface TaskResult<T> {
  readonly id: string;
  readonly index: number;
  readonly value: T;
}

export interface TaskQueueOptions {
  readonly concurrency?: number;
}

export interface TaskQueueMetrics {
  readonly concurrency: number;
  readonly taskCount: number;
}

export interface TaskQueueOutcome<T> {
  readonly results: readonly TaskResult<T>[];
  readonly metrics: TaskQueueMetrics;
}

/**
 * Executes the provided tasks while respecting a bounded concurrency limit.
 *
 * The queue preserves the input ordering of task results regardless of when the
 * underlying tasks resolve.
 *
 * @template T The result type produced by each task.
 * @param tasks The definitions describing how to run each unit of work.
 * @param options Queue configuration, including the desired concurrency cap.
 * @returns A summary of task results alongside derived queue metrics.
 */
export async function runTaskQueue<T>(
  tasks: readonly TaskDefinition<T>[],
  options: TaskQueueOptions = {},
): Promise<TaskQueueOutcome<T>> {
  if (tasks.length === 0) {
    return {
      results: [],
      metrics: { concurrency: 0, taskCount: 0 },
    } satisfies TaskQueueOutcome<T>;
  }

  const concurrency = normaliseConcurrency(options.concurrency, tasks.length);
  const results = await pMap(
    tasks,
    async (task, index) => {
      if (!task) {
        throw new Error(`Task queue encountered an undefined task at index ${index.toString(10)}`);
      }

      const value = await task.run();

      return {
        id: task.id,
        index,
        value,
      } satisfies TaskResult<T>;
    },
    { concurrency },
  );

  return {
    results,
    metrics: { concurrency, taskCount: tasks.length },
  } satisfies TaskQueueOutcome<T>;
}

/**
 * Derives the effective concurrency to use for a task queue.
 *
 * @param requested The caller-specified concurrency or `undefined` to auto-detect.
 * @param taskCount The number of tasks that will be executed.
 * @returns The positive concurrency value that should be applied.
 */
export function normaliseConcurrency(requested: number | undefined, taskCount: number): number {
  if (taskCount <= 0) {
    return 0;
  }

  if (requested !== undefined) {
    if (!Number.isFinite(requested) || requested <= 0) {
      throw new TypeError('Concurrency must be a positive finite number.');
    }

    return Math.min(taskCount, Math.floor(requested));
  }

  const detected = detectParallelism();
  const suggested = Math.min(taskCount, detected);

  return suggested > 0 ? suggested : 1;
}

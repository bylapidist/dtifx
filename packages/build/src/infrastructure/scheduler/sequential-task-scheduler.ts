import PQueue from 'p-queue';
import type {
  ScheduledTask,
  TaskCompletion,
  TaskSchedulerPort,
} from '../../domain/ports/scheduler.js';

export class SequentialTaskScheduler implements TaskSchedulerPort {
  private readonly queue = new PQueue({ concurrency: 1 });

  get running(): boolean {
    return this.queue.size > 0 || this.queue.pending > 0;
  }

  async schedule<T>(task: ScheduledTask<T>): Promise<TaskCompletion<T>> {
    return await this.queue.add(async () => {
      const value = await task.run();
      return { id: task.id, value } satisfies TaskCompletion<T>;
    });
  }

  async shutdown(): Promise<void> {
    await this.queue.onIdle();
  }
}

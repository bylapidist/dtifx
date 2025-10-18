export interface ScheduledTask<T = void> {
  readonly id: string;
  run(): Promise<T> | T;
}

export interface TaskCompletion<T = void> {
  readonly id: string;
  readonly value: T;
}

export interface TaskSchedulerPort {
  readonly running: boolean;
  schedule<T>(task: ScheduledTask<T>): Promise<TaskCompletion<T>>;
  shutdown(): Promise<void>;
}

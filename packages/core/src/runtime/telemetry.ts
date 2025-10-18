export type BuildStage =
  | 'planning'
  | 'resolution'
  | 'transformation'
  | 'formatting'
  | 'dependencies';

export interface BuildStageEvent {
  readonly stage: BuildStage;
  readonly timestamp: Date;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface BuildErrorEvent extends BuildStageEvent {
  readonly error: unknown;
}

export interface BuildLifecycleObserverPort {
  onStageStart(event: BuildStageEvent): void | Promise<void>;
  onStageComplete(event: BuildStageEvent): void | Promise<void>;
  onError(event: BuildErrorEvent): void | Promise<void>;
}

import type { BuildErrorEvent, BuildStageEvent } from './telemetry.js';

export interface DomainEvent<Type extends string, Payload> {
  readonly type: Type;
  readonly payload: Payload;
}

export type BuildStageStartedEvent = DomainEvent<'stage:start', BuildStageEvent>;
export type BuildStageCompletedEvent = DomainEvent<'stage:complete', BuildStageEvent>;
export type BuildStageErroredEvent = DomainEvent<'stage:error', BuildErrorEvent>;

export type BuildEvent = BuildStageStartedEvent | BuildStageCompletedEvent | BuildStageErroredEvent;

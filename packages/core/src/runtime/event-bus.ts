import type { BuildEvent } from './build-events.js';

export type DomainEventSubscriber = (event: BuildEvent) => void | Promise<void>;

export interface DomainEventSubscription {
  unsubscribe(): void;
}

export interface DomainEventBusPort {
  publish(event: BuildEvent): Promise<void>;
  subscribe(subscriber: DomainEventSubscriber): DomainEventSubscription;
}

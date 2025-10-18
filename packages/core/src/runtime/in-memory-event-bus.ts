import type {
  DomainEventBusPort,
  DomainEventSubscriber,
  DomainEventSubscription,
} from './event-bus.js';
import type { BuildEvent } from './build-events.js';

class InMemoryDomainEventSubscription implements DomainEventSubscription {
  constructor(
    private readonly subscribers: Set<DomainEventSubscriber>,
    private readonly subscriber: DomainEventSubscriber,
  ) {}

  unsubscribe(): void {
    this.subscribers.delete(this.subscriber);
  }
}

export class InMemoryDomainEventBus implements DomainEventBusPort {
  private readonly subscribers = new Set<DomainEventSubscriber>();

  subscribe(subscriber: DomainEventSubscriber): DomainEventSubscription {
    this.subscribers.add(subscriber);
    return new InMemoryDomainEventSubscription(this.subscribers, subscriber);
  }

  async publish(event: BuildEvent): Promise<void> {
    await Promise.all(
      [...this.subscribers].map((subscriber) => Promise.resolve(subscriber(event))),
    );
  }
}

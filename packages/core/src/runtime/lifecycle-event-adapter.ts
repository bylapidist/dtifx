import type { BuildLifecycleObserverPort } from './telemetry.js';
import type {
  DomainEventBusPort,
  DomainEventSubscriber,
  DomainEventSubscription,
} from './event-bus.js';
import { InMemoryDomainEventBus } from './in-memory-event-bus.js';
import type { BuildEvent } from './build-events.js';

function toObserverSubscriber(observer: BuildLifecycleObserverPort): DomainEventSubscriber {
  return async (event: BuildEvent) => {
    switch (event.type) {
      case 'stage:start': {
        await observer.onStageStart(event.payload);
        return;
      }
      case 'stage:complete': {
        await observer.onStageComplete(event.payload);
        return;
      }
      case 'stage:error': {
        await observer.onError(event.payload);
        return;
      }
      default: {
        const neverEvent: never = event;
        throw new Error(`Unsupported build event type ${(neverEvent as BuildEvent).type}`);
      }
    }
  };
}

/**
 * Attaches lifecycle observers to a domain event bus and returns their subscriptions.
 *
 * @param bus - Event bus receiving lifecycle events.
 * @param observers - Observers to subscribe to the bus.
 * @returns Subscriptions that can be disposed to remove observers.
 */
export function attachLifecycleObservers(
  bus: DomainEventBusPort,
  observers: readonly BuildLifecycleObserverPort[],
): DomainEventSubscription[] {
  return observers.map((observer) => bus.subscribe(toObserverSubscriber(observer)));
}

/**
 * Creates a lifecycle-aware domain event bus and pre-registers optional observers.
 *
 * @param observers - Observers to attach to the newly created bus.
 * @returns Domain event bus emitting lifecycle events.
 */
export function createLifecycleObserverEventBus(
  observers: readonly BuildLifecycleObserverPort[] = [],
): DomainEventBusPort {
  const bus = new InMemoryDomainEventBus();
  attachLifecycleObservers(bus, observers);
  return bus;
}

/**
 * Resolves a lifecycle event bus, wiring observers and creating a bus when necessary.
 *
 * @param eventBus - Optional existing bus to reuse.
 * @param observers - Observers to attach to the resolved bus.
 * @returns Lifecycle-aware event bus ready for publication.
 */
export function resolveLifecycleEventBus(
  eventBus: DomainEventBusPort | undefined,
  observers: readonly BuildLifecycleObserverPort[] | undefined,
): DomainEventBusPort {
  if (eventBus) {
    if (observers?.length) {
      attachLifecycleObservers(eventBus, observers);
    }
    return eventBus;
  }
  return createLifecycleObserverEventBus(observers ?? []);
}

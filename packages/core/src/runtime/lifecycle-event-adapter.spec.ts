import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { BuildEvent } from './build-events.js';
import type {
  DomainEventBusPort,
  DomainEventSubscriber,
  DomainEventSubscription,
} from './event-bus.js';
import { InMemoryDomainEventBus } from './in-memory-event-bus.js';
import {
  attachLifecycleObservers,
  createLifecycleObserverEventBus,
  resolveLifecycleEventBus,
} from './lifecycle-event-adapter.js';
import type { BuildLifecycleObserverPort } from './telemetry.js';

function createObserver(): BuildLifecycleObserverPort {
  return {
    onStageStart: vi.fn(),
    onStageComplete: vi.fn(),
    onError: vi.fn(),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('attachLifecycleObservers', () => {
  const createBus = () => {
    const subscriptions: DomainEventSubscription[] = [];
    const subscribers: DomainEventSubscriber[] = [];
    const bus: DomainEventBusPort = {
      publish: vi.fn(async (event: BuildEvent) => {
        await Promise.all(subscribers.map((subscriber) => subscriber(event)));
      }),
      subscribe: vi.fn((subscriber: DomainEventSubscriber) => {
        subscribers.push(subscriber);
        const subscription = { unsubscribe: vi.fn() } satisfies DomainEventSubscription;
        subscriptions.push(subscription);
        return subscription;
      }),
    };
    return { bus, subscriptions, subscribers };
  };

  const baseEvent: BuildEvent = {
    type: 'stage:start',
    payload: {
      stage: 'planning',
      timestamp: new Date('2024-01-01T00:00:00Z'),
    },
  };

  it('subscribes each observer and wires lifecycle callbacks', async () => {
    const { bus, subscribers, subscriptions } = createBus();
    const observers = [createObserver(), createObserver()];

    const result = attachLifecycleObservers(bus, observers);

    expect(result).toEqual(subscriptions);
    expect(bus.subscribe).toHaveBeenCalledTimes(observers.length);

    const [, subscriber] = subscribers;
    const completeEvent: BuildEvent = {
      type: 'stage:complete',
      payload: {
        ...baseEvent.payload,
        attributes: { durationMs: 10 },
      },
    };
    await subscriber(completeEvent);
    expect(observers[1].onStageComplete).toHaveBeenCalledWith(completeEvent.payload);

    const errorEvent: BuildEvent = {
      type: 'stage:error',
      payload: {
        ...baseEvent.payload,
        error: new Error('boom'),
      },
    };
    await subscribers[0](errorEvent);
    expect(observers[0].onError).toHaveBeenCalledWith(errorEvent.payload);
  });

  it('throws when observers receive unsupported events', async () => {
    const { bus, subscribers } = createBus();
    const observer = createObserver();
    attachLifecycleObservers(bus, [observer]);

    const unexpectedEvent = {
      type: 'stage:unknown',
      payload: baseEvent.payload,
    } as unknown as BuildEvent;

    await expect(subscribers[0](unexpectedEvent)).rejects.toThrow(
      'Unsupported build event type stage:unknown',
    );
  });
});

describe('createLifecycleObserverEventBus', () => {
  const observer: BuildLifecycleObserverPort = {
    onStageStart: vi.fn(),
    onStageComplete: vi.fn(),
    onError: vi.fn(),
  };

  it('returns an in-memory bus with observers pre-attached', async () => {
    const bus = createLifecycleObserverEventBus([observer]);

    expect(bus).toBeInstanceOf(InMemoryDomainEventBus);

    const event: BuildEvent = {
      type: 'stage:start',
      payload: {
        stage: 'planning',
        timestamp: new Date('2024-01-01T00:00:00Z'),
      },
    };

    await bus.publish(event);

    expect(observer.onStageStart).toHaveBeenCalledWith(event.payload);
  });
});

describe('resolveLifecycleEventBus', () => {
  const observer: BuildLifecycleObserverPort = {
    onStageStart: vi.fn(),
    onStageComplete: vi.fn(),
    onError: vi.fn(),
  };

  it('reattaches observers to an existing bus', async () => {
    const subscription: DomainEventSubscription = { unsubscribe: vi.fn() };
    const bus: DomainEventBusPort = {
      publish: vi.fn(),
      subscribe: vi.fn(() => {
        return subscription;
      }),
    };

    const resolved = resolveLifecycleEventBus(bus, [observer]);

    expect(resolved).toBe(bus);
    expect(bus.subscribe).toHaveBeenCalledTimes(1);

    const subscribeMock = bus.subscribe as Mock;
    const registeredSubscriber = subscribeMock.mock.calls[0][0] as DomainEventSubscriber;
    const event: BuildEvent = {
      type: 'stage:start',
      payload: {
        stage: 'planning',
        timestamp: new Date('2024-01-01T00:00:00Z'),
      },
    };

    await registeredSubscriber(event);
    expect(observer.onStageStart).toHaveBeenCalledWith(event.payload);
  });

  it('returns the provided bus without attaching observers when none are supplied', () => {
    const bus: DomainEventBusPort = {
      publish: vi.fn(),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    };

    const resolved = resolveLifecycleEventBus(bus, []);

    expect(resolved).toBe(bus);
    expect(bus.subscribe).not.toHaveBeenCalled();
  });

  it('creates a new bus when none is provided', async () => {
    const event: BuildEvent = {
      type: 'stage:error',
      payload: {
        stage: 'planning',
        timestamp: new Date('2024-01-01T00:00:00Z'),
        error: new Error('boom'),
      },
    };

    const bus = resolveLifecycleEventBus(undefined, [observer]);
    expect(bus).toBeInstanceOf(InMemoryDomainEventBus);

    await bus.publish(event);
    expect(observer.onError).toHaveBeenCalledWith(event.payload);
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { BuildEvent } from './build-events.js';
import { InMemoryDomainEventBus } from './in-memory-event-bus.js';

describe('InMemoryDomainEventBus', () => {
  const event: BuildEvent = {
    type: 'stage:start',
    payload: {
      stage: 'planning',
      timestamp: new Date('2024-01-01T00:00:00Z'),
    },
  };

  it('notifies all subscribed listeners', async () => {
    const bus = new InMemoryDomainEventBus();
    const firstSubscriber = vi.fn();
    const secondSubscriber = vi.fn();

    bus.subscribe(firstSubscriber);
    bus.subscribe(secondSubscriber);

    await bus.publish(event);

    expect(firstSubscriber).toHaveBeenCalledWith(event);
    expect(secondSubscriber).toHaveBeenCalledWith(event);
  });

  it('awaits asynchronous subscribers before resolving publish', async () => {
    const bus = new InMemoryDomainEventBus();
    let resolved = false;

    bus.subscribe(async () => {
      await Promise.resolve();
      resolved = true;
    });

    await bus.publish(event);

    expect(resolved).toBe(true);
  });

  it('stops notifying listeners after they unsubscribe', async () => {
    const bus = new InMemoryDomainEventBus();
    const subscriber = vi.fn();

    const subscription = bus.subscribe(subscriber);
    await bus.publish(event);
    expect(subscriber).toHaveBeenCalledTimes(1);

    subscription.unsubscribe();
    await bus.publish(event);

    expect(subscriber).toHaveBeenCalledTimes(1);
  });
});

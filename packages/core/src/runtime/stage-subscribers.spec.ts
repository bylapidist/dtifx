import { describe, expect, it, vi } from 'vitest';

import type { StructuredLogger } from '../logging/index.js';
import type { TelemetrySpan } from '../telemetry/index.js';
import type { BuildEvent } from './build-events.js';
import {
  createLifecycleLoggingSubscriber,
  createLifecycleTelemetrySubscriber,
} from './stage-subscribers.js';

function createLogger(): StructuredLogger {
  return { log: vi.fn() } satisfies StructuredLogger;
}

function createSpan(): TelemetrySpan {
  return {
    name: 'root',
    spanId: 'span',
    traceId: 'trace',
    startChild: vi.fn(),
    addEvent: vi.fn(),
    setAttribute: vi.fn(),
    end: vi.fn(),
  } satisfies TelemetrySpan;
}

describe('createLifecycleLoggingSubscriber', () => {
  const baseEvent = {
    stage: 'planning',
    timestamp: new Date('2024-01-01T00:00:00Z'),
  } as const;

  it('logs stage start events with the configured prefix and scope', () => {
    const logger = createLogger();
    const subscriber = createLifecycleLoggingSubscriber({
      logger,
      scope: 'build.runtime',
      eventPrefix: 'lifecycle',
    });

    const event: BuildEvent = {
      type: 'stage:start',
      payload: baseEvent,
    };

    subscriber(event);

    expect(logger.log).toHaveBeenCalledWith({
      level: 'info',
      name: 'build.runtime',
      event: 'lifecycle.start',
      data: { stage: 'planning' },
    });
  });

  it('logs completion events including elapsed duration when provided', () => {
    const logger = createLogger();
    const subscriber = createLifecycleLoggingSubscriber({
      logger,
      scope: 'build.runtime',
      eventPrefix: 'lifecycle',
    });

    const attributes = { durationMs: 42, artifactCount: 3 };
    const event: BuildEvent = {
      type: 'stage:complete',
      payload: {
        ...baseEvent,
        attributes,
      },
    };

    subscriber(event);

    expect(logger.log).toHaveBeenCalledWith({
      level: 'info',
      name: 'build.runtime',
      event: 'lifecycle.complete',
      elapsedMs: 42,
      data: {
        stage: 'planning',
        attributes: { durationMs: 42, artifactCount: 3 },
      },
    });

    const loggedAttributes = logger.log.mock.calls[0][0].data?.attributes as Record<
      string,
      unknown
    >;
    expect(loggedAttributes).not.toBe(attributes);
  });

  it('logs errors with a normalised message representation', () => {
    const logger = createLogger();
    const subscriber = createLifecycleLoggingSubscriber({
      logger,
      scope: 'build.runtime',
      eventPrefix: 'lifecycle',
    });

    const event: BuildEvent = {
      type: 'stage:error',
      payload: {
        ...baseEvent,
        error: { code: 'EFAIL', reason: 'failed to build' },
      },
    };

    subscriber(event);

    expect(logger.log).toHaveBeenCalledWith({
      level: 'error',
      name: 'build.runtime',
      event: 'lifecycle.error',
      data: {
        stage: 'planning',
        message: '{"code":"EFAIL","reason":"failed to build"}',
      },
    });
  });

  it('throws for unsupported event types', () => {
    const logger = createLogger();
    const subscriber = createLifecycleLoggingSubscriber({
      logger,
      scope: 'build.runtime',
      eventPrefix: 'lifecycle',
    });

    const unexpectedEvent = {
      type: 'stage:unknown',
      payload: baseEvent,
    } as unknown as BuildEvent;

    expect(() => subscriber(unexpectedEvent)).toThrowError('Unsupported build event type');
  });
});

describe('createLifecycleTelemetrySubscriber', () => {
  const baseEvent = {
    stage: 'planning',
    timestamp: new Date('2024-01-01T00:00:00Z'),
  } as const;

  it('skips telemetry when no span is active', () => {
    const subscriber = createLifecycleTelemetrySubscriber({
      eventNamespace: 'build.lifecycle',
      getSpan: () => {},
    });

    const event: BuildEvent = {
      type: 'stage:start',
      payload: baseEvent,
    };

    expect(() => subscriber(event)).not.toThrow();
  });

  it('adds lifecycle events to the active span', () => {
    const span = createSpan();
    const subscriber = createLifecycleTelemetrySubscriber({
      eventNamespace: 'build.lifecycle',
      getSpan: () => span,
    });

    const startEvent: BuildEvent = {
      type: 'stage:start',
      payload: baseEvent,
    };
    subscriber(startEvent);

    const completeEvent: BuildEvent = {
      type: 'stage:complete',
      payload: {
        ...baseEvent,
        attributes: {
          durationMs: 13,
          artifactCount: 2,
          flags: ['alpha', 1, true],
          ignored: { nested: true },
        },
      },
    };
    subscriber(completeEvent);

    const errorEvent: BuildEvent = {
      type: 'stage:error',
      payload: {
        ...baseEvent,
        error: new Error('boom'),
      },
    };
    subscriber(errorEvent);

    expect(span.addEvent).toHaveBeenNthCalledWith(1, 'build.lifecycle.start', {
      stage: 'planning',
    });

    const completeAttributes = span.addEvent.mock.calls[1][1];
    expect(Object.isFrozen(completeAttributes)).toBe(true);
    expect(completeAttributes).toEqual({
      stage: 'planning',
      durationMs: 13,
      artifactCount: 2,
      flags: ['alpha', 1, true],
    });
    expect(Object.isFrozen(completeAttributes.flags)).toBe(true);

    expect(span.addEvent).toHaveBeenNthCalledWith(3, 'build.lifecycle.error', {
      stage: 'planning',
      message: 'boom',
    });
  });

  it('throws for unsupported event types', () => {
    const span = createSpan();
    const subscriber = createLifecycleTelemetrySubscriber({
      eventNamespace: 'build.lifecycle',
      getSpan: () => span,
    });

    const unexpectedEvent = {
      type: 'stage:unknown',
      payload: baseEvent,
    } as unknown as BuildEvent;

    expect(() => subscriber(unexpectedEvent)).toThrowError('Unsupported build event type');
  });
});

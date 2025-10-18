import { describe, expect, it } from 'vitest';

import type { BuildEvent } from '../domain/events/build-events.js';
import { createBuildStageLoggingSubscriber } from './build-event-subscriber.js';
import type { StructuredLogEvent } from '@dtifx/core/logging';
import { createBuildStageTelemetryEventSubscriber } from '../telemetry/build-event-subscriber.js';
import { createTelemetryTracer } from '@dtifx/core/telemetry';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

type LoggedEvent = StructuredLogEvent;

describe('build stage event subscribers', () => {
  it('records lifecycle events via structured logging', () => {
    const entries: LoggedEvent[] = [];
    const logger = {
      log(entry: StructuredLogEvent) {
        entries.push(entry);
      },
    } satisfies { log(entry: StructuredLogEvent): void };

    const subscriber = createBuildStageLoggingSubscriber(logger);
    void subscriber(createStageEvent('stage:start'));
    void subscriber(createStageEvent('stage:complete'));
    void subscriber(createStageEvent('stage:error'));

    expect(entries).toHaveLength(3);
    const [start, complete, error] = entries;
    expect(start?.event).toBe('build.stage.start');
    expect(start?.data).toEqual({ stage: 'planning' });
    expect(complete?.event).toBe('build.stage.complete');
    expect(complete?.elapsedMs).toBe(12);
    expect(complete?.data).toEqual({
      stage: 'planning',
      attributes: { durationMs: 12, entryCount: 4 },
    });
    expect(error?.event).toBe('build.stage.error');
    expect(error?.data).toEqual({ stage: 'planning', message: 'boom' });
  });

  it('emits telemetry events on the provided span', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });

    const tracer = createTelemetryTracer({ tracer: provider.getTracer('dtifx.build.test') });
    const span = tracer.startSpan('test');
    const subscriber = createBuildStageTelemetryEventSubscriber({
      getSpan: () => span,
    });

    void subscriber(createStageEvent('stage:start'));
    void subscriber(createStageEvent('stage:complete'));
    void subscriber(createStageEvent('stage:error'));

    span.end();
    await provider.forceFlush();
    const [recorded] = exporter.getFinishedSpans();
    expect(recorded).toBeDefined();
    expect(recorded?.events).toHaveLength(3);
    const [startEvent, completeEvent, errorEvent] = recorded?.events ?? [];
    expect(startEvent?.name).toBe('dtifx.stage.start');
    expect(startEvent?.attributes).toEqual({ stage: 'planning' });
    expect(completeEvent?.name).toBe('dtifx.stage.complete');
    expect(completeEvent?.attributes).toEqual({
      stage: 'planning',
      durationMs: 12,
      entryCount: 4,
    });
    expect(errorEvent?.name).toBe('dtifx.stage.error');
    expect(errorEvent?.attributes).toEqual({ stage: 'planning', message: 'boom' });

    await provider.shutdown();
  });
});

/**
 * Creates a representative build event for the provided lifecycle stage so
 * tests can exercise the subscriber behaviour with realistic payloads.
 * @param {BuildEvent['type']} type The build lifecycle event type to materialise.
 * @returns {BuildEvent} A synthetic build event matching the requested lifecycle stage.
 */
function createStageEvent(type: BuildEvent['type']): BuildEvent {
  switch (type) {
    case 'stage:start': {
      return {
        type,
        payload: {
          stage: 'planning',
          timestamp: new Date(),
        },
      } satisfies BuildEvent;
    }
    case 'stage:complete': {
      return {
        type,
        payload: {
          stage: 'planning',
          timestamp: new Date(),
          attributes: { durationMs: 12, entryCount: 4 },
        },
      } satisfies BuildEvent;
    }
    case 'stage:error': {
      return {
        type,
        payload: {
          stage: 'planning',
          timestamp: new Date(),
          error: new Error('boom'),
        },
      } satisfies BuildEvent;
    }
    default: {
      throw new Error(`Unsupported build event type: ${type as string}`);
    }
  }
}

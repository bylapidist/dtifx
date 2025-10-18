import type { StructuredLogger } from '../logging/index.js';
import type {
  TelemetryAttributeValue,
  TelemetryAttributes,
  TelemetrySpan,
} from '../telemetry/index.js';

import type { BuildEvent } from './build-events.js';
import type { DomainEventSubscriber } from './event-bus.js';

export interface LifecycleLoggingSubscriberOptions {
  readonly logger: StructuredLogger;
  readonly scope: string;
  readonly eventPrefix: string;
}

/**
 * Creates a lifecycle-aware logging subscriber that forwards build stage events to a structured logger.
 *
 * @param options - Logger configuration and namespacing for emitted log events.
 * @returns Domain event subscriber that records lifecycle entries.
 */
export function createLifecycleLoggingSubscriber(
  options: LifecycleLoggingSubscriberOptions,
): DomainEventSubscriber {
  return (event: BuildEvent) => {
    const { logger, scope, eventPrefix } = options;

    switch (event.type) {
      case 'stage:start': {
        logger.log({
          level: 'info',
          name: scope,
          event: `${eventPrefix}.start`,
          data: { stage: event.payload.stage },
        });
        return;
      }
      case 'stage:complete': {
        const attributes = event.payload.attributes;
        const duration = getDuration(attributes?.['durationMs']);
        const data: Record<string, unknown> = { stage: event.payload.stage };
        if (attributes) {
          data['attributes'] = { ...attributes };
        }

        logger.log({
          level: 'info',
          name: scope,
          event: `${eventPrefix}.complete`,
          ...(duration === undefined ? {} : { elapsedMs: duration }),
          data,
        });
        return;
      }
      case 'stage:error': {
        logger.log({
          level: 'error',
          name: scope,
          event: `${eventPrefix}.error`,
          data: {
            stage: event.payload.stage,
            message: toErrorMessage(event.payload.error),
          },
        });
        return;
      }
      default: {
        throw new Error('Unsupported build event type');
      }
    }
  };
}

export interface LifecycleTelemetrySubscriberOptions {
  readonly getSpan: () => TelemetrySpan | undefined;
  readonly eventNamespace: string;
}

/**
 * Creates a telemetry subscriber that mirrors lifecycle events onto the active telemetry span.
 *
 * @param options - Accessors for the active span and the namespace used for emitted events.
 * @returns Domain event subscriber that emits telemetry events for build stages.
 */
export function createLifecycleTelemetrySubscriber(
  options: LifecycleTelemetrySubscriberOptions,
): DomainEventSubscriber {
  return (event: BuildEvent) => {
    const span = options.getSpan();
    if (!span) {
      return;
    }

    switch (event.type) {
      case 'stage:start': {
        span.addEvent(`${options.eventNamespace}.start`, {
          stage: event.payload.stage,
        });
        return;
      }
      case 'stage:complete': {
        span.addEvent(
          `${options.eventNamespace}.complete`,
          normaliseAttributes(event.payload.stage, event.payload.attributes),
        );
        return;
      }
      case 'stage:error': {
        span.addEvent(`${options.eventNamespace}.error`, {
          stage: event.payload.stage,
          message: toErrorMessage(event.payload.error),
        });
        return;
      }
      default: {
        throw new Error('Unsupported build event type');
      }
    }
  };
}

function normaliseAttributes(
  stage: string,
  attributes: Readonly<Record<string, unknown>> | undefined,
): TelemetryAttributes {
  const record: Record<string, TelemetryAttributeValue> = { stage };
  if (!attributes) {
    return Object.freeze(record) as TelemetryAttributes;
  }

  for (const [key, value] of Object.entries(attributes)) {
    const attribute = toTelemetryAttributeValue(value);
    if (attribute !== undefined) {
      record[key] = attribute;
    }
  }

  return Object.freeze(record) as TelemetryAttributes;
}

function toTelemetryAttributeValue(value: unknown): TelemetryAttributeValue | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value) && value.every((item) => isPrimitiveTelemetryValue(item))) {
    return Object.freeze([...value]) as readonly (string | number | boolean)[];
  }

  return undefined;
}

function isPrimitiveTelemetryValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function getDuration(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'number' || typeof error === 'bigint') {
    return error.toString();
  }
  if (typeof error === 'boolean') {
    return error ? 'true' : 'false';
  }
  if (error === null || error === undefined) {
    return 'unknown error';
  }
  if (typeof error === 'symbol') {
    return error.description ?? 'unknown error';
  }
  if (typeof error === 'function') {
    return error.name || 'unknown error';
  }
  if (typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return 'unknown error';
    }
  }
  return 'unknown error';
}

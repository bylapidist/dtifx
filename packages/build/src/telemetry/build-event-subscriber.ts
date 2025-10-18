import { createLifecycleTelemetrySubscriber } from '@dtifx/core/runtime';
import type { TelemetrySpan } from '@dtifx/core/telemetry';

import type { DomainEventSubscriber } from '../domain/ports/event-bus.js';

interface TelemetrySubscriberOptions {
  readonly getSpan: () => TelemetrySpan | undefined;
}

/**
 * Creates a build-scoped telemetry subscriber that mirrors lifecycle events onto the active span.
 *
 * @param options - Accessors for the active telemetry span.
 * @returns Domain event subscriber that emits telemetry events for build stages.
 */
export function createBuildStageTelemetryEventSubscriber(
  options: TelemetrySubscriberOptions,
): DomainEventSubscriber {
  return createLifecycleTelemetrySubscriber({
    getSpan: options.getSpan,
    eventNamespace: 'dtifx.stage',
  });
}

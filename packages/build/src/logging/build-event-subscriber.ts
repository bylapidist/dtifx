import type { StructuredLogger } from '@dtifx/core/logging';
import { createLifecycleLoggingSubscriber } from '@dtifx/core/runtime';

import type { DomainEventSubscriber } from '../domain/ports/event-bus.js';

/**
 * Creates a build-scoped logging subscriber that records lifecycle events using the shared logging adapter.
 *
 * @param logger - Structured logger that receives lifecycle log entries.
 * @returns Domain event subscriber recording build stage events.
 */
export function createBuildStageLoggingSubscriber(logger: StructuredLogger): DomainEventSubscriber {
  return createLifecycleLoggingSubscriber({
    logger,
    scope: 'dtifx-build',
    eventPrefix: 'build.stage',
  });
}

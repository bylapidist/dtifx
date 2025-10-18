import { DiagnosticCategories } from '../application/ports/diagnostics.js';
import type { DiagnosticCategory, DiagnosticEvent } from '../application/ports/diagnostics.js';
import type { ReportRendererContext } from '../application/ports/reporting.js';

/**
 * Emits a diagnostic event from a renderer context if diagnostics are enabled.
 *
 * @param context - The renderer context that may contain a diagnostics port.
 * @param event - The diagnostic event to emit.
 * @param defaultScope - Fallback scope when the event does not specify one.
 * @param defaultCategory - Fallback category when the event does not specify one.
 */
export function emitRendererDiagnostic(
  context: ReportRendererContext | undefined,
  event: DiagnosticEvent,
  defaultScope: string,
  defaultCategory: DiagnosticCategory = DiagnosticCategories.reporting,
): void {
  const diagnostics = context?.diagnostics;

  if (!diagnostics) {
    return;
  }

  const payload: DiagnosticEvent = {
    ...event,
    scope: event.scope ?? defaultScope,
    category: event.category ?? defaultCategory,
  };

  void diagnostics.emit(payload);
}

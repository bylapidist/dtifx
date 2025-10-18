import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  DiagnosticCategories,
  formatReportingScope,
  type DiagnosticEvent,
  type DiagnosticsPort,
} from '../../src/application/ports/diagnostics.js';
import type { ReportRendererContext } from '../../src/application/ports/reporting.js';
import { emitRendererDiagnostic } from '../../src/reporting/diagnostics.js';

test('emitRendererDiagnostic defaults to the reporting category', () => {
  const events: DiagnosticEvent[] = [];
  const diagnostics: DiagnosticsPort = {
    emit(event) {
      events.push(event);
    },
  };

  const context: ReportRendererContext = {
    diagnostics,
  };

  emitRendererDiagnostic(
    context,
    {
      level: 'info',
      message: 'Test event',
    },
    formatReportingScope('test'),
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.category, DiagnosticCategories.reporting);
  assert.equal(events[0]?.scope, formatReportingScope('test'));
});

test('emitRendererDiagnostic respects explicit categories', () => {
  const events: DiagnosticEvent[] = [];
  const diagnostics: DiagnosticsPort = {
    emit(event) {
      events.push(event);
    },
  };

  const context: ReportRendererContext = {
    diagnostics,
  };

  emitRendererDiagnostic(
    context,
    {
      level: 'warn',
      message: 'Warn event',
      category: DiagnosticCategories.reportingCli,
    },
    formatReportingScope('test'),
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.category, DiagnosticCategories.reportingCli);
});

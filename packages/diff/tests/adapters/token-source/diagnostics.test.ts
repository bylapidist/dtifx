import { test } from 'vitest';
import assert from 'node:assert/strict';

import type { Diagnostic } from '@lapidist/dtif-parser';

import {
  createDiagnosticsAwareParserHooks,
  createTokenParserDiagnosticEvent,
} from '../../../src/adapters/token-source/diagnostics.js';
import type {
  DiagnosticEvent,
  DiagnosticsPort,
} from '../../../src/application/ports/diagnostics.js';
import { formatTokenSourceScope } from '../../../src/application/ports/diagnostics.js';

test('createTokenParserDiagnosticEvent appends the source label by default', () => {
  const diagnostic: Diagnostic = {
    code: 'DTIF_WARNING',
    severity: 'warning',
    message: 'Example parser warning',
    pointer: '#/example',
  } as const;

  const event = createTokenParserDiagnosticEvent(diagnostic, {
    scope: formatTokenSourceScope('previous'),
    sourceLabel: 'previous snapshot',
  });

  assert.ok(event.message?.includes('previous snapshot'));
  assert.match(event.message ?? '', /Example parser warning/);
});

test('createTokenParserDiagnosticEvent suppresses the source label when requested', () => {
  const diagnostic: Diagnostic = {
    code: 'DTIF_ERROR',
    severity: 'error',
    message: 'Example parser error',
  } as const;

  const event = createTokenParserDiagnosticEvent(diagnostic, {
    scope: formatTokenSourceScope('next'),
    sourceLabel: 'next snapshot',
    includeSourceLabelInMessage: false,
  });

  assert.ok(!event.message?.includes('next snapshot'));
  assert.match(event.message ?? '', /Example parser error/);
});

test('createDiagnosticsAwareParserHooks respects includeSourceLabelInMessage', () => {
  const diagnostic: Diagnostic = {
    code: 'DTIF_WARNING',
    severity: 'warning',
    message: 'Normalised warning',
  } as const;

  const events: DiagnosticEvent[] = [];
  const diagnostics: DiagnosticsPort = {
    emit(event) {
      events.push(event);
    },
  };

  const hooks = createDiagnosticsAwareParserHooks({
    diagnostics,
    scope: formatTokenSourceScope('previous'),
    sourceLabel: 'previous snapshot',
    includeSourceLabelInMessage: false,
  });

  hooks.onDiagnostic?.(diagnostic);

  assert.equal(events.length, 1);
  assert.equal(events[0]?.scope, formatTokenSourceScope('previous'));
  assert.ok(!events[0]?.message?.includes('previous snapshot'));
});

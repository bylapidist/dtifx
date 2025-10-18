import type {
  TokenSourceDiagnosticsPort as CoreTokenSourceDiagnosticsPort,
  TokenSourceContext as CoreTokenSourceContext,
  TokenSourceLabel as CoreTokenSourceLabel,
  TokenSourcePort as CoreTokenSourcePort,
} from '@dtifx/core';

import type { TokenSet } from '../../domain/tokens.js';
import type { DiagnosticEvent } from './diagnostics.js';

export type TokenSourceLabel = CoreTokenSourceLabel;
export type TokenSourceContext = CoreTokenSourceContext<DiagnosticEvent>;
export type TokenSourceDiagnosticsPort<Event = unknown> = CoreTokenSourceDiagnosticsPort<Event>;
export type TokenSourcePort = CoreTokenSourcePort<
  TokenSourceLabel,
  TokenSet,
  DiagnosticEvent,
  TokenSourceDiagnosticsPort<DiagnosticEvent>,
  TokenSourceContext
>;

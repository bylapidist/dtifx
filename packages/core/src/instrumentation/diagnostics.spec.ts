import { describe, expect, it, vi } from 'vitest';

import {
  createNullDiagnosticsPort,
  DiagnosticCategories,
  DiagnosticScopes,
  formatReportingScope,
} from './diagnostics.js';

describe('instrumentation/diagnostics', () => {
  it('formats reporting scopes consistently', () => {
    expect(formatReportingScope('cli')).toBe('reporting:cli');
    expect(formatReportingScope('html')).toBe('reporting:html');
  });

  it('exposes stable diagnostic categories and scopes', () => {
    expect(DiagnosticCategories.reporting).toBe('reporting');
    expect(DiagnosticCategories.tokenSourceParser).toBe('token-source.parser');
    expect(DiagnosticScopes.tokenSourceGit).toBe('token-source.git');
  });

  it('provides a noop diagnostics port', () => {
    const port = createNullDiagnosticsPort();
    const event = {
      level: 'info',
      message: 'noop test',
      pointer: '#/noop',
      span: { start: { line: 1, column: 1 } },
      related: [
        {
          message: 'related',
          pointer: '#/noop/related',
          span: { start: { line: 2, column: 3 }, end: { line: 2, column: 10 } },
        },
      ],
    } as const;
    const spy = vi.spyOn(port, 'emit');

    port.emit(event);
    expect(spy).toHaveBeenCalledWith(event);
  });
});

import { describe, expect, it } from 'vitest';

import {
  convertParserDiagnostic,
  convertParserDiagnosticRelatedInformation,
  convertParserDiagnosticSpan,
  mapParserDiagnosticSeverity,
  type ParserDiagnostic,
  type ParserDiagnosticRelatedInformation,
  type ParserDiagnosticSpan,
} from './parser-diagnostics.js';

function createSpan(overrides: Partial<ParserDiagnosticSpan> = {}): ParserDiagnosticSpan {
  return {
    start: { line: 1, column: 2 },
    end: { line: 3, column: 4 },
    ...overrides,
  } satisfies ParserDiagnosticSpan;
}

describe('mapParserDiagnosticSeverity', () => {
  it('maps info to info', () => {
    expect(mapParserDiagnosticSeverity('info')).toBe('info');
  });

  it('maps warning to warn', () => {
    expect(mapParserDiagnosticSeverity('warning')).toBe('warn');
  });

  it('maps error to error', () => {
    expect(mapParserDiagnosticSeverity('error')).toBe('error');
  });

  it('falls back to error for unknown severities', () => {
    expect(mapParserDiagnosticSeverity('fatal' as ParserDiagnostic['severity'])).toBe('error');
  });
});

describe('convertParserDiagnosticSpan', () => {
  it('returns undefined when no span is provided', () => {
    const missingSpan: ParserDiagnosticSpan | undefined = undefined;
    expect(convertParserDiagnosticSpan(missingSpan)).toBeUndefined();
  });

  it('converts start positions', () => {
    const span = convertParserDiagnosticSpan({
      start: { line: 1, column: 2 },
    } as ParserDiagnosticSpan);
    expect(span).toEqual({ start: { line: 1, column: 2 } });
  });

  it('converts end positions when present', () => {
    const span = convertParserDiagnosticSpan(createSpan());
    expect(span).toEqual({
      start: { line: 1, column: 2 },
      end: { line: 3, column: 4 },
    });
  });
});

describe('convertParserDiagnosticRelatedInformation', () => {
  it('returns undefined when no related information is provided', () => {
    const absent: ParserDiagnosticRelatedInformation[] | undefined = undefined;
    expect(convertParserDiagnosticRelatedInformation(absent)).toBeUndefined();
    expect(convertParserDiagnosticRelatedInformation([])).toBeUndefined();
  });

  it('converts related information entries', () => {
    const related: ParserDiagnosticRelatedInformation[] = [
      {
        message: 'details',
        pointer: '/tokens/0',
        span: {
          start: { line: 1, column: 2 },
        } as ParserDiagnosticSpan,
      },
    ];

    expect(convertParserDiagnosticRelatedInformation(related)).toEqual([
      {
        message: 'details',
        pointer: '/tokens/0',
        span: { start: { line: 1, column: 2 } },
      },
    ]);
  });
});

describe('convertParserDiagnostic', () => {
  it('converts standard diagnostic properties', () => {
    const diagnostic: ParserDiagnostic = {
      severity: 'warning',
      code: 'D001',
      message: 'Something happened',
      pointer: '/tokens/1',
      span: createSpan(),
      related: [
        {
          message: 'upstream',
          pointer: '/tokens/0',
          span: {
            start: { line: 1, column: 2 },
          } as ParserDiagnosticSpan,
        },
      ],
    } satisfies ParserDiagnostic;

    expect(convertParserDiagnostic(diagnostic)).toEqual({
      level: 'warn',
      message: 'Something happened',
      code: 'D001',
      pointer: '/tokens/1',
      span: {
        start: { line: 1, column: 2 },
        end: { line: 3, column: 4 },
      },
      related: [
        {
          message: 'upstream',
          pointer: '/tokens/0',
          span: {
            start: { line: 1, column: 2 },
          },
        },
      ],
    });
  });

  it('omits optional fields when not provided', () => {
    const diagnostic: ParserDiagnostic = {
      severity: 'info',
      message: 'Informational',
    } satisfies ParserDiagnostic;

    expect(convertParserDiagnostic(diagnostic)).toEqual({
      level: 'info',
      message: 'Informational',
    });
  });
});

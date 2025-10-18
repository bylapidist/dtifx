import { describe, expect, it } from 'vitest';

import { DiagnosticCategories } from '../instrumentation/diagnostics.js';

import {
  convertTokenSourceIssueToDiagnostic,
  convertTokenSourceIssues,
  type TokenSourceRepositoryIssue,
  type TokenSourceValidationIssue,
} from './issues.js';

describe('convertTokenSourceIssueToDiagnostic', () => {
  it('converts repository issues to diagnostics with default scope', () => {
    const issue: TokenSourceRepositoryIssue = {
      kind: 'repository',
      sourceId: 'alpha',
      uri: 'file:///tokens.json',
      pointerPrefix: '/',
      code: 'parse-error',
      message: 'Failed to parse JSON',
    };

    const diagnostic = convertTokenSourceIssueToDiagnostic(issue, { label: 'previous' });

    expect(diagnostic).toEqual({
      level: 'error',
      message: 'Failed to parse JSON',
      code: 'parse-error',
      scope: 'token-source:previous',
      category: DiagnosticCategories.tokenSource,
      pointer: '/',
      related: [
        { message: 'Source alpha', pointer: '/' },
        { message: 'Source URI (file:///tokens.json)' },
      ],
    });
  });

  it('maps validation issues to diagnostics and preserves severity', () => {
    const issue: TokenSourceValidationIssue = {
      kind: 'validation',
      sourceId: 'beta',
      uri: 'file:///example/tokens.json',
      pointerPrefix: '/tokens',
      pointer: '/tokens/button/color',
      instancePath: '/button/color',
      keyword: 'type',
      message: 'Expected string',
      schemaPath: '#/definitions/color/type',
      params: { expected: 'string' },
      severity: 'warning',
    };

    const diagnostic = convertTokenSourceIssueToDiagnostic(issue, {
      scope: 'token-source.custom',
      category: 'custom-category',
    });

    expect(diagnostic).toEqual({
      level: 'warn',
      message: 'Expected string',
      code: 'type',
      scope: 'token-source.custom',
      category: 'custom-category',
      pointer: '/tokens/button/color',
      related: [
        { message: 'Source beta', pointer: '/tokens' },
        { message: 'Source URI (file:///example/tokens.json)' },
        { message: 'Instance path', pointer: '/button/color' },
        { message: 'Schema path', pointer: '#/definitions/color/type' },
        { message: 'Validation parameters' },
      ],
    });
  });
});

describe('convertTokenSourceIssues', () => {
  it('converts multiple issues with shared options', () => {
    const issues: TokenSourceRepositoryIssue[] = [
      {
        kind: 'repository',
        sourceId: 'alpha',
        uri: 'file:///tokens.json',
        pointerPrefix: '/',
        code: 'fetch',
        message: 'Unable to read file',
      },
      {
        kind: 'repository',
        sourceId: 'beta',
        uri: 'file:///missing.json',
        pointerPrefix: '/',
        code: 'missing',
        message: 'File missing',
        severity: 'warning',
      },
    ];

    const diagnostics = convertTokenSourceIssues(issues, { label: 'next' });

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({
      scope: 'token-source:next',
      level: 'error',
    });
    expect(diagnostics[1]).toMatchObject({
      scope: 'token-source:next',
      level: 'warn',
    });
  });
});

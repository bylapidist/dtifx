import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { diffTokenSets } from '../../src/diff.js';
import { formatDiffAsCli } from '../../src/reporting/renderers/cli.js';
import type { CliFormatterOptions } from '../../src/reporting/renderers/cli.js';
import { DiagnosticCategories, type DiagnosticsPort } from '../../src/reporting/index.js';
import { createTokenSetFromTree } from '../../src/token-set.js';

describe('formatDiffAsCli diagnostics', () => {
  const originalTerm = process.env.TERM;
  const originalCi = process.env.CI;
  let originalIsTty: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalIsTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY') ?? undefined;
  });

  afterEach(() => {
    if (originalTerm === undefined) {
      delete process.env.TERM;
    } else {
      process.env.TERM = originalTerm;
    }

    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }

    if (originalIsTty) {
      Object.defineProperty(process.stdout, 'isTTY', originalIsTty);
    } else {
      delete (process.stdout as { isTTY?: boolean }).isTTY;
    }
  });

  test('emits diagnostics when normalizing CLI options', () => {
    process.env.TERM = 'linux';
    process.env.CI = '1';
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });

    const diagnosticsEvents: Array<{
      code?: string;
      level: string;
      message: string;
      category?: string;
    }> = [];
    const diagnostics: DiagnosticsPort = {
      emit(event) {
        diagnosticsEvents.push({
          code: event.code,
          level: event.level,
          message: event.message,
          category: event.category,
        });
      },
    };

    const previous = createTokenSetFromTree({
      color: {
        base: {
          primary: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [0, 0, 0], hex: '#000000' },
          },
        },
      },
    });
    const next = createTokenSetFromTree({
      color: {
        base: {
          primary: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [1, 1, 1], hex: '#FFFFFF' },
          },
        },
      },
    });
    const diff = diffTokenSets(previous, next);

    formatDiffAsCli(
      diff,
      {
        color: false,
        mode: 'unknown' as CliFormatterOptions['mode'],
        width: -5,
        diffContext: -2,
        topRisks: 200,
      },
      { diagnostics },
    );

    const codes = diagnosticsEvents.map((event) => event.code);
    const categories = new Set(diagnosticsEvents.map((event) => event.category));

    expect(codes).toContain('CLI_MODE_UNRECOGNIZED');
    expect(codes).toContain('CLI_LINKS_DISABLED');
    expect(codes).toContain('CLI_UNICODE_DISABLED');
    expect(codes).toContain('CLI_WIDTH_INVALID');
    expect(codes).toContain('CLI_DIFF_CONTEXT_NEGATIVE');
    expect(codes).toContain('CLI_TOP_RISKS_CLAMPED');
    expect(categories.has(DiagnosticCategories.reportingCli)).toBe(true);
  });
});

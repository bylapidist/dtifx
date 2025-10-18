import { describe, expect, it, vi } from 'vitest';

import type { CommanderCompareOptions, ResolveCompareDefaults } from './compare-options.js';
import { resolveCompareCommand } from './compare-options.js';

type OptionOverrides = Partial<CommanderCompareOptions>;

type DefaultOverrides = Partial<ResolveCompareDefaults>;

const resolve = (
  options: OptionOverrides,
  defaults: DefaultOverrides = {},
  { linksExplicit = false }: { readonly linksExplicit?: boolean } = {},
) => {
  const result = resolveCompareCommand({
    previous: 'previous.json',
    next: 'next.json',
    options: options as CommanderCompareOptions,
    defaults: { color: true, links: true, ...defaults },
    linksExplicit,
  });

  return result.options;
};

describe('resolveCompareCommand', () => {
  it('normalizes impact filters', () => {
    const options = resolve({ filterImpact: ['breaking,non-breaking'] });
    expect(options.filterImpacts).toEqual(['breaking', 'non-breaking']);
  });

  it('normalizes change kind filters', () => {
    const options = resolve({ filterKind: ['added,removed'] });
    expect(options.filterKinds).toEqual(['added', 'removed']);
  });

  it('parses filter groups', () => {
    const options = resolve({ filterGroup: ['Spacing, Color '] });
    expect(options.filterGroups).toEqual(['Spacing', 'Color']);
  });

  it('tolerates repeated impacts', () => {
    const options = resolve({ filterImpact: ['breaking,breaking'] });
    expect(options.filterImpacts).toEqual(['breaking']);
  });

  it('accepts kind aliases', () => {
    const options = resolve({ filterKind: ['addition,modifications,rename'] });
    expect(options.filterKinds).toEqual(['added', 'changed', 'renamed']);
  });

  it('supports nonbreaking alias', () => {
    const options = resolve({ filterImpact: ['nonBreaking'] });
    expect(options.filterImpacts).toEqual(['non-breaking']);
  });

  it('converts only-breaking shortcut into breaking impact filter', () => {
    const options = resolve({ onlyBreaking: true });
    expect(options.filterImpacts).toEqual(['breaking']);
  });

  it('parses fail-on policies', () => {
    const options = resolve({ failOnBreaking: true, failOnChanges: true });
    expect(options.failOnBreaking).toBe(true);
    expect(options.failOnChanges).toBe(true);
  });

  it('rejects conflicting filters', () => {
    expect(() =>
      resolve({
        onlyBreaking: true,
        filterImpact: ['non-breaking'],
      }),
    ).toThrow(/--only-breaking cannot be combined/);
  });

  it('parses advanced reporter toggles', () => {
    const options = resolve(
      {
        verbose: true,
        why: true,
        diffContext: '5',
        topRisks: '7',
        links: false,
      },
      {},
      { linksExplicit: true },
    );

    expect(options.verbose).toBe(true);
    expect(options.why).toBe(true);
    expect(options.diffContext).toBe(5);
    expect(options.topRisks).toBe(7);
    expect(options.links).toBe(false);
  });

  it('honours hyperlink defaults', () => {
    const disabledByDefault = resolve({}, { links: false });
    expect(disabledByDefault.links).toBe(false);

    const reenabled = resolve({ links: true }, { links: false }, { linksExplicit: true });
    expect(reenabled.links).toBe(true);
  });

  it('disables hyperlinks when defaults omit the setting', () => {
    const options = resolveCompareCommand({
      previous: 'previous.json',
      next: 'next.json',
      options: {} as CommanderCompareOptions,
      defaults: {},
      linksExplicit: false,
    });

    expect(options.options.links).toBe(false);
  });

  it('honours unicode overrides', () => {
    const disabled = resolve({ unicode: false });
    expect(disabled.unicode).toBe(false);

    const enabled = resolve({ unicode: true });
    expect(enabled.unicode).toBe(true);
  });

  it('rejects unknown change kind filters', () => {
    expect(() => resolve({ filterKind: ['moved'] })).toThrow(/Unknown change kind filter/);
  });

  it('recognises yaml format', () => {
    const options = resolve({ format: 'yaml' });
    expect(options.format).toBe('yaml');
  });

  it('recognises sarif format', () => {
    const options = resolve({ format: 'sarif' });
    expect(options.format).toBe('sarif');
  });

  it('recognises template format', () => {
    const options = resolve({ format: 'template', template: 'report.hbs' });
    expect(options.format).toBe('template');
    expect(options.templatePath).toBe('report.hbs');
    expect(options.templateAllowUnescapedOutput).toBe(false);
  });

  it('parses template partial definitions', () => {
    const options = resolve({
      format: 'template',
      template: 'report.hbs',
      templatePartial: ['summary=templates/summary.hbs', 'footer = footer.hbs'],
    });

    expect(options.templatePartials).toEqual([
      { name: 'summary', path: 'templates/summary.hbs' },
      { name: 'footer', path: 'footer.hbs' },
    ]);
  });

  it('enables unsafe template mode when requested', () => {
    const options = resolve({
      format: 'template',
      template: 'report.hbs',
      templateUnsafeNoEscape: true,
    });

    expect(options.templateAllowUnescapedOutput).toBe(true);
  });

  it('captures diff strategy module specifiers', () => {
    const options = resolve({
      renameStrategy: './strategies/custom-rename.mjs',
      impactStrategy: './strategies/custom-impact.mjs',
      summaryStrategy: './strategies/custom-summary.mjs',
    });

    expect(options.renameStrategy).toBe('./strategies/custom-rename.mjs');
    expect(options.impactStrategy).toBe('./strategies/custom-impact.mjs');
    expect(options.summaryStrategy).toBe('./strategies/custom-summary.mjs');
  });
});

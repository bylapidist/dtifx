import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadDiffStrategies } from './strategies.js';

const { relative } = path;

const fixturePath = (name: string): string => {
  const url = new URL(`../../../tests/fixtures/strategies/${name}`, import.meta.url);
  return relative(process.cwd(), fileURLToPath(url));
};

describe('loadDiffStrategies', () => {
  it('loads strategies from relative module specifiers', async () => {
    const strategies = await loadDiffStrategies({
      renameStrategy: fixturePath('no-rename-strategy.mjs'),
      impactStrategy: fixturePath('custom-impact-strategy.mjs'),
      summaryStrategy: fixturePath('custom-summary-strategy.mjs'),
    });

    expect(strategies?.renameStrategy).toBeDefined();
    expect(strategies?.impactStrategy).toBeDefined();
    expect(strategies?.summaryStrategy).toBeDefined();

    const renameResult = strategies!.renameStrategy!.detectRenames(
      [],
      [],
      strategies!.impactStrategy!,
    );
    expect(renameResult).toEqual({
      renamed: [],
      remainingRemoved: [],
      remainingAdded: [],
    });
    expect(strategies!.impactStrategy!.classifyAddition({} as never)).toBe('breaking');
    const summary = strategies!.summaryStrategy!.createSummary({
      previous: new Map(),
      next: new Map(),
      added: [],
      removed: [],
      changed: [],
      renamed: [],
    } as never);
    expect(summary.recommendedBump).toBe('none');
  });

  it('loads strategies exported from factory functions', async () => {
    const strategies = await loadDiffStrategies({
      renameStrategy: fixturePath('factory-rename-strategy.mjs'),
      impactStrategy: fixturePath('factory-impact-strategy.mjs'),
      summaryStrategy: fixturePath('async-summary-strategy.mjs'),
    });

    expect(strategies).toBeDefined();
    const renameResult = strategies?.renameStrategy?.detectRenames(
      [],
      [],
      strategies!.impactStrategy!,
    );
    expect(renameResult?.remainingRemoved.length).toBe(0);
    expect(strategies?.impactStrategy?.classifyRemoval({} as never)).toBe('breaking');

    const summary = await strategies?.summaryStrategy?.createSummary({
      previous: new Map(),
      next: new Map(),
      added: [],
      removed: [],
      changed: [],
      renamed: [],
    } as never);

    expect(summary?.recommendedBump).toBe('none');
  });

  it('throws when modules do not expose the expected contract', async () => {
    await expect(
      loadDiffStrategies({ renameStrategy: fixturePath('invalid-strategy.mjs') }),
    ).rejects.toThrow(/does not export a valid rename strategy/i);
  });

  it('supports absolute paths and file URLs', async () => {
    const absolutePath = path.resolve(process.cwd(), fixturePath('custom-summary-strategy.mjs'));
    const fileUrl = pathToFileURL(
      path.resolve(process.cwd(), fixturePath('custom-impact-strategy.mjs')),
    ).href;

    const strategies = await loadDiffStrategies({
      renameStrategy: fixturePath('no-rename-strategy.mjs'),
      impactStrategy: fileUrl,
      summaryStrategy: absolutePath,
    });

    expect(strategies?.impactStrategy).toBeDefined();
    expect(strategies?.summaryStrategy).toBeDefined();
  });

  it('rejects unsupported module specifier schemes', async () => {
    await expect(
      loadDiffStrategies({ renameStrategy: 'data:text/javascript,export default {}' }),
    ).rejects.toThrow(/must be bare package names or filesystem paths/i);

    await expect(loadDiffStrategies({ renameStrategy: 'node:path' })).rejects.toThrow(
      /must be bare package names or filesystem paths/i,
    );
  });
});

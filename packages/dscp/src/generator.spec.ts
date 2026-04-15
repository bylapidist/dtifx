import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generate, buildDocument } from './generator.js';
import { renderMarkdown } from '@lapidist/dscp';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTokenSnapshot(tokens: unknown): string {
  return JSON.stringify(tokens);
}

function colorToken(id: string, pointer: string, value: string) {
  return { id, pointer, name: pointer, type: 'color', value };
}

function dimensionToken(id: string, pointer: string, value: string) {
  return { id, pointer, name: pointer, type: 'dimension', value };
}

function typelessToken(id: string, pointer: string) {
  return { id, pointer, name: pointer };
}

// ---------------------------------------------------------------------------
// buildDocument
// ---------------------------------------------------------------------------

describe('buildDocument', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'dscp-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('produces a canonical DSCPDocument envelope', async () => {
    const tokens = [colorToken('c1', '/color/primary', '#ff0000')];
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));

    const doc = await buildDocument(dir);

    expect(doc.$schema).toBe('https://dscp.lapidist.net/schema/v1.json');
    expect(doc.specVersion).toBe('1.0.0');
    expect(typeof doc.generatedAt).toBe('string');
    expect(typeof doc.kernelSnapshotHash).toBe('string');
    expect(doc.kernelSnapshotHash).toHaveLength(64); // SHA-256 hex
  });

  it('parses a flat token array into the token graph', async () => {
    const tokens = [
      colorToken('c1', '/color/primary', '#ff0000'),
      dimensionToken('d1', '/spacing/small', '4px'),
    ];
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));

    const doc = await buildDocument(dir);

    expect(doc.tokenGraph.totalCount).toBe(2);
    const colorEntries = doc.tokenGraph.byType['color'];
    expect(colorEntries).toBeDefined();
    expect(colorEntries!).toHaveLength(1);
    expect(colorEntries![0].pointer).toBe('/color/primary');
    expect(colorEntries![0].value).toBe('#ff0000');

    const dimEntries = doc.tokenGraph.byType['dimension'];
    expect(dimEntries).toBeDefined();
    expect(dimEntries!).toHaveLength(1);
  });

  it('groups tokens without a type outside byType', async () => {
    const tokens = [typelessToken('t1', '/mystery/token')];
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));

    const doc = await buildDocument(dir);

    // Typeless tokens are counted in totalCount but not placed in byType
    expect(doc.tokenGraph.totalCount).toBe(1);
    expect(Object.keys(doc.tokenGraph.byType)).toHaveLength(0);
  });

  it('returns empty token graph for an empty token list', async () => {
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot([]));
    const doc = await buildDocument(dir);
    expect(doc.tokenGraph.totalCount).toBe(0);
    expect(Object.keys(doc.tokenGraph.byType)).toHaveLength(0);
  });

  it('produces empty component registry, deprecation ledger, violations, and rules by default', async () => {
    const tokens = [colorToken('c1', '/color/primary', '#ff0000')];
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));

    const doc = await buildDocument(dir);

    expect(doc.componentRegistry.totalCount).toBe(0);
    expect(doc.componentRegistry.components).toHaveLength(0);
    expect(doc.deprecationLedger).toHaveLength(0);
    expect(doc.violations).toHaveLength(0);
    expect(doc.rules).toHaveLength(0);
  });

  it('skips primitive leaf values in nested object trees', async () => {
    const tree = {
      meta: 'some-string-value',
      color: { primary: colorToken('c1', '/color/primary', '#f00') },
    };
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tree));

    const doc = await buildDocument(dir);
    const colorEntries = doc.tokenGraph.byType['color'];
    expect(colorEntries!).toHaveLength(1);
  });

  it('flattens tokens nested inside an object tree', async () => {
    const tree = {
      color: {
        primary: colorToken('c1', '/color/primary', '#ff0000'),
        secondary: colorToken('c2', '/color/secondary', '#00ff00'),
      },
    };
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tree));

    const doc = await buildDocument(dir);
    expect(doc.tokenGraph.byType['color']!).toHaveLength(2);
  });

  it('produces a deterministic snapshot hash for the same tokens', async () => {
    const tokens = [colorToken('c1', '/color/primary', '#ff0000')];
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));

    const doc1 = await buildDocument(dir);
    const doc2 = await buildDocument(dir);
    expect(doc1.kernelSnapshotHash).toBe(doc2.kernelSnapshotHash);
  });

  it('rejects when tokens.json does not exist', async () => {
    await expect(buildDocument(dir)).rejects.toThrow();
  });

  it('rejects when tokens.json contains invalid JSON', async () => {
    await writeFile(path.join(dir, 'tokens.json'), 'not json {{');
    await expect(buildDocument(dir)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// renderMarkdown (re-exported from @lapidist/dscp)
// ---------------------------------------------------------------------------

describe('renderMarkdown', () => {
  it('includes a heading and snapshot hash', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'dscp-md-'));
    try {
      const tokens = [colorToken('c1', '/color/primary', '#ff0000')];
      await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));
      const doc = await buildDocument(dir);
      const md = renderMarkdown(doc);
      expect(md).toContain('# DESIGN_SYSTEM.md');
      expect(md).toContain(doc.kernelSnapshotHash);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('wraps each token section in typed block comments', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'dscp-md-'));
    try {
      const tokens = [colorToken('c1', '/color/primary', '#ff0000')];
      await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));
      const doc = await buildDocument(dir);
      const md = renderMarkdown(doc);
      expect(md).toContain('<!-- dscp:tokens:color -->');
      expect(md).toContain('<!-- /dscp:tokens:color -->');
      expect(md).toContain('/color/primary');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns only the heading for a document with no tokens', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'dscp-md-'));
    try {
      await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot([]));
      const doc = await buildDocument(dir);
      const md = renderMarkdown(doc);
      expect(md).toContain('# DESIGN_SYSTEM.md');
      expect(md).not.toContain('<!-- dscp:tokens:');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// generate (integration)
// ---------------------------------------------------------------------------

describe('generate', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'dscp-gen-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a DESIGN_SYSTEM.md file to the specified path', async () => {
    const tokens = [colorToken('c1', '/color/primary', '#ff0000')];
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));

    const out = path.join(dir, 'DESIGN_SYSTEM.md');
    await generate({ from: dir, out });

    const content = await readFile(out, 'utf8');
    expect(content).toContain('# DESIGN_SYSTEM.md');
    expect(content).toContain('/color/primary');
  });

  it('overwrites an existing output file', async () => {
    const tokens = [colorToken('c1', '/color/primary', '#ff0000')];
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));
    const out = path.join(dir, 'DESIGN_SYSTEM.md');
    await writeFile(out, 'old content');

    await generate({ from: dir, out });

    const content = await readFile(out, 'utf8');
    expect(content).not.toBe('old content');
    expect(content).toContain('# DESIGN_SYSTEM.md');
  });
});

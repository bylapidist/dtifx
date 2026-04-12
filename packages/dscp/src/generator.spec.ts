import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generate, buildDocument, renderMarkdown } from './generator.js';

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

  it('parses a flat token array into typed sections', async () => {
    const tokens = [
      colorToken('c1', '/color/primary', '#ff0000'),
      dimensionToken('d1', '/spacing/small', '4px'),
    ];
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));

    const doc = await buildDocument(dir);

    expect(doc.version).toBe(1);
    expect(typeof doc.generatedAt).toBe('string');
    expect(doc.sections).toHaveLength(2);

    const colorSection = doc.sections.find((s) => s.type === 'color');
    expect(colorSection).toBeDefined();
    expect(colorSection!.tokens).toHaveLength(1);
    expect(colorSection!.tokens[0].pointer).toBe('/color/primary');
    expect(colorSection!.tokens[0].value).toBe('#ff0000');

    const dimSection = doc.sections.find((s) => s.type === 'dimension');
    expect(dimSection).toBeDefined();
    expect(dimSection!.tokens).toHaveLength(1);
  });

  it('groups tokens without a type under "unknown"', async () => {
    const tokens = [typelessToken('t1', '/mystery/token')];
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));

    const doc = await buildDocument(dir);

    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].type).toBe('unknown');
    expect(doc.sections[0].tokens[0].pointer).toBe('/mystery/token');
  });

  it('returns an empty sections array for an empty token list', async () => {
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot([]));
    const doc = await buildDocument(dir);
    expect(doc.sections).toHaveLength(0);
  });

  it('sorts sections alphabetically by type', async () => {
    const tokens = [
      dimensionToken('d1', '/sp/sm', '4px'),
      colorToken('c1', '/col/pri', '#f00'),
      { id: 'a1', pointer: '/ani/fade', name: '/ani/fade', type: 'animation', value: '200ms' },
    ];
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tokens));

    const doc = await buildDocument(dir);

    const types = doc.sections.map((s) => s.type);
    expect(types).toEqual(types.toSorted());
  });

  it('skips primitive leaf values in nested object trees', async () => {
    const tree = {
      meta: 'some-string-value',
      color: { primary: colorToken('c1', '/color/primary', '#f00') },
    };
    await writeFile(path.join(dir, 'tokens.json'), makeTokenSnapshot(tree));

    const doc = await buildDocument(dir);
    const colorSection = doc.sections.find((s) => s.type === 'color');
    expect(colorSection!.tokens).toHaveLength(1);
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
    const colorSection = doc.sections.find((s) => s.type === 'color');
    expect(colorSection!.tokens).toHaveLength(2);
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
// renderMarkdown
// ---------------------------------------------------------------------------

describe('renderMarkdown', () => {
  it('includes dscp version and generatedAt comments', () => {
    const doc = {
      version: 1 as const,
      generatedAt: '2026-01-01T00:00:00.000Z',
      sections: [],
    };
    const md = renderMarkdown(doc);
    expect(md).toContain('<!-- dscp:version:1 -->');
    expect(md).toContain('<!-- dscp:generatedAt:2026-01-01T00:00:00.000Z -->');
  });

  it('wraps each section in typed block comments', () => {
    const doc = {
      version: 1 as const,
      generatedAt: '2026-01-01T00:00:00.000Z',
      sections: [
        {
          type: 'color',
          tokens: [
            {
              id: 'c1',
              pointer: '/color/primary',
              name: '/color/primary',
              type: 'color',
              value: '#ff0000',
            },
          ],
        },
      ],
    };
    const md = renderMarkdown(doc);
    expect(md).toContain('<!-- dscp:tokens:color -->');
    expect(md).toContain('<!-- /dscp:tokens:color -->');
  });

  it('renders each token as a Markdown table row', () => {
    const doc = {
      version: 1 as const,
      generatedAt: '2026-01-01T00:00:00.000Z',
      sections: [
        {
          type: 'color',
          tokens: [
            {
              id: 'c1',
              pointer: '/color/primary',
              name: '/color/primary',
              type: 'color',
              value: '#ff0000',
            },
          ],
        },
      ],
    };
    const md = renderMarkdown(doc);
    expect(md).toContain('| /color/primary | #ff0000 | color |');
    expect(md).toContain('| Token | Value | Type |');
    expect(md).toContain('| --- | --- | --- |');
  });

  it('renders an empty string value for tokens without a value', () => {
    const doc = {
      version: 1 as const,
      generatedAt: '2026-01-01T00:00:00.000Z',
      sections: [
        {
          type: 'color',
          tokens: [{ id: 'c1', pointer: '/color/pri', name: '/color/pri', type: 'color' }],
        },
      ],
    };
    const md = renderMarkdown(doc);
    expect(md).toContain('| /color/pri |  | color |');
  });

  it('returns only headers for a document with no sections', () => {
    const doc = {
      version: 1 as const,
      generatedAt: '2026-01-01T00:00:00.000Z',
      sections: [],
    };
    const md = renderMarkdown(doc);
    expect(md).toContain('<!-- dscp:version:1 -->');
    expect(md).not.toContain('<!-- dscp:tokens:');
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
    expect(content).toContain('<!-- dscp:version:1 -->');
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
    expect(content).toContain('<!-- dscp:version:1 -->');
  });
});

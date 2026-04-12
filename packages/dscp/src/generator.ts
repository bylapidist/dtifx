import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DSCPDocument, DSCPSection, DSCPToken, GenerateOptions } from './types.js';

const DEFAULT_TOKENS_FILENAME = 'tokens.json';

/**
 * Generates a DSCP document from a completed dtifx build output directory and
 * writes the resulting DESIGN_SYSTEM.md (or the path specified by `out`).
 *
 * @param {GenerateOptions} options - The source directory and output file path.
 * @returns {Promise<void>} Resolves when the file has been written.
 */
export async function generate(options: GenerateOptions): Promise<void> {
  const document = await buildDocument(options.from);
  const markdown = renderMarkdown(document);
  await writeFile(options.out, markdown, 'utf8');
}

/**
 * Builds the structured DSCPDocument from the token snapshot in `fromDir`.
 *
 * @param {string} fromDir - Path to the dtifx build output directory.
 * @returns {Promise<DSCPDocument>} The structured DSCP document.
 */
export async function buildDocument(fromDir: string): Promise<DSCPDocument> {
  const snapshotPath = path.join(fromDir, DEFAULT_TOKENS_FILENAME);
  const raw = await readFile(snapshotPath, 'utf8');
  const tree: unknown = JSON.parse(raw);

  const flat = flattenTree(tree);
  const sections = groupByType(flat);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sections,
  };
}

/**
 * Renders a DSCPDocument to a Markdown string using the DSCP typed fenced block format.
 *
 * @param {DSCPDocument} document - The structured DSCP document to render.
 * @returns {string} The rendered Markdown content.
 */
export function renderMarkdown(document: DSCPDocument): string {
  const header = [
    '<!-- dscp:version:1 -->',
    `<!-- dscp:generatedAt:${document.generatedAt} -->`,
    '',
  ];

  const body = document.sections.flatMap((section) => {
    const { type } = section;
    const rows = section.tokens.map((token) => {
      const value = token.value === undefined ? '' : String(token.value);
      return `| ${token.pointer} | ${value} | ${type} |`;
    });
    return [
      `<!-- dscp:tokens:${type} -->`,
      '| Token | Value | Type |',
      '| --- | --- | --- |',
      ...rows,
      `<!-- /dscp:tokens:${type} -->`,
      '',
    ];
  });

  return [...header, ...body].join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawToken {
  readonly id?: unknown;
  readonly pointer?: unknown;
  readonly name?: unknown;
  readonly type?: unknown;
  readonly value?: unknown;
}

/**
 * Returns `true` when `value` has the minimal shape of a DtifFlattenedToken.
 *
 * @param {unknown} value - The value to inspect.
 * @returns {value is RawToken} Whether the value is a raw token object.
 */
function isRawToken(value: unknown): value is RawToken {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'pointer' in value &&
    'name' in value
  );
}

/**
 * Walks a nested pointer tree and collects every leaf that looks like a
 * DtifFlattenedToken (has `id`, `pointer`, and `name` fields).
 *
 * @param {unknown} node - A node in the pointer tree (or the root).
 * @returns {DSCPToken[]} Flat list of collected tokens.
 */
function flattenTree(node: unknown): DSCPToken[] {
  if (isRawToken(node)) {
    const base = {
      id: String(node.id ?? ''),
      pointer: String(node.pointer ?? ''),
      name: String(node.name ?? ''),
    };
    const withType = node.type === undefined ? base : { ...base, type: String(node.type) };
    const token: DSCPToken =
      node.value === undefined ? withType : { ...withType, value: node.value };
    return [token];
  }

  if (typeof node === 'object' && node !== null) {
    return Object.values(node).flatMap((child) => flattenTree(child));
  }

  return [];
}

/**
 * Groups a flat list of tokens into sections, one per `type`. Tokens without
 * a `type` are grouped under the section key `unknown`.
 *
 * @param {DSCPToken[]} tokens - Flat list of tokens to group.
 * @returns {DSCPSection[]} Sections sorted alphabetically by type.
 */
function groupByType(tokens: DSCPToken[]): DSCPSection[] {
  const map = new Map<string, DSCPToken[]>();

  for (const token of tokens) {
    const key = token.type ?? 'unknown';
    const bucket = map.get(key);
    if (bucket === undefined) {
      map.set(key, [token]);
    } else {
      bucket.push(token);
    }
  }

  return [...map.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([type, sectionTokens]) => ({ type, tokens: sectionTokens }));
}

/**
 * Generates canonical DSCP documents from a completed dtifx build pipeline
 * output directory.
 *
 * The dtifx authoring path produces a `DSCPDocument` that conforms to the
 * canonical `@lapidist/dscp` v1 envelope. Sections that require runtime
 * kernel state (componentRegistry, deprecationLedger, violations, rules) are
 * populated with safe empty defaults — they can be enriched by a downstream
 * DSR kernel if one is connected.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  generateDocument,
  renderMarkdown,
  type GeneratorInput,
  type ViolationInput,
} from '@lapidist/dscp';

export type { DSCPDocument } from './types.js';
export { renderMarkdown } from '@lapidist/dscp';
export { DSCP_SCHEMA_URI, DSCP_SPEC_VERSION } from '@lapidist/dscp';

import type { DSCPDocument, GenerateOptions } from './types.js';

const DEFAULT_TOKENS_FILENAME = 'tokens.json';

// ---------------------------------------------------------------------------
// Intermediate representation — dtifx build tokens
// ---------------------------------------------------------------------------

interface FlatToken {
  readonly id: string;
  readonly pointer: string;
  readonly name: string;
  readonly type?: string;
  readonly value?: unknown;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a DSCP document from a completed dtifx build output directory and
 * writes the resulting DESIGN_SYSTEM.md (or the path specified by `out`).
 *
 * @param options - Source directory and output file path.
 * @returns Promise that resolves when the file has been written.
 */
export async function generate(options: GenerateOptions): Promise<void> {
  const document = await buildDocument(options.from);
  const markdown = renderMarkdown(document);
  await writeFile(options.out, markdown, 'utf8');
}

/**
 * Builds a canonical DSCPDocument from the token snapshot in `fromDir`.
 *
 * Token-graph sections are derived from the dtifx build output.
 * Component registry, deprecation ledger, violations, and rules are provided
 * as empty defaults.
 *
 * @param fromDir - Path to the dtifx build output directory.
 * @returns The generated DSCPDocument.
 */
export async function buildDocument(fromDir: string): Promise<DSCPDocument> {
  const snapshotPath = path.join(fromDir, DEFAULT_TOKENS_FILENAME);
  const raw = await readFile(snapshotPath, 'utf8');
  const tree: unknown = JSON.parse(raw);

  const flatTokens = flattenTree(tree);

  const allTokensMap = new Map<string, FlatToken>();
  const byType = new Map<string, FlatToken[]>();

  for (const token of flatTokens) {
    allTokensMap.set(token.pointer, token);
    if (token.type !== undefined) {
      const bucket = byType.get(token.type);
      if (bucket === undefined) {
        byType.set(token.type, [token]);
      } else {
        bucket.push(token);
      }
    }
  }

  const snapshotHash = computeSnapshotHash(flatTokens);

  const input: GeneratorInput = {
    tokenGraph: { tokens: allTokensMap, byType },
    componentRegistry: { components: new Map() },
    deprecationLedger: { entries: new Map() },
    ruleRegistry: { rules: new Map() },
    violations: [] as ViolationInput[],
    snapshotHash,
  };

  return generateDocument(input);
}

// ---------------------------------------------------------------------------
// Snapshot hash — deterministic SHA-256 of the sorted token pointer list
// ---------------------------------------------------------------------------

function computeSnapshotHash(tokens: FlatToken[]): string {
  const pointers = tokens.map((t) => t.pointer).toSorted();
  return createHash('sha256').update(pointers.join('\n')).digest('hex');
}

// ---------------------------------------------------------------------------
// Tree flattening — walks a nested dtifx build output and collects tokens
// ---------------------------------------------------------------------------

interface RawToken {
  readonly id?: unknown;
  readonly pointer?: unknown;
  readonly name?: unknown;
  readonly type?: unknown;
  readonly value?: unknown;
}

function isRawToken(value: unknown): value is RawToken {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'pointer' in value &&
    'name' in value
  );
}

function flattenTree(node: unknown): FlatToken[] {
  if (isRawToken(node)) {
    const base = {
      id: String(node.id ?? ''),
      pointer: String(node.pointer ?? ''),
      name: String(node.name ?? ''),
    };
    const withType = node.type === undefined ? base : { ...base, type: String(node.type) };
    const token: FlatToken =
      node.value === undefined ? withType : { ...withType, value: node.value };
    return [token];
  }

  if (typeof node === 'object' && node !== null) {
    return Object.values(node).flatMap((child) => flattenTree(child));
  }

  return [];
}

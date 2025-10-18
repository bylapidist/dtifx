import type { FormatterToken } from '../../formatter/formatter-registry.js';
import { collapseTokensToPointerTree, type TokenPointerTree } from './token-pointer-tree.js';

export const DEFAULT_MODULE_ROOT_IDENTIFIER = 'tokens';

export interface ModuleFormatterSharedOptions {
  readonly rootIdentifier: string;
  readonly namedExports: boolean;
  readonly transforms: readonly string[];
}

export interface ModuleNamedExportDefinition {
  readonly identifier: string;
  readonly propertyAccessor: string;
}

export type ModuleTokenTree = TokenPointerTree<Record<string, unknown>>;

/**
 * Builds a nested pointer tree containing serialisable token payloads.
 *
 * @param {readonly FormatterToken[]} tokens - Tokens that should be collapsed into the module tree.
 * @param {readonly string[]} transforms - Transform names that must be included on each token.
 * @returns {ModuleTokenTree} Plain object hierarchy describing the tokens.
 */
export function createModuleTokenTree(
  tokens: readonly FormatterToken[],
  transforms: readonly string[],
): ModuleTokenTree {
  return collapseTokensToPointerTree(tokens, (token) =>
    createModuleTokenValue(token, new Set(transforms)),
  );
}

/**
 * Serialises a module token tree into a JavaScript object literal string.
 *
 * @param {ModuleTokenTree} tree - Token tree to serialise.
 * @returns {string} JavaScript source representing the tree.
 */
export function serialiseModuleTree(tree: ModuleTokenTree): string {
  return formatValue(tree, 0);
}

/**
 * Serialises a module token tree into a TypeScript type literal string.
 *
 * @param {ModuleTokenTree} tree - Token tree to describe with types.
 * @returns {string} Type literal string mirroring the runtime shape.
 */
export function createModuleTypeLiteral(tree: ModuleTokenTree): string {
  return formatType(tree, 0);
}

/**
 * Generates named export definitions for the provided tree when enabled.
 *
 * @param {ModuleTokenTree} tree - Token tree used to derive the root keys.
 * @param {string} rootIdentifier - Identifier used for the exported root object.
 * @param {boolean} includeNamedExports - Whether named exports should be generated.
 * @returns {readonly ModuleNamedExportDefinition[]} Named export entries referencing top-level keys.
 */
export function createNamedExportDefinitions(
  tree: ModuleTokenTree,
  rootIdentifier: string,
  includeNamedExports: boolean,
): readonly ModuleNamedExportDefinition[] {
  if (!includeNamedExports) {
    return [];
  }
  const seen = new Set<string>([rootIdentifier]);
  const keys = Object.keys(tree).toSorted((left, right) => left.localeCompare(right));
  return keys.map(
    (key) =>
      ({
        identifier: createStableIdentifier(key, seen),
        propertyAccessor: isValidIdentifier(key) ? `.${key}` : `[${JSON.stringify(key)}]`,
      }) satisfies ModuleNamedExportDefinition,
  );
}

/**
 * Validates that a string is a safe JavaScript identifier used for exports.
 *
 * @param {string} identifier - Identifier candidate to validate.
 * @param {string} formatterName - Formatter name for error messages.
 * @returns {string} Normalised identifier.
 */
export function normaliseRootIdentifier(identifier: string, formatterName: string): string {
  const trimmed = identifier.trim();
  if (trimmed.length === 0) {
    throw new TypeError(`Formatter "${formatterName}" rootIdentifier must be a non-empty string.`);
  }
  if (!isValidIdentifier(trimmed)) {
    throw new TypeError(
      `Formatter "${formatterName}" rootIdentifier must be a valid JavaScript identifier string.`,
    );
  }
  return trimmed;
}

/**
 * Normalises a `namedExports` option value.
 *
 * @param {unknown} value - Raw option value supplied by configuration.
 * @param {string} formatterName - Formatter name for error messages.
 * @returns {boolean} Normalised boolean flag.
 */
export function normaliseNamedExports(value: unknown, formatterName: string): boolean {
  if (value === undefined) {
    return false;
  }
  if (typeof value !== 'boolean') {
    throw new TypeError(
      `Formatter "${formatterName}" namedExports must be a boolean when provided.`,
    );
  }
  return value;
}

function createModuleTokenValue(
  token: FormatterToken,
  requiredTransforms: ReadonlySet<string>,
): Record<string, unknown> {
  const base = normaliseSerializableValue(structuredClone(token.snapshot.token)) as Record<
    string,
    unknown
  >;

  if (token.metadata !== undefined) {
    base['metadata'] = normaliseSerializableValue(structuredClone(token.metadata));
  }

  if (requiredTransforms.size > 0) {
    const entries: [string, unknown][] = [];
    for (const transformName of requiredTransforms) {
      if (!token.transforms.has(transformName)) {
        continue;
      }
      const value = token.transforms.get(transformName);
      if (value === undefined) {
        continue;
      }
      entries.push([transformName, normaliseSerializableValue(structuredClone(value))]);
    }
    if (entries.length > 0) {
      base['transforms'] = Object.fromEntries(entries);
    }
  }

  return base;
}

function normaliseSerializableValue(value: unknown): unknown {
  if (value === null) {
    return value;
  }
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return value;
  }
  if (valueType === 'bigint') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof URL) {
    return value.toString();
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries(), ([key, entry]) => [
        String(key),
        normaliseSerializableValue(entry),
      ]),
    );
  }
  if (value instanceof Set) {
    return Array.from(value.values(), (entry) => normaliseSerializableValue(entry));
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normaliseSerializableValue(entry));
  }
  if (valueType === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, unknown] => entry[1] !== undefined,
    );
    return Object.fromEntries(
      entries.map(([key, entry]) => [key, normaliseSerializableValue(entry)]),
    );
  }
  return value;
}

function formatValue(value: unknown, indentLevel: number): string {
  if (value === null) {
    return 'null';
  }
  const valueType = typeof value;
  if (valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new TypeError('Cannot serialise non-finite numbers in module output.');
    }
    return String(value);
  }
  if (valueType === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const nextIndent = indent(indentLevel + 1);
    const items = value.map((entry) => `${nextIndent}${formatValue(entry, indentLevel + 1)}`);
    return `[
${items.join(',\n')}
${indent(indentLevel)}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).toSorted((left, right) =>
      left[0].localeCompare(right[0]),
    );
    if (entries.length === 0) {
      return '{}';
    }
    const nextIndent = indent(indentLevel + 1);
    const lines = entries.map(([key, entry]) => {
      const property = isValidIdentifier(key) ? key : JSON.stringify(key);
      return `${nextIndent}${property}: ${formatValue(entry, indentLevel + 1)}`;
    });
    return `{
${lines.join(',\n')}
${indent(indentLevel)}}`;
  }
  return 'undefined';
}

function formatType(value: unknown, indentLevel: number): string {
  if (value === null) {
    return 'null';
  }
  const valueType = typeof value;
  if (valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'number') {
    if (!Number.isFinite(value as number)) {
      return 'number';
    }
    return String(value);
  }
  if (valueType === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'readonly []';
    }
    const nextIndent = indent(indentLevel + 1);
    const items = value.map((entry) => `${nextIndent}${formatType(entry, indentLevel + 1)}`);
    return `readonly [
${items.join(',\n')}
${indent(indentLevel)}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).toSorted((left, right) =>
      left[0].localeCompare(right[0]),
    );
    if (entries.length === 0) {
      return '{}';
    }
    const nextIndent = indent(indentLevel + 1);
    const lines = entries.map(([key, entry]) => {
      const property = isValidIdentifier(key) ? key : JSON.stringify(key);
      return `${nextIndent}readonly ${property}: ${formatType(entry, indentLevel + 1)};`;
    });
    return `{
${lines.join('\n')}
${indent(indentLevel)}}`;
  }
  return 'unknown';
}

function createStableIdentifier(key: string, seen: Set<string>): string {
  const base = (() => {
    const normalised = key.replaceAll(/[^A-Za-z0-9_$]/g, '_');
    const trimmed = normalised.replaceAll(/^_+/g, '');
    const candidate = trimmed.length === 0 ? 'segment' : trimmed;
    if (!/^[A-Za-z_$]/.test(candidate)) {
      return `_${candidate}`;
    }
    return candidate;
  })();

  let identifier = base;
  let counter = 1;
  while (seen.has(identifier)) {
    identifier = `${base}_${counter}`;
    counter += 1;
  }
  seen.add(identifier);
  return identifier;
}

function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function indent(level: number): string {
  return '  '.repeat(level);
}

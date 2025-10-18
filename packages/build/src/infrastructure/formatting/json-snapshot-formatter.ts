import {
  assertAllowedKeys,
  assertNumberOption,
  assertPlainObject,
  assertStringOption,
  type ConfigOptionKind,
} from '../../config/config-options.js';
import type { FormatterDefinitionFactory } from '../../formatter/formatter-factory.js';
import type {
  FileArtifact,
  FormatterDefinition,
  FormatterToken,
} from '../../formatter/formatter-registry.js';
import { collapseTokensToPointerTree } from './token-pointer-tree.js';

const FORMATTER_NAME = 'json.snapshot';
const DEFAULT_FILENAME = 'tokens.json';
const DEFAULT_INDENT = 2;
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'indent']);
const MAX_INDENT = 10;

interface JsonSnapshotFormatterOptions {
  readonly filename: string;
  readonly indent: number;
}

/**
 * Creates the formatter definition factory responsible for emitting flattened token snapshots.
 * @returns {FormatterDefinitionFactory} The JSON snapshot formatter factory.
 */
export function createJsonSnapshotFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createJsonSnapshotFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): JsonSnapshotFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      indent: DEFAULT_INDENT,
    } satisfies JsonSnapshotFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);
  const typedOptions = options as {
    readonly filename?: unknown;
    readonly indent?: unknown;
  };

  const filename =
    typedOptions.filename === undefined
      ? DEFAULT_FILENAME
      : normaliseFilename(assertStringOption(typedOptions.filename, name, 'filename'), name);

  const indent =
    typedOptions.indent === undefined
      ? DEFAULT_INDENT
      : normaliseIndent(assertNumberOption(typedOptions.indent, name, 'indent'), name);

  return {
    filename,
    indent,
  } satisfies JsonSnapshotFormatterOptions;
}

function normaliseFilename(filename: string, name: string): string {
  const trimmed = filename.trim();
  if (trimmed.length === 0) {
    throw new TypeError(`Option "filename" for "${name}" must be a non-empty string.`);
  }
  return trimmed;
}

function normaliseIndent(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_INDENT) {
    throw new TypeError(
      `Option "indent" for "${name}" must be an integer between 0 and ${MAX_INDENT}. Received ${String(
        value,
      )}.`,
    );
  }
  return value;
}

function createJsonSnapshotFormatterDefinition(
  options: JsonSnapshotFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: {} as FormatterDefinition['selector'],
    run: async ({ tokens }) => {
      if (tokens.length === 0) {
        return [];
      }

      const document = createSnapshotDocument(tokens);
      const contents = `${JSON.stringify(document, undefined, options.indent)}\n`;
      const artifact: FileArtifact = {
        path: options.filename,
        contents,
        encoding: 'utf8',
        metadata: { tokenCount: tokens.length },
      } satisfies FileArtifact;
      return [artifact];
    },
  } satisfies FormatterDefinition;
}

function createSnapshotDocument(tokens: readonly FormatterToken[]): unknown {
  return collapseTokensToPointerTree(tokens, (token) => cloneJson(token.snapshot.token));
}

function cloneJson<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

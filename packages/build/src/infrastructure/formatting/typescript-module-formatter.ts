import {
  assertAllowedKeys,
  assertPlainObject,
  assertStringArrayOption,
  assertStringOption,
  type ConfigOptionKind,
} from '../../config/config-options.js';
import type { FormatterDefinitionFactory } from '../../formatter/formatter-factory.js';
import type { FileArtifact, FormatterDefinition } from '../../formatter/formatter-registry.js';
import {
  DEFAULT_MODULE_ROOT_IDENTIFIER,
  createModuleTokenTree,
  createNamedExportDefinitions,
  normaliseNamedExports,
  normaliseRootIdentifier,
  serialiseModuleTree,
  type ModuleFormatterSharedOptions,
  type ModuleNamedExportDefinition,
  type ModuleTokenTree,
} from './module-formatter-helpers.js';

const FORMATTER_NAME = 'typescript.module';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'rootIdentifier', 'namedExports', 'transforms']);
const DEFAULT_FILENAME = 'tokens.ts';

interface TypescriptModuleFormatterOptions extends ModuleFormatterSharedOptions {
  readonly filename: string;
}

/**
 * Creates the formatter definition factory responsible for emitting ESM TypeScript modules.
 * @returns {FormatterDefinitionFactory} The TypeScript module formatter factory.
 */
export function createTypescriptModuleFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createTypescriptModuleFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): TypescriptModuleFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      rootIdentifier: DEFAULT_MODULE_ROOT_IDENTIFIER,
      namedExports: false,
      transforms: [],
    } satisfies TypescriptModuleFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);
  const typed = options as {
    readonly filename?: unknown;
    readonly rootIdentifier?: unknown;
    readonly namedExports?: unknown;
    readonly transforms?: unknown;
  };

  const filenameOption =
    typed.filename === undefined
      ? DEFAULT_FILENAME
      : normaliseTypescriptFilename(assertStringOption(typed.filename, name, 'filename'), name);

  const rootIdentifier =
    typed.rootIdentifier === undefined
      ? DEFAULT_MODULE_ROOT_IDENTIFIER
      : normaliseRootIdentifier(
          assertStringOption(typed.rootIdentifier, name, 'rootIdentifier'),
          name,
        );

  const namedExports = normaliseNamedExports(typed.namedExports, name);
  const transforms =
    typed.transforms === undefined
      ? []
      : assertStringArrayOption(typed.transforms, name, 'transforms');

  return {
    filename: filenameOption,
    rootIdentifier,
    namedExports,
    transforms,
  } satisfies TypescriptModuleFormatterOptions;
}

function createTypescriptModuleFormatterDefinition(
  options: TypescriptModuleFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: options.transforms.length === 0 ? {} : { transforms: options.transforms },
    run: async ({ tokens }) => {
      if (tokens.length === 0) {
        return [];
      }

      const tree = createModuleTokenTree(tokens, options.transforms);
      const namedExports = createNamedExportDefinitions(
        tree,
        options.rootIdentifier,
        options.namedExports,
      );
      const source = createTypescriptModuleSource(tree, options, namedExports);
      const metadata = createArtifactMetadata(tokens.length, namedExports.length);

      const artifact: FileArtifact = {
        path: options.filename,
        contents: source,
        encoding: 'utf8',
        metadata,
      } satisfies FileArtifact;

      return [artifact];
    },
  } satisfies FormatterDefinition;
}

function createTypescriptModuleSource(
  tree: ModuleTokenTree,
  options: TypescriptModuleFormatterOptions,
  namedExports: readonly ModuleNamedExportDefinition[],
): string {
  const namedExportLines = namedExports.map(
    (entry) =>
      `export const ${entry.identifier} = ${options.rootIdentifier}${entry.propertyAccessor};`,
  );
  return [
    `export const ${options.rootIdentifier} = ${serialiseModuleTree(tree)} as const;`,
    ...namedExportLines,
    `export type TokenModule = typeof ${options.rootIdentifier};`,
    `export default ${options.rootIdentifier};`,
    '',
  ].join('\n');
}

function normaliseTypescriptFilename(filename: string, name: string): string {
  const trimmed = filename.trim();
  if (trimmed.length === 0) {
    throw new TypeError(`Option "filename" for "${name}" must be a non-empty string.`);
  }
  if (!trimmed.endsWith('.ts')) {
    throw new TypeError(`Option "filename" for "${name}" must end with ".ts".`);
  }
  return trimmed;
}

function createArtifactMetadata(
  tokenCount: number,
  namedExportCount: number,
): Record<string, unknown> {
  return {
    tokenCount,
    language: 'typescript',
    role: 'module',
    namedExportCount,
  } satisfies Record<string, unknown>;
}

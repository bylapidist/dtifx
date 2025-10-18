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
  createModuleTypeLiteral,
  createNamedExportDefinitions,
  normaliseNamedExports,
  normaliseRootIdentifier,
  serialiseModuleTree,
  type ModuleFormatterSharedOptions,
  type ModuleNamedExportDefinition,
  type ModuleTokenTree,
} from './module-formatter-helpers.js';

const FORMATTER_NAME = 'javascript.module';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'rootIdentifier', 'namedExports', 'transforms']);
const DEFAULT_FILENAME = 'tokens.js';

interface JavascriptModuleFormatterOptions extends ModuleFormatterSharedOptions {
  readonly filename: string;
  readonly declarationFilename: string;
}

/**
 * Creates the formatter definition factory responsible for emitting ESM JavaScript modules.
 * @returns {FormatterDefinitionFactory} The JavaScript module formatter factory.
 */
export function createJavascriptModuleFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createJavascriptModuleFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): JavascriptModuleFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      declarationFilename: toDeclarationFilename(DEFAULT_FILENAME, name),
      rootIdentifier: DEFAULT_MODULE_ROOT_IDENTIFIER,
      namedExports: false,
      transforms: [],
    } satisfies JavascriptModuleFormatterOptions;
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
      : normaliseFilename(assertStringOption(typed.filename, name, 'filename'), name);

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
    declarationFilename: toDeclarationFilename(filenameOption, name),
    rootIdentifier,
    namedExports,
    transforms,
  } satisfies JavascriptModuleFormatterOptions;
}

function createJavascriptModuleFormatterDefinition(
  options: JavascriptModuleFormatterOptions,
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
      const moduleSource = createJavascriptModuleSource(tree, options, namedExports);
      const declarationSource = createTypescriptDeclarationSource(tree, options, namedExports);

      const metadata = createArtifactMetadata(
        tokens.length,
        'javascript',
        namedExports.length,
        'module',
      );
      const declarationMetadata = createArtifactMetadata(
        tokens.length,
        'typescript',
        namedExports.length,
        'declaration',
      );

      const jsArtifact: FileArtifact = {
        path: options.filename,
        contents: moduleSource,
        encoding: 'utf8',
        metadata,
      } satisfies FileArtifact;

      const declarationArtifact: FileArtifact = {
        path: options.declarationFilename,
        contents: declarationSource,
        encoding: 'utf8',
        metadata: declarationMetadata,
      } satisfies FileArtifact;

      return [jsArtifact, declarationArtifact];
    },
  } satisfies FormatterDefinition;
}

function createJavascriptModuleSource(
  tree: ModuleTokenTree,
  options: JavascriptModuleFormatterOptions,
  namedExports: readonly ModuleNamedExportDefinition[],
): string {
  const namedExportLines = namedExports.map(
    (entry) =>
      `export const ${entry.identifier} = ${options.rootIdentifier}${entry.propertyAccessor};`,
  );
  return [
    `export const ${options.rootIdentifier} = ${serialiseModuleTree(tree)};`,
    ...namedExportLines,
    `export default ${options.rootIdentifier};`,
    '',
  ].join('\n');
}

function createTypescriptDeclarationSource(
  tree: ModuleTokenTree,
  options: JavascriptModuleFormatterOptions,
  namedExports: readonly ModuleNamedExportDefinition[],
): string {
  const typeLiteral = createModuleTypeLiteral(tree);
  const namedExportLines = namedExports.map(
    (entry) =>
      `export declare const ${entry.identifier}: typeof ${options.rootIdentifier}${entry.propertyAccessor};`,
  );
  return [
    `export declare const ${options.rootIdentifier}: ${typeLiteral};`,
    ...namedExportLines,
    `export default ${options.rootIdentifier};`,
    `export type TokenModule = typeof ${options.rootIdentifier};`,
    '',
  ].join('\n');
}

function normaliseFilename(filename: string, name: string): string {
  const trimmed = filename.trim();
  if (trimmed.length === 0) {
    throw new TypeError(`Option "filename" for "${name}" must be a non-empty string.`);
  }
  if (!trimmed.endsWith('.js')) {
    throw new TypeError(`Option "filename" for "${name}" must end with ".js".`);
  }
  return trimmed;
}

function toDeclarationFilename(filename: string, name: string): string {
  if (!filename.endsWith('.js')) {
    throw new TypeError(`Formatter "${name}" expected filename to end with .js.`);
  }
  return `${filename.slice(0, -3)}.d.ts`;
}

function createArtifactMetadata(
  tokenCount: number,
  language: string,
  namedExportCount: number,
  role: 'module' | 'declaration',
): Record<string, unknown> {
  return {
    tokenCount,
    language,
    role,
    namedExportCount,
  } satisfies Record<string, unknown>;
}

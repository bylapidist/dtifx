import {
  assertAllowedKeys,
  assertPlainObject,
  assertStringOption,
  type ConfigOptionKind,
} from '../../config/config-options.js';
import type { FormatterDefinitionFactory } from '../../formatter/formatter-factory.js';
import type { FileArtifact, FormatterDefinition } from '../../formatter/formatter-registry.js';
import {
  WEB_VARIABLE_SUPPORTED_TYPES,
  collectWebVariableDeclarations,
  type WebVariableDeclaration,
} from './web-variable-helpers.js';

const FORMATTER_NAME = 'less.variables';
const DEFAULT_FILENAME = 'tokens.less';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'prefix']);

interface LessVariablesFormatterOptions {
  readonly filename: string;
  readonly prefix?: string;
}

/**
 * Creates the formatter definition factory responsible for emitting Less variables.
 * @returns {FormatterDefinitionFactory} The Less variables formatter factory.
 */
export function createLessVariablesFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createLessVariablesFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): LessVariablesFormatterOptions {
  if (rawOptions === undefined) {
    return { filename: DEFAULT_FILENAME } satisfies LessVariablesFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);
  const typedOptions = options as {
    readonly filename?: unknown;
    readonly prefix?: unknown;
  };
  const { filename: filenameOption, prefix: prefixOption } = typedOptions;

  const filename =
    filenameOption === undefined
      ? DEFAULT_FILENAME
      : normaliseFilename(assertStringOption(filenameOption, name, 'filename'));

  const prefix =
    prefixOption === undefined
      ? undefined
      : normalisePrefix(assertStringOption(prefixOption, name, 'prefix'));

  return {
    filename,
    ...(prefix ? { prefix } : {}),
  } satisfies LessVariablesFormatterOptions;
}

function createLessVariablesFormatterDefinition(
  options: LessVariablesFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: WEB_VARIABLE_SUPPORTED_TYPES },
    run: async ({ tokens }) => {
      const declarations = collectWebVariableDeclarations(tokens, {
        ...(options.prefix === undefined ? undefined : { prefix: options.prefix }),
        createIdentifier: (segments) => `@${segments.join('-')}`,
      });
      if (declarations.length === 0) {
        return [];
      }

      const contents = formatLessVariables(declarations);
      const artifact: FileArtifact = {
        path: options.filename,
        contents,
        encoding: 'utf8',
        metadata: { declarationCount: declarations.length },
      } satisfies FileArtifact;
      return [artifact];
    },
  } satisfies FormatterDefinition;
}

function normaliseFilename(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Formatter "less.variables" filename must be a non-empty string.');
  }
  return trimmed;
}

function normalisePrefix(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError(
      'Formatter "less.variables" prefix must be a non-empty string when provided.',
    );
  }
  return trimmed;
}

function formatLessVariables(declarations: readonly WebVariableDeclaration[]): string {
  return `${declarations.map((declaration) => `${declaration.name}: ${declaration.value};`).join('\n')}\n`;
}

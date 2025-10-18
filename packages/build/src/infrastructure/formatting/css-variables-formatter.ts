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

const FORMATTER_NAME = 'css.variables';
const DEFAULT_FILENAME = 'tokens.css';
const DEFAULT_SELECTOR = ':root';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'selector', 'prefix']);
interface CssVariablesFormatterOptions {
  readonly filename: string;
  readonly selector: string;
  readonly prefix?: string;
}

/**
 * Creates the formatter definition factory responsible for emitting CSS custom properties.
 * @returns {FormatterDefinitionFactory} The CSS variables formatter factory.
 */
export function createCssVariablesFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createCssVariablesFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): CssVariablesFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      selector: DEFAULT_SELECTOR,
    } satisfies CssVariablesFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);
  const typedOptions = options as {
    readonly filename?: unknown;
    readonly selector?: unknown;
    readonly prefix?: unknown;
  };
  const { filename: filenameOption, selector: selectorOption, prefix: prefixOption } = typedOptions;

  const filename =
    filenameOption === undefined
      ? DEFAULT_FILENAME
      : normaliseFilename(assertStringOption(filenameOption, name, 'filename'));

  const selector =
    selectorOption === undefined
      ? DEFAULT_SELECTOR
      : normaliseSelector(assertStringOption(selectorOption, name, 'selector'), name);

  const prefix =
    prefixOption === undefined
      ? undefined
      : normalisePrefix(assertStringOption(prefixOption, name, 'prefix'));

  return {
    filename,
    selector,
    ...(prefix ? { prefix } : {}),
  } satisfies CssVariablesFormatterOptions;
}

function createCssVariablesFormatterDefinition(
  options: CssVariablesFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: WEB_VARIABLE_SUPPORTED_TYPES },
    run: async ({ tokens }) => {
      const declarations = collectWebVariableDeclarations(tokens, {
        ...(options.prefix === undefined ? undefined : { prefix: options.prefix }),
        createIdentifier: (segments) => `--${segments.join('-')}`,
      });
      if (declarations.length === 0) {
        return [];
      }

      const contents = formatCssBlock(options.selector, declarations);
      const artifact: FileArtifact = {
        path: options.filename,
        contents,
        encoding: 'utf8',
        metadata: {
          declarationCount: declarations.length,
        },
      };
      return [artifact];
    },
  } satisfies FormatterDefinition;
}

function normaliseFilename(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Formatter "css.variables" filename must be a non-empty string.');
  }
  return trimmed;
}

function normaliseSelector(value: string, name: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError(`Option "selector" for "${name}" must be a non-empty string.`);
  }
  return trimmed;
}

function normalisePrefix(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError(
      'Formatter "css.variables" prefix must be a non-empty string when provided.',
    );
  }
  return trimmed;
}

function formatCssBlock(selector: string, declarations: readonly WebVariableDeclaration[]): string {
  const lines = declarations.map((declaration) => `  ${declaration.name}: ${declaration.value};`);
  return `${selector} {\n${lines.join('\n')}\n}\n`;
}

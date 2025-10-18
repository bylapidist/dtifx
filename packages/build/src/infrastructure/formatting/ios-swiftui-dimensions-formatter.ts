import type { JsonPointer } from '@lapidist/dtif-parser';

import {
  assertAllowedKeys,
  assertPlainObject,
  assertStringArrayOption,
  assertStringOption,
  type ConfigOptionKind,
} from '../../config/config-options.js';
import type { FormatterDefinitionFactory } from '../../formatter/formatter-factory.js';
import type {
  FileArtifact,
  FormatterDefinition,
  FormatterToken,
} from '../../formatter/formatter-registry.js';
import type { DimensionSwiftUiTransformOutput } from '../../transform/dimension-transforms.js';
import { createUniqueSwiftPropertyIdentifier } from './ios-swiftui-identifier.js';

const FORMATTER_NAME = 'ios.swiftui.dimensions';
const DEFAULT_FILENAME = 'DimensionTokens.swift';
const DEFAULT_STRUCT_NAME = 'DimensionTokens';
const DEFAULT_ACCESS_MODIFIER = 'public';
const DEFAULT_IMPORTS = Object.freeze(['SwiftUI']);
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'structName', 'accessModifier', 'imports']);

interface IosSwiftUiDimensionsFormatterOptions {
  readonly filename: string;
  readonly structName: string;
  readonly accessModifier: string;
  readonly imports: readonly string[];
}

interface SwiftUiDimensionEntry {
  readonly pointer: JsonPointer;
  readonly identifier: string;
  readonly metadata: DimensionSwiftUiTransformOutput;
}

/**
 * Creates the formatter definition factory responsible for emitting SwiftUI dimension artifacts.
 * @returns {FormatterDefinitionFactory} The SwiftUI dimensions formatter factory.
 */
export function createIosSwiftUiDimensionsFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createIosSwiftUiDimensionsFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): IosSwiftUiDimensionsFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      structName: DEFAULT_STRUCT_NAME,
      accessModifier: DEFAULT_ACCESS_MODIFIER,
      imports: DEFAULT_IMPORTS,
    } satisfies IosSwiftUiDimensionsFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);
  const typedOptions = options as {
    readonly filename?: unknown;
    readonly structName?: unknown;
    readonly accessModifier?: unknown;
    readonly imports?: unknown;
  };

  const filename =
    typedOptions.filename === undefined
      ? DEFAULT_FILENAME
      : normaliseFilename(assertStringOption(typedOptions.filename, name, 'filename'));
  const structName =
    typedOptions.structName === undefined
      ? DEFAULT_STRUCT_NAME
      : normaliseTypeName(assertStringOption(typedOptions.structName, name, 'structName'));
  const accessModifier =
    typedOptions.accessModifier === undefined
      ? DEFAULT_ACCESS_MODIFIER
      : normaliseAccessModifier(
          assertStringOption(typedOptions.accessModifier, name, 'accessModifier'),
          name,
        );
  const imports =
    typedOptions.imports === undefined
      ? DEFAULT_IMPORTS
      : normaliseImports(assertStringArrayOption(typedOptions.imports, name, 'imports'));

  return {
    filename,
    structName,
    accessModifier,
    imports,
  } satisfies IosSwiftUiDimensionsFormatterOptions;
}

function createIosSwiftUiDimensionsFormatterDefinition(
  options: IosSwiftUiDimensionsFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: ['dimension'] },
    run: async ({ tokens }) => {
      const entries = collectDimensionEntries(tokens);
      if (entries.length === 0) {
        return [];
      }

      const contents = formatSwiftFile(entries, options);
      const artifact: FileArtifact = {
        path: options.filename,
        contents,
        encoding: 'utf8',
        metadata: { dimensionCount: entries.length },
      };
      return [artifact];
    },
  } satisfies FormatterDefinition;
}

function collectDimensionEntries(
  tokens: readonly FormatterToken[],
): readonly SwiftUiDimensionEntry[] {
  const entries: SwiftUiDimensionEntry[] = [];
  const seen = new Set<string>();
  const sortedTokens = [...tokens].toSorted((a, b) => a.pointer.localeCompare(b.pointer));

  for (const token of sortedTokens) {
    if (token.type !== 'dimension') {
      continue;
    }

    const metadata = token.transforms.get('dimension.toSwiftUiPoints') as
      | DimensionSwiftUiTransformOutput
      | undefined;
    if (!metadata) {
      continue;
    }

    const identifier = createUniqueSwiftPropertyIdentifier(token.pointer, seen);
    entries.push({ pointer: token.pointer, identifier, metadata });
  }

  return entries;
}

function formatSwiftFile(
  entries: readonly SwiftUiDimensionEntry[],
  options: IosSwiftUiDimensionsFormatterOptions,
): string {
  const lines: string[] = ['// Generated by @dtifx/build. Do not edit.', ''];

  for (const moduleImport of options.imports) {
    lines.push(`import ${moduleImport}`);
  }

  if (options.imports.length > 0) {
    lines.push('');
  }

  lines.push(`${options.accessModifier} struct ${options.structName} {`);

  for (const entry of entries) {
    lines.push(
      `  /// Token: ${entry.pointer}`,
      `  /// Points: ${formatNumber(entry.metadata.points)}`,
      `  ${options.accessModifier} static let ${entry.identifier}: CGFloat = ${entry.metadata.literal}`,
      '',
    );
  }

  if (entries.length > 0) {
    lines.pop();
  }

  lines.push('}', '');

  return lines.join('\n');
}

function normaliseFilename(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return DEFAULT_FILENAME;
  }
  return trimmed;
}

function normaliseTypeName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return DEFAULT_STRUCT_NAME;
  }
  return trimmed;
}

function normaliseAccessModifier(value: string, name: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return DEFAULT_ACCESS_MODIFIER;
  }
  if (!/^(public|internal)$/u.test(trimmed)) {
    throw new Error(
      `Formatter "${name}" received unsupported access modifier "${value}". Expected "public" or "internal".`,
    );
  }
  return trimmed;
}

function normaliseImports(values: readonly string[]): readonly string[] {
  const imports = values.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (imports.length === 0) {
    return DEFAULT_IMPORTS;
  }
  return Object.freeze([...new Set(imports)]);
}

function formatNumber(value: number): string {
  if (Number.isFinite(value) === false) {
    return '0';
  }
  const rounded = Number(value.toFixed(6));
  if (Number.isFinite(rounded) === false) {
    return '0';
  }
  return rounded.toString();
}

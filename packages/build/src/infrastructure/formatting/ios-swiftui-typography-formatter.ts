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
import type {
  TypographySwiftUiLineHeightOutput,
  TypographySwiftUiTransformOutput,
} from '../../transform/typography-transforms.js';
import type { DimensionSwiftUiTransformOutput } from '../../transform/dimension-transforms.js';
import { createUniqueSwiftPropertyIdentifier } from './ios-swiftui-identifier.js';

const FORMATTER_NAME = 'ios.swiftui.typography';
const DEFAULT_FILENAME = 'TypographyTokens.swift';
const DEFAULT_STRUCT_NAME = 'TypographyTokens';
const DEFAULT_ACCESS_MODIFIER = 'public';
const DEFAULT_IMPORTS = Object.freeze(['SwiftUI']);
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'structName', 'accessModifier', 'imports']);

interface IosSwiftUiTypographyFormatterOptions {
  readonly filename: string;
  readonly structName: string;
  readonly accessModifier: string;
  readonly imports: readonly string[];
}

interface SwiftUiTypographyEntry {
  readonly pointer: JsonPointer;
  readonly identifier: string;
  readonly metadata: TypographySwiftUiTransformOutput;
}

/**
 * Creates the formatter definition factory responsible for emitting SwiftUI typography artifacts.
 * @returns {FormatterDefinitionFactory} The SwiftUI typography formatter factory.
 */
export function createIosSwiftUiTypographyFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createIosSwiftUiTypographyFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): IosSwiftUiTypographyFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      structName: DEFAULT_STRUCT_NAME,
      accessModifier: DEFAULT_ACCESS_MODIFIER,
      imports: DEFAULT_IMPORTS,
    } satisfies IosSwiftUiTypographyFormatterOptions;
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
  } satisfies IosSwiftUiTypographyFormatterOptions;
}

function createIosSwiftUiTypographyFormatterDefinition(
  options: IosSwiftUiTypographyFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: ['typography'] },
    run: async ({ tokens }) => {
      const entries = collectTypographyEntries(tokens);
      if (entries.length === 0) {
        return [];
      }

      const contents = formatSwiftFile(entries, options);
      const artifact: FileArtifact = {
        path: options.filename,
        contents,
        encoding: 'utf8',
        metadata: { typographyCount: entries.length },
      };
      return [artifact];
    },
  } satisfies FormatterDefinition;
}

function collectTypographyEntries(
  tokens: readonly FormatterToken[],
): readonly SwiftUiTypographyEntry[] {
  const entries: SwiftUiTypographyEntry[] = [];
  const seen = new Set<string>();
  const sortedTokens = [...tokens].toSorted((a, b) => a.pointer.localeCompare(b.pointer));

  for (const token of sortedTokens) {
    if (token.type !== 'typography') {
      continue;
    }

    const metadata = token.transforms.get('typography.toSwiftUI') as
      | TypographySwiftUiTransformOutput
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
  entries: readonly SwiftUiTypographyEntry[],
  options: IosSwiftUiTypographyFormatterOptions,
): string {
  const lines: string[] = ['// Generated by @dtifx/build. Do not edit.', ''];

  for (const moduleImport of options.imports) {
    lines.push(`import ${moduleImport}`);
  }

  if (options.imports.length > 0) {
    lines.push('');
  }

  lines.push(
    `${options.accessModifier} struct ${options.structName} {`,
    ...createHelperStructs(options.accessModifier),
  );

  for (const entry of entries) {
    const styleLines = formatTypographyStyle(entry.metadata);
    if (styleLines.length === 0) {
      continue;
    }

    lines.push(
      `  /// Token: ${entry.pointer}`,
      `  ${options.accessModifier} static let ${entry.identifier} = ${styleLines[0]!}`,
      ...styleLines.slice(1).map((line) => (line.startsWith(' ') ? line : `  ${line}`)),
      '',
    );
  }

  if (entries.length > 0) {
    lines.pop();
  }

  lines.push('}', '');

  return lines.join('\n');
}

function createHelperStructs(accessModifier: string): readonly string[] {
  return [
    `  ${accessModifier} struct TypographyDimension {`,
    `    ${accessModifier} let points: CGFloat`,
    `    ${accessModifier} let literal: String`,
    '',
    `    ${accessModifier} init(points: CGFloat, literal: String) {`,
    '      self.points = points',
    '      self.literal = literal',
    '    }',
    '  }',
    '',
    `  ${accessModifier} struct TypographyLineHeight {`,
    `    ${accessModifier} let literal: String`,
    `    ${accessModifier} let points: CGFloat?`,
    `    ${accessModifier} let multiplier: Double?`,
    '',
    `    ${accessModifier} init(literal: String, points: CGFloat? = nil, multiplier: Double? = nil) {`,
    '      self.literal = literal',
    '      self.points = points',
    '      self.multiplier = multiplier',
    '    }',
    '  }',
    '',
    `  ${accessModifier} struct TypographyStyle {`,
    `    ${accessModifier} let fontFamily: String?`,
    `    ${accessModifier} let fontWeight: String?`,
    `    ${accessModifier} let fontSize: TypographyDimension?`,
    `    ${accessModifier} let lineHeight: TypographyLineHeight?`,
    `    ${accessModifier} let letterSpacing: TypographyDimension?`,
    `    ${accessModifier} let paragraphSpacing: TypographyDimension?`,
    `    ${accessModifier} let textCase: String?`,
    `    ${accessModifier} let textTransform: String?`,
    '',
    `    ${accessModifier} init(`,
    '      fontFamily: String? = nil,',
    '      fontWeight: String? = nil,',
    '      fontSize: TypographyDimension? = nil,',
    '      lineHeight: TypographyLineHeight? = nil,',
    '      letterSpacing: TypographyDimension? = nil,',
    '      paragraphSpacing: TypographyDimension? = nil,',
    '      textCase: String? = nil,',
    '      textTransform: String? = nil',
    '    ) {',
    '      self.fontFamily = fontFamily',
    '      self.fontWeight = fontWeight',
    '      self.fontSize = fontSize',
    '      self.lineHeight = lineHeight',
    '      self.letterSpacing = letterSpacing',
    '      self.paragraphSpacing = paragraphSpacing',
    '      self.textCase = textCase',
    '      self.textTransform = textTransform',
    '    }',
    '  }',
    '',
  ];
}

function formatTypographyStyle(metadata: TypographySwiftUiTransformOutput): readonly string[] {
  const argumentsList: string[] = [];

  if (metadata.fontFamily) {
    argumentsList.push(`fontFamily: "${escapeString(metadata.fontFamily)}"`);
  }
  if (metadata.fontWeight) {
    argumentsList.push(`fontWeight: "${escapeString(metadata.fontWeight)}"`);
  }
  if (metadata.fontSize) {
    argumentsList.push(`fontSize: ${formatDimension(metadata.fontSize)}`);
  }
  if (metadata.lineHeight) {
    argumentsList.push(`lineHeight: ${formatLineHeight(metadata.lineHeight)}`);
  }
  if (metadata.letterSpacing) {
    argumentsList.push(`letterSpacing: ${formatDimension(metadata.letterSpacing)}`);
  }
  if (metadata.paragraphSpacing) {
    argumentsList.push(`paragraphSpacing: ${formatDimension(metadata.paragraphSpacing)}`);
  }
  if (metadata.textCase) {
    argumentsList.push(`textCase: "${escapeString(metadata.textCase)}"`);
  }
  if (metadata.textTransform) {
    argumentsList.push(`textTransform: "${escapeString(metadata.textTransform)}"`);
  }

  const lines: string[] = [];
  if (argumentsList.length === 0) {
    lines.push('TypographyStyle()');
    return lines;
  }

  lines.push('TypographyStyle(');
  for (let index = 0; index < argumentsList.length; index += 1) {
    const suffix = index === argumentsList.length - 1 ? '' : ',';
    lines.push(`    ${argumentsList[index]!}${suffix}`);
  }
  lines.push('  )');

  return lines;
}

function formatDimension(metadata: DimensionSwiftUiTransformOutput): string {
  return `TypographyDimension(points: ${metadata.literal}, literal: "${escapeString(metadata.literal)}")`;
}

function formatLineHeight(metadata: TypographySwiftUiLineHeightOutput): string {
  const argumentsList = [`literal: "${escapeString(metadata.literal)}"`];

  if (metadata.points !== undefined) {
    argumentsList.push(`points: ${formatNumber(metadata.points)}`);
  }
  if (metadata.multiplier !== undefined) {
    argumentsList.push(`multiplier: ${formatNumber(metadata.multiplier)}`);
  }

  if (argumentsList.length === 1) {
    return `TypographyLineHeight(${argumentsList[0]!})`;
  }

  return `TypographyLineHeight(${argumentsList.join(', ')})`;
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

const ESCAPED_BACKSLASH = String.raw`\\`;
const ESCAPED_QUOTE = String.raw`\"`;
const ESCAPED_NEWLINE = String.raw`\n`;
const RAW_BACKSLASH = '\\';
const RAW_DOUBLE_QUOTE = '"';
const RAW_CRLF = '\r\n';
const RAW_NEWLINE = '\n';
const RAW_CARRIAGE_RETURN = '\r';

function escapeString(value: string): string {
  return value
    .replaceAll(RAW_BACKSLASH, ESCAPED_BACKSLASH)
    .replaceAll(RAW_DOUBLE_QUOTE, ESCAPED_QUOTE)
    .replaceAll(RAW_CRLF, ESCAPED_NEWLINE)
    .replaceAll(RAW_NEWLINE, ESCAPED_NEWLINE)
    .replaceAll(RAW_CARRIAGE_RETURN, ESCAPED_NEWLINE);
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

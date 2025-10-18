import type { JsonPointer } from '@lapidist/dtif-parser';

import {
  assertAllowedKeys,
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
import type { TypographyAndroidMaterialTransformOutput } from '../../transform/typography-transforms.js';
import { createAndroidResourceName } from './android-resource-name.js';

const FORMATTER_NAME = 'android.material.typography';
const DEFAULT_FILENAME = 'src/main/java/com/example/tokens/TypographyTokens.kt';
const DEFAULT_PACKAGE_NAME = 'com.example.tokens';
const DEFAULT_OBJECT_NAME = 'TypographyTokens';
const DEFAULT_DATA_CLASS_NAME = 'AndroidTypographyToken';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'packageName', 'objectName', 'dataClassName']);

interface AndroidMaterialTypographyFormatterOptions {
  readonly filename: string;
  readonly packageName: string;
  readonly objectName: string;
  readonly dataClassName: string;
}

interface AndroidTypographyResourceEntry {
  readonly pointer: JsonPointer;
  readonly identifier: string;
  readonly metadata: TypographyAndroidMaterialTransformOutput;
}

/**
 * Creates the formatter definition factory responsible for emitting Android Material typography artifacts.
 *
 * @returns {FormatterDefinitionFactory} The Android Material typography formatter factory.
 */
export function createAndroidMaterialTypographyFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createAndroidMaterialTypographyFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): AndroidMaterialTypographyFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      packageName: DEFAULT_PACKAGE_NAME,
      objectName: DEFAULT_OBJECT_NAME,
      dataClassName: DEFAULT_DATA_CLASS_NAME,
    } satisfies AndroidMaterialTypographyFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);

  const typedOptions = options as {
    readonly filename?: unknown;
    readonly packageName?: unknown;
    readonly objectName?: unknown;
    readonly dataClassName?: unknown;
  };

  const filename =
    typedOptions.filename === undefined
      ? DEFAULT_FILENAME
      : normaliseNonEmptyString(
          assertStringOption(typedOptions.filename, name, 'filename'),
          'filename',
        );
  const packageName =
    typedOptions.packageName === undefined
      ? DEFAULT_PACKAGE_NAME
      : normaliseNonEmptyString(
          assertStringOption(typedOptions.packageName, name, 'packageName'),
          'packageName',
        );
  const objectName =
    typedOptions.objectName === undefined
      ? DEFAULT_OBJECT_NAME
      : normaliseIdentifier(
          assertStringOption(typedOptions.objectName, name, 'objectName'),
          'objectName',
        );
  const dataClassName =
    typedOptions.dataClassName === undefined
      ? DEFAULT_DATA_CLASS_NAME
      : normaliseIdentifier(
          assertStringOption(typedOptions.dataClassName, name, 'dataClassName'),
          'dataClassName',
        );

  return {
    filename,
    packageName,
    objectName,
    dataClassName,
  } satisfies AndroidMaterialTypographyFormatterOptions;
}

function createAndroidMaterialTypographyFormatterDefinition(
  options: AndroidMaterialTypographyFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: ['typography'] },
    run: async ({ tokens }) => {
      const entries = collectTypographyResources(tokens);
      if (entries.length === 0) {
        return [];
      }

      const contents = formatTypographyResources(entries, options);
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

function collectTypographyResources(
  tokens: readonly FormatterToken[],
): readonly AndroidTypographyResourceEntry[] {
  const resources: AndroidTypographyResourceEntry[] = [];
  const seenIdentifiers = new Set<string>();
  const sortedTokens = [...tokens].toSorted((a, b) => a.pointer.localeCompare(b.pointer));

  for (const token of sortedTokens) {
    if (token.type !== 'typography') {
      continue;
    }

    const metadata = token.transforms.get('typography.toAndroidMaterial') as
      | TypographyAndroidMaterialTransformOutput
      | undefined;
    if (metadata === undefined || Object.keys(metadata).length === 0) {
      continue;
    }

    const baseResourceName = createAndroidResourceName(token.pointer);
    const identifier = createUniqueIdentifier(baseResourceName, seenIdentifiers);
    resources.push({ pointer: token.pointer, identifier, metadata });
  }

  return resources;
}

function formatTypographyResources(
  entries: readonly AndroidTypographyResourceEntry[],
  options: AndroidMaterialTypographyFormatterOptions,
): string {
  const usesSp = entries.some((entry) => usesSpUnits(entry.metadata));
  const usesEm = entries.some((entry) => usesEmUnits(entry.metadata));
  const usesDp = entries.some((entry) => usesDpUnits(entry.metadata));

  const importLines = new Set<string>();
  importLines.add('import androidx.compose.ui.unit.Dp');
  importLines.add('import androidx.compose.ui.unit.TextUnit');
  if (usesDp) {
    importLines.add('import androidx.compose.ui.unit.dp');
  }
  if (usesSp) {
    importLines.add('import androidx.compose.ui.unit.sp');
  }
  if (usesEm) {
    importLines.add('import androidx.compose.ui.unit.em');
  }

  const blocks = entries.map((entry) => formatTypographyEntry(entry, options.dataClassName));

  return [
    `package ${options.packageName}`,
    '',
    ...[...importLines].toSorted(),
    '',
    formatDataClass(options.dataClassName),
    '',
    `object ${options.objectName} {`,
    ...blocks.flatMap((block, index) => (index === 0 ? block : ['', ...block])),
    '}',
    '',
  ].join('\n');
}

function formatDataClass(dataClassName: string): string {
  return [
    `data class ${dataClassName}(`,
    '    val fontFamily: String? = null,',
    '    val fontWeight: Int? = null,',
    '    val fontSize: TextUnit? = null,',
    '    val lineHeight: TextUnit? = null,',
    '    val letterSpacing: TextUnit? = null,',
    '    val paragraphSpacing: Dp? = null,',
    '    val textCase: String? = null,',
    '    val textTransform: String? = null,',
    ')',
  ].join('\n');
}

function formatTypographyEntry(
  entry: AndroidTypographyResourceEntry,
  dataClassName: string,
): readonly string[] {
  const properties: string[] = [];

  if (entry.metadata.fontFamily !== undefined) {
    properties.push(`    fontFamily = ${JSON.stringify(entry.metadata.fontFamily)},`);
  }

  if (entry.metadata.fontWeight !== undefined) {
    const numeric = Number.parseInt(entry.metadata.fontWeight, 10);
    if (Number.isFinite(numeric)) {
      properties.push(`    fontWeight = ${numeric},`);
    }
  }

  const { fontSize, lineHeight, letterSpacing, paragraphSpacing, textCase, textTransform } =
    entry.metadata;

  if (fontSize?.sp !== undefined) {
    properties.push(`    fontSize = ${formatNumeric(fontSize.sp)}.sp,`);
  }

  if (lineHeight?.sp !== undefined) {
    properties.push(`    lineHeight = ${formatNumeric(lineHeight.sp)}.sp,`);
  } else if (lineHeight?.multiplier !== undefined) {
    properties.push(`    lineHeight = ${formatNumeric(lineHeight.multiplier)}.em,`);
  }

  if (letterSpacing?.sp !== undefined) {
    properties.push(`    letterSpacing = ${formatNumeric(letterSpacing.sp)}.sp,`);
  }

  if (paragraphSpacing?.dp !== undefined) {
    properties.push(`    paragraphSpacing = ${formatNumeric(paragraphSpacing.dp)}.dp,`);
  }

  if (textCase !== undefined) {
    properties.push(`    textCase = ${JSON.stringify(textCase)},`);
  }

  if (textTransform !== undefined) {
    properties.push(`    textTransform = ${JSON.stringify(textTransform)},`);
  }

  return [
    `  // ${entry.pointer}`,
    `  val ${entry.identifier} = ${dataClassName}(`,
    ...properties,
    '  )',
  ];
}

function usesSpUnits(metadata: TypographyAndroidMaterialTransformOutput): boolean {
  return (
    metadata.fontSize?.sp !== undefined ||
    metadata.lineHeight?.sp !== undefined ||
    metadata.letterSpacing?.sp !== undefined
  );
}

function usesEmUnits(metadata: TypographyAndroidMaterialTransformOutput): boolean {
  return metadata.lineHeight?.multiplier !== undefined;
}

function usesDpUnits(metadata: TypographyAndroidMaterialTransformOutput): boolean {
  return metadata.paragraphSpacing?.dp !== undefined;
}

function createUniqueIdentifier(baseName: string, seen: Set<string>): string {
  const pascal = toPascalCase(baseName);
  if (seen.has(pascal) === false) {
    seen.add(pascal);
    return pascal;
  }

  let suffix = 2;
  let candidate = `${pascal}${suffix}`;
  while (seen.has(candidate)) {
    suffix += 1;
    candidate = `${pascal}${suffix}`;
  }

  seen.add(candidate);
  return candidate;
}

function toPascalCase(value: string): string {
  const segments = value.split(/[^a-z0-9]+/i).filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return 'Token';
  }

  const combined = segments
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');

  if (combined.length === 0) {
    return 'Token';
  }

  if (/^[A-Za-z]/.test(combined) === false) {
    return `Token${combined}`;
  }

  return combined;
}

function formatNumeric(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString(10);
  }
  return Number.parseFloat(value.toFixed(4)).toString();
}

function normaliseNonEmptyString(value: string, optionName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError(`Formatter "${FORMATTER_NAME}" ${optionName} must be a non-empty string.`);
  }
  return trimmed;
}

function normaliseIdentifier(value: string, optionName: string): string {
  const trimmed = value.trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) === false) {
    throw new TypeError(
      `Formatter "${FORMATTER_NAME}" ${optionName} must be a valid Kotlin identifier string.`,
    );
  }
  return trimmed;
}

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
import type { TypographyAndroidComposeTransformOutput } from '../../transform/typography-transforms.js';
import { getDecodedPointerSegments } from './token-pointer.js';

const FORMATTER_NAME = 'android.compose.typography';
const DEFAULT_FILENAME = 'src/main/java/com/example/tokens/ComposeTypographyTokens.kt';
const DEFAULT_PACKAGE_NAME = 'com.example.tokens';
const DEFAULT_OBJECT_NAME = 'ComposeTypographyTokens';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'packageName', 'objectName']);

interface AndroidComposeTypographyFormatterOptions {
  readonly filename: string;
  readonly packageName: string;
  readonly objectName: string;
}

interface AndroidComposeTypographyEntry {
  readonly pointer: JsonPointer;
  readonly identifier: string;
  readonly metadata: TypographyAndroidComposeTransformOutput;
}

/**
 * Creates the formatter definition factory responsible for emitting Compose typography artifacts.
 *
 * @returns {FormatterDefinitionFactory} The Android Compose typography formatter factory.
 */
export function createAndroidComposeTypographyFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createAndroidComposeTypographyFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): AndroidComposeTypographyFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      packageName: DEFAULT_PACKAGE_NAME,
      objectName: DEFAULT_OBJECT_NAME,
    } satisfies AndroidComposeTypographyFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);

  const typedOptions = options as {
    readonly filename?: unknown;
    readonly packageName?: unknown;
    readonly objectName?: unknown;
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

  return { filename, packageName, objectName } satisfies AndroidComposeTypographyFormatterOptions;
}

function createAndroidComposeTypographyFormatterDefinition(
  options: AndroidComposeTypographyFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: ['typography'] },
    run: async ({ tokens }) => {
      const entries = collectComposeTypography(tokens);
      if (entries.length === 0) {
        return [];
      }

      const contents = formatComposeTypography(entries, options);
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

function collectComposeTypography(
  tokens: readonly FormatterToken[],
): readonly AndroidComposeTypographyEntry[] {
  const entries: AndroidComposeTypographyEntry[] = [];
  const seenIdentifiers = new Set<string>();
  const sortedTokens = [...tokens].toSorted((left, right) =>
    left.pointer.localeCompare(right.pointer),
  );

  for (const token of sortedTokens) {
    if (token.type !== 'typography') {
      continue;
    }

    const metadata = token.transforms.get('typography.toAndroidCompose') as
      | TypographyAndroidComposeTransformOutput
      | undefined;
    if (metadata === undefined || Object.keys(metadata).length === 0) {
      continue;
    }

    const identifier = createUniqueIdentifier(token.pointer, seenIdentifiers);
    entries.push({ pointer: token.pointer, identifier, metadata });
  }

  return entries;
}

function formatComposeTypography(
  entries: readonly AndroidComposeTypographyEntry[],
  options: AndroidComposeTypographyFormatterOptions,
): string {
  const usesFontFamily = entries.some((entry) => entry.metadata.fontFamily !== undefined);
  const usesFontWeight = entries.some((entry) => entry.metadata.fontWeight !== undefined);
  const usesSp = entries.some((entry) => usesSpUnits(entry.metadata));
  const usesEm = entries.some((entry) => usesEmUnits(entry.metadata));

  const importLines = new Set<string>([
    'import androidx.compose.ui.text.TextStyle',
    ...(usesFontFamily
      ? [
          'import androidx.compose.ui.text.font.Font',
          'import androidx.compose.ui.text.font.FontFamily',
        ]
      : []),
    ...(usesFontWeight ? ['import androidx.compose.ui.text.font.FontWeight'] : []),
    ...(usesSp ? ['import androidx.compose.ui.unit.sp'] : []),
    ...(usesEm ? ['import androidx.compose.ui.unit.em'] : []),
  ]);

  const blocks = entries.map((entry) => formatTypographyEntry(entry));

  return [
    `package ${options.packageName}`,
    '',
    ...[...importLines].toSorted(),
    '',
    `object ${options.objectName} {`,
    ...blocks.flatMap((block, index) => (index === 0 ? block : ['', ...block])),
    '}',
    '',
  ].join('\n');
}

function formatTypographyEntry(entry: AndroidComposeTypographyEntry): readonly string[] {
  const properties: string[] = [];
  const { metadata } = entry;

  const fontFamilyProperty = formatFontFamily(metadata.fontFamily);
  if (fontFamilyProperty !== undefined) {
    properties.push(`    fontFamily = ${fontFamilyProperty},`);
  }

  const fontWeightProperty = formatFontWeight(metadata.fontWeight);
  if (fontWeightProperty !== undefined) {
    properties.push(`    fontWeight = ${fontWeightProperty},`);
  }

  const { fontSize, lineHeight, letterSpacing } = metadata;

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

  return [`  // ${entry.pointer}`, `  val ${entry.identifier} = TextStyle(`, ...properties, '  )'];
}

function usesSpUnits(metadata: TypographyAndroidComposeTransformOutput): boolean {
  return (
    metadata.fontSize?.sp !== undefined ||
    metadata.lineHeight?.sp !== undefined ||
    metadata.letterSpacing?.sp !== undefined
  );
}

function usesEmUnits(metadata: TypographyAndroidComposeTransformOutput): boolean {
  return metadata.lineHeight?.multiplier !== undefined;
}

function formatFontFamily(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/_{2,}/g, '_')
    .replaceAll(/^_+|_+$/g, '');
  if (slug.length === 0) {
    return undefined;
  }
  return `FontFamily(Font(resId = R.font.${slug}))`;
}

function formatFontWeight(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric)) {
    return `FontWeight(${numeric})`;
  }
  return undefined;
}

function createUniqueIdentifier(pointer: JsonPointer, seen: Set<string>): string {
  const baseName = toPascalCase(getDecodedPointerSegments(pointer));
  if (seen.has(baseName) === false) {
    seen.add(baseName);
    return baseName;
  }

  let suffix = 2;
  let candidate = `${baseName}${suffix}`;
  while (seen.has(candidate)) {
    suffix += 1;
    candidate = `${baseName}${suffix}`;
  }

  seen.add(candidate);
  return candidate;
}

function toPascalCase(segments: readonly string[]): string {
  const filtered = segments.filter((segment) => segment.trim().length > 0);
  if (filtered.length === 0) {
    return 'Token';
  }

  const converted = filtered
    .map((segment) => segment.replaceAll(/[^A-Za-z0-9]+/g, ' ').trim())
    .flatMap((segment) => segment.split(/\s+/u))
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));

  const combined = converted.join('');
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

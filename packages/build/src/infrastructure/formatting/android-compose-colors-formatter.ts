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
import type { ColorAndroidComposeTransformOutput } from '../../transform/color-transforms.js';
import { getDecodedPointerSegments } from './token-pointer.js';

const FORMATTER_NAME = 'android.compose.colors';
const DEFAULT_FILENAME = 'src/main/java/com/example/tokens/ComposeColorTokens.kt';
const DEFAULT_PACKAGE_NAME = 'com.example.tokens';
const DEFAULT_OBJECT_NAME = 'ComposeColorTokens';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'packageName', 'objectName']);

interface AndroidComposeColorsFormatterOptions {
  readonly filename: string;
  readonly packageName: string;
  readonly objectName: string;
}

interface AndroidComposeColorEntry {
  readonly pointer: JsonPointer;
  readonly identifier: string;
  readonly metadata: ColorAndroidComposeTransformOutput;
}

/**
 * Creates the formatter definition factory responsible for emitting Compose color artifacts.
 *
 * @returns {FormatterDefinitionFactory} The Android Compose colors formatter factory.
 */
export function createAndroidComposeColorsFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createAndroidComposeColorsFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): AndroidComposeColorsFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      packageName: DEFAULT_PACKAGE_NAME,
      objectName: DEFAULT_OBJECT_NAME,
    } satisfies AndroidComposeColorsFormatterOptions;
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

  return { filename, packageName, objectName } satisfies AndroidComposeColorsFormatterOptions;
}

function createAndroidComposeColorsFormatterDefinition(
  options: AndroidComposeColorsFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: ['color'] },
    run: async ({ tokens }) => {
      const entries = collectComposeColors(tokens);
      if (entries.length === 0) {
        return [];
      }

      const contents = formatComposeColors(entries, options);
      const artifact: FileArtifact = {
        path: options.filename,
        contents,
        encoding: 'utf8',
        metadata: { colorCount: entries.length },
      };
      return [artifact];
    },
  } satisfies FormatterDefinition;
}

function collectComposeColors(
  tokens: readonly FormatterToken[],
): readonly AndroidComposeColorEntry[] {
  const entries: AndroidComposeColorEntry[] = [];
  const seenIdentifiers = new Set<string>();
  const sortedTokens = [...tokens].toSorted((left, right) =>
    left.pointer.localeCompare(right.pointer),
  );

  for (const token of sortedTokens) {
    if (token.type !== 'color') {
      continue;
    }

    const metadata = token.transforms.get('color.toAndroidComposeColor') as
      | ColorAndroidComposeTransformOutput
      | undefined;
    if (metadata === undefined) {
      continue;
    }

    const identifier = createUniqueIdentifier(token.pointer, seenIdentifiers);
    entries.push({ pointer: token.pointer, identifier, metadata });
  }

  return entries;
}

function formatComposeColors(
  entries: readonly AndroidComposeColorEntry[],
  options: AndroidComposeColorsFormatterOptions,
): string {
  const blocks = entries.map((entry) => formatComposeColorEntry(entry));

  return [
    `package ${options.packageName}`,
    '',
    'import androidx.compose.ui.graphics.Color',
    '',
    `object ${options.objectName} {`,
    ...blocks.flatMap((block, index) => (index === 0 ? block : ['', ...block])),
    '}',
    '',
  ].join('\n');
}

function formatComposeColorEntry(entry: AndroidComposeColorEntry): readonly string[] {
  return [
    `  // ${entry.pointer}`,
    `  val ${entry.identifier} = Color(${entry.metadata.hexLiteral})`,
  ];
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

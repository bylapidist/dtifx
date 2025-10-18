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
import type { BorderAndroidComposeShapeTransformOutput } from '../../transform/border-transforms.js';
import { getDecodedPointerSegments } from './token-pointer.js';

const FORMATTER_NAME = 'android.compose.shapes';
const DEFAULT_FILENAME = 'src/main/java/com/example/tokens/ComposeShapeTokens.kt';
const DEFAULT_PACKAGE_NAME = 'com.example.tokens';
const DEFAULT_OBJECT_NAME = 'ComposeShapeTokens';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename', 'packageName', 'objectName']);

interface AndroidComposeShapesFormatterOptions {
  readonly filename: string;
  readonly packageName: string;
  readonly objectName: string;
}

interface AndroidComposeShapeEntry {
  readonly pointer: JsonPointer;
  readonly identifier: string;
  readonly metadata: BorderAndroidComposeShapeTransformOutput;
}

const CORNER_FIELD_MAP: Readonly<
  Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', string>
> = {
  topLeft: 'topStart',
  topRight: 'topEnd',
  bottomRight: 'bottomEnd',
  bottomLeft: 'bottomStart',
};

/**
 * Creates the formatter definition factory responsible for emitting Compose shape artifacts.
 *
 * @returns {FormatterDefinitionFactory} The Android Compose shapes formatter factory.
 */
export function createAndroidComposeShapesFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createAndroidComposeShapesFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): AndroidComposeShapesFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      packageName: DEFAULT_PACKAGE_NAME,
      objectName: DEFAULT_OBJECT_NAME,
    } satisfies AndroidComposeShapesFormatterOptions;
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

  return { filename, packageName, objectName } satisfies AndroidComposeShapesFormatterOptions;
}

function createAndroidComposeShapesFormatterDefinition(
  options: AndroidComposeShapesFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: ['border'] },
    run: async ({ tokens }) => {
      const entries = collectComposeShapes(tokens);
      if (entries.length === 0) {
        return [];
      }

      const contents = formatComposeShapes(entries, options);
      const artifact: FileArtifact = {
        path: options.filename,
        contents,
        encoding: 'utf8',
        metadata: { shapeCount: entries.length },
      };
      return [artifact];
    },
  } satisfies FormatterDefinition;
}

function collectComposeShapes(
  tokens: readonly FormatterToken[],
): readonly AndroidComposeShapeEntry[] {
  const entries: AndroidComposeShapeEntry[] = [];
  const seenIdentifiers = new Set<string>();
  const sortedTokens = [...tokens].toSorted((left, right) =>
    left.pointer.localeCompare(right.pointer),
  );

  for (const token of sortedTokens) {
    if (token.type !== 'border') {
      continue;
    }

    const metadata = token.transforms.get('border.toAndroidComposeShape') as
      | BorderAndroidComposeShapeTransformOutput
      | undefined;
    if (metadata === undefined) {
      continue;
    }

    const identifier = createUniqueIdentifier(token.pointer, seenIdentifiers);
    entries.push({ pointer: token.pointer, identifier, metadata });
  }

  return entries;
}

function formatComposeShapes(
  entries: readonly AndroidComposeShapeEntry[],
  options: AndroidComposeShapesFormatterOptions,
): string {
  const blocks = entries.map((entry) => formatShapeEntry(entry));

  return [
    `package ${options.packageName}`,
    '',
    'import androidx.compose.foundation.shape.RoundedCornerShape',
    'import androidx.compose.ui.unit.dp',
    '',
    `object ${options.objectName} {`,
    ...blocks.flatMap((block, index) => (index === 0 ? block : ['', ...block])),
    '}',
    '',
  ].join('\n');
}

function formatShapeEntry(entry: AndroidComposeShapeEntry): readonly string[] {
  const expression = formatRoundedCornerShape(entry.metadata.corners);
  if (expression === undefined) {
    return [`  // ${entry.pointer}`, `  val ${entry.identifier} = RoundedCornerShape(0.dp)`];
  }
  return [`  // ${entry.pointer}`, `  val ${entry.identifier} = ${expression}`];
}

function formatRoundedCornerShape(
  corners: BorderAndroidComposeShapeTransformOutput['corners'],
): string | undefined {
  const topLeft = corners.topLeft ?? 0;
  const topRight = corners.topRight ?? 0;
  const bottomRight = corners.bottomRight ?? 0;
  const bottomLeft = corners.bottomLeft ?? 0;

  if (topLeft === topRight && topLeft === bottomRight && topLeft === bottomLeft) {
    return `RoundedCornerShape(${formatNumeric(topLeft)}.dp)`;
  }

  const parts: string[] = [];
  for (const key of ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const) {
    const value = corners[key] ?? 0;
    const field = CORNER_FIELD_MAP[key];
    parts.push(`${field} = ${formatNumeric(value)}.dp`);
  }

  return `RoundedCornerShape(${parts.join(', ')})`;
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

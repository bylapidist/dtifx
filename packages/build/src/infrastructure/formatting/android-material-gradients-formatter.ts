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
import type { GradientAndroidMaterialTransformOutput } from '../../transform/gradient-transforms.js';
import { createAndroidResourceName } from './android-resource-name.js';

const FORMATTER_NAME = 'android.material.gradients';
const DEFAULT_FILENAME = 'src/main/java/com/example/tokens/GradientTokens.kt';
const DEFAULT_PACKAGE_NAME = 'com.example.tokens';
const DEFAULT_OBJECT_NAME = 'GradientTokens';
const DEFAULT_DATA_CLASS_NAME = 'AndroidGradientToken';
const DEFAULT_STOP_CLASS_NAME = 'AndroidGradientStop';
const DEFAULT_KIND_ENUM_NAME = 'AndroidGradientKind';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set([
  'filename',
  'packageName',
  'objectName',
  'dataClassName',
  'stopClassName',
  'kindEnumName',
]);

interface AndroidMaterialGradientsFormatterOptions {
  readonly filename: string;
  readonly packageName: string;
  readonly objectName: string;
  readonly dataClassName: string;
  readonly stopClassName: string;
  readonly kindEnumName: string;
}

interface AndroidGradientResourceEntry {
  readonly pointer: JsonPointer;
  readonly identifier: string;
  readonly metadata: GradientAndroidMaterialTransformOutput;
}

/**
 * Creates the formatter definition factory responsible for emitting Android Material gradient artifacts.
 *
 * @returns {FormatterDefinitionFactory} The Android Material gradients formatter factory.
 */
export function createAndroidMaterialGradientsFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createAndroidMaterialGradientsFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): AndroidMaterialGradientsFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      packageName: DEFAULT_PACKAGE_NAME,
      objectName: DEFAULT_OBJECT_NAME,
      dataClassName: DEFAULT_DATA_CLASS_NAME,
      stopClassName: DEFAULT_STOP_CLASS_NAME,
      kindEnumName: DEFAULT_KIND_ENUM_NAME,
    } satisfies AndroidMaterialGradientsFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);

  const typedOptions = options as {
    readonly filename?: unknown;
    readonly packageName?: unknown;
    readonly objectName?: unknown;
    readonly dataClassName?: unknown;
    readonly stopClassName?: unknown;
    readonly kindEnumName?: unknown;
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
  const stopClassName =
    typedOptions.stopClassName === undefined
      ? DEFAULT_STOP_CLASS_NAME
      : normaliseIdentifier(
          assertStringOption(typedOptions.stopClassName, name, 'stopClassName'),
          'stopClassName',
        );
  const kindEnumName =
    typedOptions.kindEnumName === undefined
      ? DEFAULT_KIND_ENUM_NAME
      : normaliseIdentifier(
          assertStringOption(typedOptions.kindEnumName, name, 'kindEnumName'),
          'kindEnumName',
        );

  return {
    filename,
    packageName,
    objectName,
    dataClassName,
    stopClassName,
    kindEnumName,
  } satisfies AndroidMaterialGradientsFormatterOptions;
}

function createAndroidMaterialGradientsFormatterDefinition(
  options: AndroidMaterialGradientsFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: ['gradient'] },
    run: async ({ tokens }) => {
      const entries = collectGradientResources(tokens);
      if (entries.length === 0) {
        return [];
      }

      const contents = formatGradientResources(entries, options);
      const artifact: FileArtifact = {
        path: options.filename,
        contents,
        encoding: 'utf8',
        metadata: { gradientCount: entries.length },
      };

      return [artifact];
    },
  } satisfies FormatterDefinition;
}

function collectGradientResources(
  tokens: readonly FormatterToken[],
): readonly AndroidGradientResourceEntry[] {
  const resources: AndroidGradientResourceEntry[] = [];
  const seenIdentifiers = new Set<string>();
  const sortedTokens = [...tokens].toSorted((a, b) => a.pointer.localeCompare(b.pointer));

  for (const token of sortedTokens) {
    if (token.type !== 'gradient') {
      continue;
    }

    const metadata = token.transforms.get('gradient.toAndroidMaterial') as
      | GradientAndroidMaterialTransformOutput
      | undefined;

    if (!metadata || metadata.stops.length === 0) {
      continue;
    }

    const baseName = createAndroidResourceName(token.pointer);
    const identifier = createUniqueIdentifier(baseName, seenIdentifiers);
    resources.push({ pointer: token.pointer, identifier, metadata });
  }

  return resources;
}

function formatGradientResources(
  entries: readonly AndroidGradientResourceEntry[],
  options: AndroidMaterialGradientsFormatterOptions,
): string {
  const blocks = entries.flatMap((entry, index) => {
    const block = formatGradientEntry(entry, options);
    return index === 0 ? block : ['  ', ...block];
  });

  const lines = [
    `package ${options.packageName}`,
    '',
    `data class ${options.stopClassName}(`,
    '  val color: String,',
    '  val position: Double? = null,',
    '  val easing: String? = null,',
    ')',
    '',
    `enum class ${options.kindEnumName} {`,
    '  Linear,',
    '  Radial,',
    '}',
    '',
    `data class ${options.dataClassName}(`,
    `  val kind: ${options.kindEnumName},`,
    '  val angle: Double? = null,',
    `  val stops: List<${options.stopClassName}>,`,
    ')',
    '',
    `object ${options.objectName} {`,
    ...blocks,
    '}',
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function formatGradientEntry(
  entry: AndroidGradientResourceEntry,
  options: AndroidMaterialGradientsFormatterOptions,
): string[] {
  if (entry.metadata.kind === 'conic') {
    throw new TypeError(
      `Android Material gradients do not support conic kind. ` +
        `Token ${entry.pointer} must resolve to a linear or radial gradient.`,
    );
  }

  const angleLines =
    entry.metadata.angle === undefined
      ? []
      : [`    angle = ${formatNumeric(entry.metadata.angle)},`];

  return [
    `  // ${entry.pointer}`,
    `  val ${entry.identifier} = ${options.dataClassName}(`,
    `    kind = ${formatGradientKind(entry.metadata.kind, options.kindEnumName)},`,
    ...angleLines,
    '    stops = listOf(',
    ...entry.metadata.stops.map((stop) => formatGradientStop(stop, options.stopClassName)),
    '    ),',
    '  )',
  ];
}

function formatGradientStop(
  stop: GradientAndroidMaterialTransformOutput['stops'][number],
  stopClassName: string,
): string {
  const properties = [`color = ${JSON.stringify(stop.color)}`];
  if (stop.position !== undefined) {
    properties.push(`position = ${formatNumeric(stop.position)}`);
  }
  if (stop.easing !== undefined) {
    properties.push(`easing = ${JSON.stringify(stop.easing)}`);
  }
  return `      ${stopClassName}(${properties.join(', ')}),`;
}

function formatGradientKind(kind: 'linear' | 'radial', enumName: string): string {
  const suffix = kind === 'radial' ? 'Radial' : 'Linear';
  return `${enumName}.${suffix}`;
}

function createUniqueIdentifier(baseName: string, seen: Set<string>): string {
  const pascal = toPascalCase(baseName);
  if (!seen.has(pascal)) {
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
    return 'GradientToken';
  }

  const combined = segments
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');

  if (combined.length === 0) {
    return 'GradientToken';
  }

  if (/^[A-Za-z]/.test(combined) === false) {
    return `Gradient${combined}`;
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

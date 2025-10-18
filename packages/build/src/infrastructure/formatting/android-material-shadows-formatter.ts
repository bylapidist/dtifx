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
import type { ShadowAndroidMaterialTransformOutput } from '../../transform/shadow-transforms.js';
import { createAndroidResourceName } from './android-resource-name.js';

const FORMATTER_NAME = 'android.material.shadows';
const DEFAULT_FILENAME = 'src/main/java/com/example/tokens/ShadowTokens.kt';
const DEFAULT_PACKAGE_NAME = 'com.example.tokens';
const DEFAULT_OBJECT_NAME = 'ShadowTokens';
const DEFAULT_DATA_CLASS_NAME = 'AndroidShadowToken';
const DEFAULT_LAYER_CLASS_NAME = 'AndroidShadowLayer';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set([
  'filename',
  'packageName',
  'objectName',
  'dataClassName',
  'layerClassName',
]);

interface AndroidMaterialShadowsFormatterOptions {
  readonly filename: string;
  readonly packageName: string;
  readonly objectName: string;
  readonly dataClassName: string;
  readonly layerClassName: string;
}

interface AndroidShadowResourceEntry {
  readonly pointer: JsonPointer;
  readonly identifier: string;
  readonly metadata: ShadowAndroidMaterialTransformOutput;
}

/**
 * Creates the formatter definition factory responsible for emitting Android Material shadow artifacts.
 *
 * @returns {FormatterDefinitionFactory} The Android Material shadows formatter factory.
 */
export function createAndroidMaterialShadowsFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createAndroidMaterialShadowsFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): AndroidMaterialShadowsFormatterOptions {
  if (rawOptions === undefined) {
    return {
      filename: DEFAULT_FILENAME,
      packageName: DEFAULT_PACKAGE_NAME,
      objectName: DEFAULT_OBJECT_NAME,
      dataClassName: DEFAULT_DATA_CLASS_NAME,
      layerClassName: DEFAULT_LAYER_CLASS_NAME,
    } satisfies AndroidMaterialShadowsFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);

  const typedOptions = options as {
    readonly filename?: unknown;
    readonly packageName?: unknown;
    readonly objectName?: unknown;
    readonly dataClassName?: unknown;
    readonly layerClassName?: unknown;
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
  const layerClassName =
    typedOptions.layerClassName === undefined
      ? DEFAULT_LAYER_CLASS_NAME
      : normaliseIdentifier(
          assertStringOption(typedOptions.layerClassName, name, 'layerClassName'),
          'layerClassName',
        );

  return {
    filename,
    packageName,
    objectName,
    dataClassName,
    layerClassName,
  } satisfies AndroidMaterialShadowsFormatterOptions;
}

function createAndroidMaterialShadowsFormatterDefinition(
  options: AndroidMaterialShadowsFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: ['shadow'] },
    run: async ({ tokens }) => {
      const entries = collectShadowResources(tokens);
      if (entries.length === 0) {
        return [];
      }

      const contents = formatShadowResources(entries, options);
      const artifact: FileArtifact = {
        path: options.filename,
        contents,
        encoding: 'utf8',
        metadata: { shadowCount: entries.length },
      };

      return [artifact];
    },
  } satisfies FormatterDefinition;
}

function collectShadowResources(
  tokens: readonly FormatterToken[],
): readonly AndroidShadowResourceEntry[] {
  const resources: AndroidShadowResourceEntry[] = [];
  const seenIdentifiers = new Set<string>();
  const sortedTokens = [...tokens].toSorted((a, b) => a.pointer.localeCompare(b.pointer));

  for (const token of sortedTokens) {
    if (token.type !== 'shadow') {
      continue;
    }

    const metadata = token.transforms.get('shadow.toAndroidMaterial') as
      | ShadowAndroidMaterialTransformOutput
      | undefined;

    if (!metadata || metadata.layers.length === 0) {
      continue;
    }

    const baseName = createAndroidResourceName(token.pointer);
    const identifier = createUniqueIdentifier(baseName, seenIdentifiers);
    resources.push({ pointer: token.pointer, identifier, metadata });
  }

  return resources;
}

function formatShadowResources(
  entries: readonly AndroidShadowResourceEntry[],
  options: AndroidMaterialShadowsFormatterOptions,
): string {
  const blocks = entries.flatMap((entry, index) => {
    const block = formatShadowEntry(entry, options);
    return index === 0 ? block : ['  ', ...block];
  });

  const lines = [
    `package ${options.packageName}`,
    '',
    `data class ${options.layerClassName}(`,
    '  val color: String,',
    '  val x: Double,',
    '  val y: Double,',
    '  val radius: Double,',
    '  val spread: Double? = null,',
    '  val opacity: Double? = null,',
    ')',
    '',
    `data class ${options.dataClassName}(`,
    `  val layers: List<${options.layerClassName}>,`,
    ')',
    '',
    `object ${options.objectName} {`,
    ...blocks,
    '}',
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function formatShadowEntry(
  entry: AndroidShadowResourceEntry,
  options: AndroidMaterialShadowsFormatterOptions,
): string[] {
  return [
    `  // ${entry.pointer}`,
    `  val ${entry.identifier} = ${options.dataClassName}(`,
    '    layers = listOf(',
    ...entry.metadata.layers.map((layer) => formatShadowLayer(layer, options.layerClassName)),
    '    ),',
    '  )',
  ];
}

function formatShadowLayer(
  layer: ShadowAndroidMaterialTransformOutput['layers'][number],
  layerClassName: string,
): string {
  const properties = [
    `color = ${JSON.stringify(layer.color)}`,
    `x = ${formatNumeric(layer.x)}`,
    `y = ${formatNumeric(layer.y)}`,
    `radius = ${formatNumeric(layer.radius)}`,
  ];
  if (layer.spread !== undefined) {
    properties.push(`spread = ${formatNumeric(layer.spread)}`);
  }
  if (layer.opacity !== undefined) {
    properties.push(`opacity = ${formatNumeric(layer.opacity)}`);
  }
  return `      ${layerClassName}(${properties.join(', ')}),`;
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
    return 'ShadowToken';
  }

  const combined = segments
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');

  if (combined.length === 0) {
    return 'ShadowToken';
  }

  if (/^[A-Za-z]/.test(combined) === false) {
    return `Shadow${combined}`;
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

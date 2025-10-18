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
import type { ColorAndroidArgbTransformOutput } from '../../transform/color-transforms.js';
import { createUniqueAndroidResourceName } from './android-resource-name.js';

const FORMATTER_NAME = 'android.material.colors';
const DEFAULT_FILENAME = 'values/colors.xml';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename']);

interface AndroidMaterialColorsFormatterOptions {
  readonly filename: string;
}

interface AndroidColorResourceEntry {
  readonly pointer: JsonPointer;
  readonly name: string;
  readonly value: string;
}

/**
 * Creates the formatter definition factory responsible for emitting Android Material color resources.
 *
 * @returns {FormatterDefinitionFactory} The Android Material colors formatter factory.
 */
export function createAndroidMaterialColorsFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createAndroidMaterialColorsFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): AndroidMaterialColorsFormatterOptions {
  if (rawOptions === undefined) {
    return { filename: DEFAULT_FILENAME } satisfies AndroidMaterialColorsFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);

  const typedOptions = options as { readonly filename?: unknown };
  const { filename: filenameOption } = typedOptions;
  const filename =
    filenameOption === undefined
      ? DEFAULT_FILENAME
      : normaliseFilename(assertStringOption(filenameOption, name, 'filename'));

  return { filename } satisfies AndroidMaterialColorsFormatterOptions;
}

function createAndroidMaterialColorsFormatterDefinition(
  options: AndroidMaterialColorsFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: ['color'] },
    run: async ({ tokens }) => {
      const entries = collectColorResources(tokens);
      if (entries.length === 0) {
        return [];
      }

      const contents = formatColorResources(entries);
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

function collectColorResources(
  tokens: readonly FormatterToken[],
): readonly AndroidColorResourceEntry[] {
  const resources: AndroidColorResourceEntry[] = [];
  const seenNames = new Set<string>();
  const sortedTokens = [...tokens].toSorted((a, b) => a.pointer.localeCompare(b.pointer));

  for (const token of sortedTokens) {
    if (token.type !== 'color') {
      continue;
    }
    const metadata = token.transforms.get('color.toAndroidArgb') as
      | ColorAndroidArgbTransformOutput
      | undefined;
    if (!metadata?.argbHex) {
      continue;
    }
    const name = createUniqueAndroidResourceName(token.pointer, seenNames);
    const value = metadata.argbHex.toLowerCase();
    resources.push({ pointer: token.pointer, name, value });
  }

  return resources;
}

function formatColorResources(entries: readonly AndroidColorResourceEntry[]): string {
  const lines = entries.map((entry) => `    <color name="${entry.name}">${entry.value}</color>`);
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<resources>',
    ...lines,
    '</resources>',
    '',
  ].join('\n');
}

function normaliseFilename(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError('Formatter "android.material.colors" filename must be a non-empty string.');
  }
  return trimmed;
}

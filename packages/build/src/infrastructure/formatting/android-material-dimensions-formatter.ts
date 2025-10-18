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
import type {
  DimensionAndroidDpTransformOutput,
  DimensionAndroidSpTransformOutput,
} from '../../transform/dimension-transforms.js';
import { createUniqueAndroidResourceName } from './android-resource-name.js';

const FORMATTER_NAME = 'android.material.dimensions';
const DEFAULT_FILENAME = 'values/dimens.xml';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['filename']);

interface AndroidMaterialDimensionsFormatterOptions {
  readonly filename: string;
}

interface AndroidDimensionResourceEntry {
  readonly pointer: JsonPointer;
  readonly name: string;
  readonly literal: string;
}

/**
 * Creates the formatter definition factory responsible for emitting Android Material dimension resources.
 *
 * @returns {FormatterDefinitionFactory} The Android Material dimensions formatter factory.
 */
export function createAndroidMaterialDimensionsFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createAndroidMaterialDimensionsFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): AndroidMaterialDimensionsFormatterOptions {
  if (rawOptions === undefined) {
    return { filename: DEFAULT_FILENAME } satisfies AndroidMaterialDimensionsFormatterOptions;
  }

  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);

  const typedOptions = options as { readonly filename?: unknown };
  const { filename: filenameOption } = typedOptions;
  const filename =
    filenameOption === undefined
      ? DEFAULT_FILENAME
      : normaliseFilename(assertStringOption(filenameOption, name, 'filename'));

  return { filename } satisfies AndroidMaterialDimensionsFormatterOptions;
}

function createAndroidMaterialDimensionsFormatterDefinition(
  options: AndroidMaterialDimensionsFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: { types: ['dimension'] },
    run: async ({ tokens }) => {
      const entries = collectDimensionResources(tokens);
      if (entries.length === 0) {
        return [];
      }

      const contents = formatDimensionResources(entries);
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

function collectDimensionResources(
  tokens: readonly FormatterToken[],
): readonly AndroidDimensionResourceEntry[] {
  const resources: AndroidDimensionResourceEntry[] = [];
  const seenNames = new Set<string>();
  const sortedTokens = [...tokens].toSorted((a, b) => a.pointer.localeCompare(b.pointer));

  for (const token of sortedTokens) {
    if (token.type !== 'dimension') {
      continue;
    }

    const metadata =
      (token.transforms.get('dimension.toAndroidDp') as
        | DimensionAndroidDpTransformOutput
        | undefined) ??
      (token.transforms.get('dimension.toAndroidSp') as
        | DimensionAndroidSpTransformOutput
        | undefined);

    if (metadata?.literal === undefined || metadata.literal.length === 0) {
      continue;
    }

    const name = createUniqueAndroidResourceName(token.pointer, seenNames);
    resources.push({ pointer: token.pointer, name, literal: metadata.literal });
  }

  return resources;
}

function formatDimensionResources(entries: readonly AndroidDimensionResourceEntry[]): string {
  const lines = entries.map((entry) => `    <dimen name="${entry.name}">${entry.literal}</dimen>`);
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
    throw new TypeError(
      'Formatter "android.material.dimensions" filename must be a non-empty string.',
    );
  }
  return trimmed;
}

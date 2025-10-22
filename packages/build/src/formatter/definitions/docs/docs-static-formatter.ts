import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  assertAllowedKeys,
  assertPlainObject,
  assertStringOption,
  type ConfigOptionKind,
} from '../../../config/config-options.js';
import type { FormatterDefinitionFactory } from '../../formatter-factory.js';
import type { FormatterDefinition, FileArtifact } from '../../formatter-registry.js';
import {
  createDocumentationPlan,
  type DocumentationAssetPlan,
  type DocsAsset,
  type DocsAssetKind,
  type DocsDocumentationModel,
  type DocumentationModelOptions,
} from './documentation-model.js';
import {
  createAppScript,
  createDataScript,
  createIndexHtml,
  createStylesheet,
} from './static-site-templates.js';

const FORMATTER_NAME = 'docs.static';
const DEFAULT_TITLE = 'Design token documentation';
const DEFAULT_DESCRIPTION =
  'Documentation bundle generated from @dtifx/build token snapshots and transform outputs.';
const OPTION_KIND: ConfigOptionKind = 'formatter';
const OPTION_KEYS = new Set(['title', 'description']);

interface DocsStaticFormatterOptions {
  readonly title: string;
  readonly description?: string;
}

/**
 * Creates the formatter definition factory responsible for generating static documentation bundles.
 * @returns {FormatterDefinitionFactory} Factory capable of producing `docs.static` formatter definitions.
 */
export function createDocsStaticFormatterFactory(): FormatterDefinitionFactory {
  return {
    name: FORMATTER_NAME,
    create(entry) {
      const options = parseOptions(entry.options, entry.name);
      return createDocsStaticFormatterDefinition(options);
    },
  } satisfies FormatterDefinitionFactory;
}

function parseOptions(
  rawOptions: Readonly<Record<string, unknown>> | undefined,
  name: string,
): DocsStaticFormatterOptions {
  if (rawOptions === undefined) {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
    } satisfies DocsStaticFormatterOptions;
  }
  const options = assertPlainObject(rawOptions, name);
  assertAllowedKeys(options, OPTION_KEYS, name, OPTION_KIND);
  const typed = options as { readonly title?: unknown; readonly description?: unknown };

  const title = typed.title === undefined ? DEFAULT_TITLE : normaliseTitle(typed.title, name);
  const description =
    typed.description === undefined
      ? DEFAULT_DESCRIPTION
      : normaliseDescription(typed.description, name);

  return { title, description } satisfies DocsStaticFormatterOptions;
}

function normaliseTitle(value: unknown, name: string): string {
  const raw = assertStringOption(value, name, 'title').trim();
  if (raw.length === 0) {
    throw new TypeError(`Option "title" for "${name}" must be a non-empty string.`);
  }
  return raw;
}

function normaliseDescription(value: unknown, name: string): string {
  const raw = assertStringOption(value, name, 'description').trim();
  if (raw.length === 0) {
    return DEFAULT_DESCRIPTION;
  }
  return raw;
}

function createDocsStaticFormatterDefinition(
  options: DocsStaticFormatterOptions,
): FormatterDefinition {
  return {
    name: FORMATTER_NAME,
    selector: {} as FormatterDefinition['selector'],
    run: async ({ tokens }) => {
      if (tokens.length === 0) {
        return [];
      }

      const plan = createDocumentationPlan(tokens, toModelOptions(options));
      const {
        artifacts: assetArtifacts,
        assets,
        warnings: assetWarnings,
      } = await processAssetPlans(plan.assets);

      const model: DocsDocumentationModel = {
        ...plan.model,
        assets,
        warnings: [...plan.warnings, ...assetWarnings],
      } satisfies DocsDocumentationModel;

      const html = createIndexHtml(options);
      const styles = createStylesheet();
      const appScript = createAppScript();
      const dataScript = createDataScript(model);

      const artifacts: FileArtifact[] = [
        createUtf8Artifact('index.html', html, {
          formatter: FORMATTER_NAME,
          tokenCount: model.tokenCount,
          groupCount: model.groupCount,
        }),
        createUtf8Artifact('assets/styles.css', styles, { formatter: FORMATTER_NAME }),
        createUtf8Artifact('assets/app.js', appScript, { formatter: FORMATTER_NAME }),
        createUtf8Artifact('assets/docs-data.js', dataScript, {
          formatter: FORMATTER_NAME,
          tokenCount: model.tokenCount,
          assetCount: model.assets.length,
        }),
        ...assetArtifacts,
      ];

      return artifacts.toSorted((left, right) => left.path.localeCompare(right.path));
    },
  } satisfies FormatterDefinition;
}

function toModelOptions(options: DocsStaticFormatterOptions): DocumentationModelOptions {
  const base: DocumentationModelOptions = { title: options.title };
  if (options.description === undefined) {
    return base;
  }
  return { ...base, description: options.description } satisfies DocumentationModelOptions;
}

async function processAssetPlans(plans: readonly DocumentationAssetPlan[]): Promise<{
  readonly artifacts: FileArtifact[];
  readonly assets: readonly DocsAsset[];
  readonly warnings: readonly string[];
}> {
  if (plans.length === 0) {
    return { artifacts: [], assets: [], warnings: [] };
  }

  const artifacts: FileArtifact[] = [];
  const assets: DocsAsset[] = [];
  const warnings: string[] = [];

  for (const plan of plans) {
    const kind = determineAssetKind(plan.fileName);
    try {
      const [contents, stats] = await Promise.all([readFile(plan.filePath), stat(plan.filePath)]);
      artifacts.push({
        path: plan.outputPath,
        contents,
        encoding: 'buffer',
        metadata: {
          formatter: FORMATTER_NAME,
          sourceUri: plan.sourceUri,
          originalReferences: plan.originalReferences,
          pointers: plan.pointers,
        },
      });
      assets.push({
        outputPath: plan.outputPath,
        sourceUri: plan.sourceUri,
        fileName: plan.fileName,
        originalReferences: plan.originalReferences,
        pointers: plan.pointers,
        kind,
        status: 'copied',
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      });
    } catch (error) {
      warnings.push(
        `Failed to copy asset "${plan.sourceUri}" referenced by ${plan.pointers.join(', ')}: ${String(error)}.`,
      );
      assets.push({
        outputPath: plan.outputPath,
        sourceUri: plan.sourceUri,
        fileName: plan.fileName,
        originalReferences: plan.originalReferences,
        pointers: plan.pointers,
        kind,
        status: 'missing',
      });
    }
  }

  return { artifacts, assets, warnings };
}

function determineAssetKind(fileName: string): DocsAssetKind {
  const extension = path.extname(fileName).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (FONT_EXTENSIONS.has(extension)) {
    return 'font';
  }
  if (DATA_EXTENSIONS.has(extension)) {
    return 'data';
  }
  return 'unknown';
}

const IMAGE_EXTENSIONS = new Set<string>([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.bmp',
]);

const FONT_EXTENSIONS = new Set<string>(['.ttf', '.otf', '.woff', '.woff2', '.eot']);

const DATA_EXTENSIONS = new Set<string>(['.json', '.csv', '.txt', '.pdf', '.webmanifest']);

function createUtf8Artifact(
  pathName: string,
  contents: string,
  metadata: Readonly<Record<string, unknown>>,
): FileArtifact {
  return {
    path: pathName,
    contents,
    encoding: 'utf8',
    metadata,
  } satisfies FileArtifact;
}

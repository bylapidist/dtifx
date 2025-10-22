import { readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import type { TemplateDelegate } from 'handlebars';

import type { DocsDocumentationModel } from './documentation-model.js';

interface DocsPageOptions {
  readonly title: string;
  readonly description?: string;
}

interface DataScriptContext {
  readonly json: string;
}

const TEMPLATE_ROOT = new URL('templates/', import.meta.url);

const handlebars = Handlebars.create();

const templateCache = new Map<string, TemplateDelegate<unknown>>();
const assetCache = new Map<string, string>();

/**
 * Creates the HTML document that bootstraps the generated documentation application.
 *
 * @param {DocsPageOptions} options - Page metadata used to populate the document head and hero section.
 * @returns {string} Fully rendered HTML markup for the documentation index page.
 */
export function createIndexHtml(options: DocsPageOptions): string {
  return renderTemplate('index.hbs', options);
}

/**
 * Generates the stylesheet applied to the static documentation bundle.
 *
 * @returns {string} CSS source defining layout, colour palette and responsive behaviour for the UI.
 */
export function createStylesheet(): string {
  return readAsset('styles.css');
}

/**
 * Produces the client-side application script responsible for rendering documentation content in the browser.
 *
 * @returns {string} JavaScript source code for the static documentation viewer application.
 */
export function createAppScript(): string {
  return readAsset('app.js');
}

/**
 * Serialises the documentation model into a bootstrapping script consumable by the app runtime.
 *
 * @param {DocsDocumentationModel} model - Structured documentation data emitted by the formatter.
 * @returns {string} JavaScript that initialises the docs application state on the window object.
 */
export function createDataScript(model: DocsDocumentationModel): string {
  const json = JSON.stringify(model, undefined, 2);
  return renderTemplate<DataScriptContext>('data-script.hbs', { json });
}

function renderTemplate<T>(fileName: string, context: T): string {
  const template = loadTemplate<T>(fileName);
  return template(context);
}

function loadTemplate<T>(fileName: string): TemplateDelegate<T> {
  const cached = templateCache.get(fileName) as TemplateDelegate<T> | undefined;
  if (cached) {
    return cached;
  }

  const source = readAsset(fileName);
  const compiled = handlebars.compile<T>(source, { strict: true });
  templateCache.set(fileName, compiled as TemplateDelegate<unknown>);
  return compiled;
}

function readAsset(fileName: string): string {
  const cached = assetCache.get(fileName);
  if (cached !== undefined) {
    return cached;
  }

  const contents = readFileSync(new URL(fileName, TEMPLATE_ROOT), 'utf8');
  assetCache.set(fileName, contents);
  return contents;
}

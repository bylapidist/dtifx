import type { CliFormatterOptions } from './renderers/cli.js';
import type { HtmlFormatterOptions } from './renderers/html.js';
import type { JsonFormatterOptions } from './renderers/json.js';
import type { MarkdownFormatterOptions } from './renderers/markdown.js';
import type { SarifFormatterOptions } from './renderers/sarif.js';
import type { TemplateFormatterOptions } from './renderers/template.js';
import type { YamlFormatterOptions } from './renderers/yaml.js';

export type ReportRenderFormat =
  | 'cli'
  | 'html'
  | 'markdown'
  | 'json'
  | 'yaml'
  | 'sarif'
  | 'template';

export type RenderReportOptions =
  | ({ format: 'cli' } & CliFormatterOptions)
  | ({ format: 'html' } & HtmlFormatterOptions)
  | ({ format: 'markdown' } & MarkdownFormatterOptions)
  | ({ format: 'json' } & JsonFormatterOptions)
  | ({ format: 'yaml' } & YamlFormatterOptions)
  | ({ format: 'sarif' } & SarifFormatterOptions)
  | ({ format: 'template' } & TemplateFormatterOptions);

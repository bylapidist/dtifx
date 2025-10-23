import { readFile } from 'node:fs/promises';

import type { DesignTokenInterchangeFormat } from '@dtifx/core';

const SKETCH_EXTENSION_NAMESPACE = 'net.lapidist.sources.sketch';

interface SketchColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha?: number;
}

interface SketchColorVariable {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly value?: SketchColor;
}

interface SketchGradientStop {
  readonly position: number;
  readonly color?: SketchColor;
}

interface SketchGradient {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly type: 'linear' | 'radial' | (string & Record<never, never>);
  readonly angle?: number;
  readonly stops?: readonly SketchGradientStop[];
}

interface SketchTextStyle {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly paragraphSpacing?: number;
  readonly textCase?:
    | 'none'
    | 'uppercase'
    | 'lowercase'
    | 'title'
    | 'small-caps'
    | (string & Record<never, never>);
  readonly textDecoration?:
    | 'none'
    | 'underline'
    | 'strikethrough'
    | (string & Record<never, never>);
  readonly color?: SketchColor;
}

interface SketchDocumentPayload {
  readonly colorVariables?: readonly SketchColorVariable[];
  readonly gradientStyles?: readonly SketchGradient[];
  readonly textStyles?: readonly SketchTextStyle[];
}

interface SketchFilesystemClient {
  readDocument(filePath: string): Promise<SketchDocumentPayload>;
}

export interface SketchExtractionWarning {
  readonly code:
    | 'missing-color-value'
    | 'missing-gradient-stop'
    | 'unsupported-gradient-type'
    | 'missing-typography-value';
  readonly message: string;
  readonly styleId?: string;
  readonly styleName?: string;
}

export interface SketchExtractorOptions {
  readonly filePath: string;
  readonly readFile?: typeof readFile;
}

export interface SketchExtractResult {
  readonly document: DesignTokenInterchangeFormat;
  readonly warnings: readonly SketchExtractionWarning[];
}

type JsonObject = Record<string, unknown>;
type MutableTokenDocument = DesignTokenInterchangeFormat & JsonObject;

const isPlainObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
};

const roundToPrecision = (value: number, precision = 6): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const convertComponentToHex = (component: number): string => {
  const value = Math.round(clamp01(component) * 255);
  const hex = value.toString(16).toUpperCase();
  return hex.length === 1 ? `0${hex}` : hex;
};

const normaliseSegment = (segment: string): string => {
  const trimmed = segment.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const sanitised = trimmed
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^A-Za-z0-9_-]+/g, '-')
    .replaceAll(/-{2,}/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  return sanitised.toLowerCase();
};

const normaliseStylePath = (styleName: string | undefined, fallback: string): readonly string[] => {
  const segments = styleName ? styleName.split('/') : [];
  const normalised = segments
    .map((segment) => normaliseSegment(segment))
    .filter((segment) => segment.length > 0);
  if (normalised.length === 0) {
    return [fallback];
  }
  if (normalised[0] !== fallback) {
    return [fallback, ...normalised];
  }
  return normalised;
};

const mergeTokenIntoDocument = (
  document: MutableTokenDocument,
  path: readonly string[],
  token: JsonObject,
): void => {
  if (path.length === 0) {
    throw new TypeError('Token path must include at least one segment.');
  }
  let cursor: JsonObject = document;
  for (const segment of path.slice(0, -1)) {
    const existing = cursor[segment];
    if (!isPlainObject(existing)) {
      cursor[segment] = {};
    } else if ('$type' in (existing as JsonObject) && '$value' in (existing as JsonObject)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as JsonObject;
  }
  const lastSegment = path.at(-1);
  if (!lastSegment) {
    throw new TypeError('Token path must include at least one segment.');
  }
  cursor[lastSegment] = token;
};

const convertSketchColor = (color: SketchColor | undefined): JsonObject | undefined => {
  if (!color) {
    return undefined;
  }
  const components = [color.red, color.green, color.blue].map((component) =>
    roundToPrecision(clamp01(component)),
  ) as [number, number, number];
  const alpha = clamp01(color.alpha ?? 1);
  const hex = `#${components.map((component) => convertComponentToHex(component)).join('')}`;
  return {
    colorSpace: 'srgb',
    components,
    hex,
    ...(alpha < 1 ? { alpha: roundToPrecision(alpha) } : {}),
  } satisfies JsonObject;
};

const createSketchClient = ({
  readFileImpl = readFile,
}: {
  readonly readFileImpl?: typeof readFile;
} = {}): SketchFilesystemClient => {
  return {
    async readDocument(filePath: string): Promise<SketchDocumentPayload> {
      const raw = await readFileImpl(filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!isPlainObject(parsed)) {
        throw new TypeError('Sketch document payload was not an object.');
      }
      const { colorVariables, gradientStyles, textStyles } = parsed as SketchDocumentPayload;
      return {
        ...(Array.isArray(colorVariables) ? { colorVariables } : {}),
        ...(Array.isArray(gradientStyles) ? { gradientStyles } : {}),
        ...(Array.isArray(textStyles) ? { textStyles } : {}),
      };
    },
  } satisfies SketchFilesystemClient;
};

interface StyleMetadata {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

const enrichTokenMetadata = (
  token: JsonObject,
  context: { readonly style: StyleMetadata },
): JsonObject => {
  const metadata: JsonObject = {
    ...(context.style.description ? { $description: context.style.description } : {}),
    $extensions: {
      [SKETCH_EXTENSION_NAMESPACE]: {
        id: context.style.id,
        name: context.style.name,
      },
    },
  } satisfies JsonObject;
  return { ...token, ...metadata } satisfies JsonObject;
};

const createColorToken = (
  variable: SketchColorVariable,
  warnings: SketchExtractionWarning[],
): JsonObject | undefined => {
  const value = convertSketchColor(variable.value);
  if (!value) {
    warnings.push({
      code: 'missing-color-value',
      message: `Sketch color variable "${variable.name}" is missing a value.`,
      styleId: variable.id,
      styleName: variable.name,
    });
    return undefined;
  }
  return {
    $type: 'color',
    $value: value,
  } satisfies JsonObject;
};

const createGradientToken = (
  gradient: SketchGradient,
  warnings: SketchExtractionWarning[],
): JsonObject | undefined => {
  const stops = Array.isArray(gradient.stops) ? gradient.stops : [];
  const isSupportedType = gradient.type === 'linear' || gradient.type === 'radial';
  if (!isSupportedType) {
    warnings.push({
      code: 'unsupported-gradient-type',
      message: `Sketch gradient "${gradient.name}" has unsupported type "${gradient.type}".`,
      styleId: gradient.id,
      styleName: gradient.name,
    });
  }

  const convertedStops: JsonObject[] = [];
  for (const stop of stops) {
    const color = convertSketchColor(stop.color);
    if (!color) {
      continue;
    }
    convertedStops.push({
      position: roundToPrecision(clamp01(stop.position)),
      color,
    } satisfies JsonObject);
  }

  if (convertedStops.length === 0) {
    warnings.push({
      code: 'missing-gradient-stop',
      message: `Sketch gradient "${gradient.name}" does not define valid color stops.`,
      styleId: gradient.id,
      styleName: gradient.name,
    });
  }

  if (!isSupportedType || convertedStops.length === 0) {
    return undefined;
  }

  return {
    $type: 'gradient',
    $value: {
      gradientType: gradient.type,
      ...(typeof gradient.angle === 'number' ? { angle: roundToPrecision(gradient.angle) } : {}),
      stops: convertedStops,
    },
  } satisfies JsonObject;
};

const mapTextCase = (
  value: SketchTextStyle['textCase'],
): 'none' | 'uppercase' | 'lowercase' | 'title' | 'small-caps' | undefined => {
  if (
    value === 'uppercase' ||
    value === 'lowercase' ||
    value === 'title' ||
    value === 'small-caps'
  ) {
    return value as 'uppercase' | 'lowercase' | 'title' | 'small-caps';
  }
  return undefined;
};

const mapTextDecoration = (
  value: SketchTextStyle['textDecoration'],
): 'underline' | 'line-through' | undefined => {
  if (value === 'underline') {
    return 'underline';
  }
  if (value === 'strikethrough') {
    return 'line-through';
  }
  return undefined;
};

const createTypographyToken = (
  style: SketchTextStyle,
  warnings: SketchExtractionWarning[],
): JsonObject | undefined => {
  const value: JsonObject = {};
  if (style.fontFamily) {
    value['fontFamily'] = style.fontFamily;
  }
  if (typeof style.fontSize === 'number') {
    value['fontSize'] = {
      unit: 'px',
      value: roundToPrecision(style.fontSize),
    } satisfies JsonObject;
  }
  if (typeof style.fontWeight === 'number') {
    value['fontWeight'] = Math.round(style.fontWeight);
  }
  if (typeof style.lineHeight === 'number') {
    value['lineHeight'] = {
      unit: 'px',
      value: roundToPrecision(style.lineHeight),
    } satisfies JsonObject;
  }
  if (typeof style.letterSpacing === 'number') {
    value['letterSpacing'] = {
      unit: 'px',
      value: roundToPrecision(style.letterSpacing),
    } satisfies JsonObject;
  }
  if (typeof style.paragraphSpacing === 'number') {
    value['paragraphSpacing'] = {
      unit: 'px',
      value: roundToPrecision(style.paragraphSpacing),
    } satisfies JsonObject;
  }
  const textCase = mapTextCase(style.textCase);
  if (textCase) {
    value['textCase'] = textCase;
  }
  const textDecoration = mapTextDecoration(style.textDecoration);
  if (textDecoration) {
    value['textDecoration'] = textDecoration;
  }
  const color = convertSketchColor(style.color);
  if (color) {
    value['color'] = color;
  }
  if (Object.keys(value).length === 0) {
    warnings.push({
      code: 'missing-typography-value',
      message: `Sketch typography style "${style.name}" does not define any properties.`,
      styleId: style.id,
      styleName: style.name,
    });
    return undefined;
  }
  return {
    $type: 'typography',
    $value: value,
  } satisfies JsonObject;
};

export const extractSketchTokens = async ({
  filePath,
  readFile: readFileImpl,
}: SketchExtractorOptions): Promise<SketchExtractResult> => {
  const client = createSketchClient({
    ...(readFileImpl ? { readFileImpl } : {}),
  });
  const warnings: SketchExtractionWarning[] = [];
  const document: MutableTokenDocument = {
    $schema: 'https://dtif.lapidist.net/schema/core.json',
    $version: '1.0.0',
  } as MutableTokenDocument;

  const payload = await client.readDocument(filePath);

  for (const variable of payload.colorVariables ?? []) {
    const token = createColorToken(variable, warnings);
    if (!token) {
      continue;
    }
    const path = normaliseStylePath(variable.name, 'color');
    mergeTokenIntoDocument(document, path, enrichTokenMetadata(token, { style: variable }));
  }

  for (const gradient of payload.gradientStyles ?? []) {
    const token = createGradientToken(gradient, warnings);
    if (!token) {
      continue;
    }
    const path = normaliseStylePath(gradient.name, 'gradient');
    mergeTokenIntoDocument(document, path, enrichTokenMetadata(token, { style: gradient }));
  }

  for (const style of payload.textStyles ?? []) {
    const token = createTypographyToken(style, warnings);
    if (!token) {
      continue;
    }
    const path = normaliseStylePath(style.name, 'typography');
    mergeTokenIntoDocument(document, path, enrichTokenMetadata(token, { style }));
  }

  return { document, warnings } satisfies SketchExtractResult;
};

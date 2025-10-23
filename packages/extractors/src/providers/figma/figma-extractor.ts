import type { DesignTokenInterchangeFormat } from '@dtifx/core';

const DEFAULT_FIGMA_BASE_URL = 'https://api.figma.com/';
const FIGMA_EXTENSION_NAMESPACE = 'net.lapidist.sources.figma';

const FIGMA_NODE_CHUNK_SIZE = 20;

interface FigmaStyle {
  readonly key: string;
  readonly name: string;
  readonly style_type: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID' | (string & Record<never, never>);
  readonly description?: string;
  readonly node_id?: string;
  readonly file_key?: string;
}

interface FigmaFileResponse {
  readonly styles?: Record<string, FigmaStyle | undefined>;
}

interface FigmaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

interface FigmaGradientStop {
  readonly position: number;
  readonly color: FigmaColor;
}

interface FigmaVector {
  readonly x: number;
  readonly y: number;
}

interface FigmaPaint {
  readonly type:
    | 'SOLID'
    | 'GRADIENT_LINEAR'
    | 'GRADIENT_RADIAL'
    | 'GRADIENT_ANGULAR'
    | 'GRADIENT_DIAMOND'
    | 'IMAGE'
    | (string & Record<never, never>);
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly color?: FigmaColor;
  readonly gradientStops?: readonly FigmaGradientStop[];
  readonly gradientHandlePositions?: readonly FigmaVector[];
  readonly imageRef?: string;
  readonly scaleMode?: string;
}

interface FigmaFontName {
  readonly family: string;
  readonly style: string;
}

interface FigmaTextStyle {
  readonly fontSize?: number;
  readonly fontName?: FigmaFontName;
  readonly fontWeight?: number;
  readonly lineHeightPx?: number;
  readonly lineHeightPercentFontSize?: number;
  readonly lineHeightUnit?: 'PIXELS' | 'FONT_SIZE_%' | (string & Record<never, never>);
  readonly letterSpacing?: number;
  readonly letterSpacingUnit?: 'PIXELS' | 'PERCENT' | (string & Record<never, never>);
  readonly paragraphSpacing?: number;
  readonly paragraphIndent?: number;
  readonly textCase?:
    | 'ORIGINAL'
    | 'UPPER'
    | 'LOWER'
    | 'TITLE'
    | 'SMALL_CAPS'
    | 'SMALL_CAPS_FORCED'
    | (string & Record<never, never>);
  readonly textDecoration?:
    | 'NONE'
    | 'UNDERLINE'
    | 'STRIKETHROUGH'
    | (string & Record<never, never>);
}

interface FigmaNode {
  readonly id: string;
  readonly name?: string;
  readonly type?: string;
  readonly fills?: 'MIXED' | readonly FigmaPaint[];
  readonly visible?: boolean;
  readonly style?: FigmaTextStyle;
  readonly characters?: string;
}

interface FigmaNodeEntry {
  readonly document?: FigmaNode;
}

interface FigmaNodesResponse {
  readonly nodes?: Record<string, FigmaNodeEntry | undefined>;
}

export interface FigmaExtractionWarning {
  readonly code:
    | 'missing-style-node'
    | 'unsupported-style-type'
    | 'missing-style-paint'
    | 'unsupported-paint'
    | 'missing-text-style'
    | 'missing-text-fill'
    | 'unmapped-gradient';
  readonly message: string;
  readonly style?: FigmaStyle;
}

export interface FigmaExtractorOptions {
  readonly fileKey: string;
  readonly personalAccessToken: string;
  readonly nodeIds?: readonly string[];
  readonly apiBaseUrl?: string;
  readonly fetch?: typeof fetch;
}

export interface FigmaExtractResult {
  readonly document: DesignTokenInterchangeFormat;
  readonly warnings: readonly FigmaExtractionWarning[];
}

type MutableTokenDocument = DesignTokenInterchangeFormat & Record<string, unknown>;

type JsonObject = Record<string, unknown>;

interface FigmaClient {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly personalAccessToken: string;
  getFile(fileKey: string): Promise<FigmaFileResponse>;
  getNodes(fileKey: string, nodeIds: readonly string[]): Promise<Record<string, FigmaNode>>;
}

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

const chunk = <T>(values: readonly T[], size: number): readonly (readonly T[])[] => {
  if (values.length === 0) {
    return [];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size) as T[]);
  }
  return chunks;
};

const createFigmaClient = ({
  personalAccessToken,
  apiBaseUrl = DEFAULT_FIGMA_BASE_URL,
  fetchImpl = fetch,
}: {
  readonly personalAccessToken: string;
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}): FigmaClient => {
  const baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`;

  const requestJson = async (path: string, params?: Record<string, string>): Promise<unknown> => {
    const url = new URL(path.replace(/^\//, ''), baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetchImpl(url.href, {
      headers: {
        Authorization: `Bearer ${personalAccessToken}`,
      },
    });

    if (!response.ok) {
      const reason = `${response.status} ${response.statusText}`.trim();
      throw new Error(`Figma request for ${url.pathname} failed: ${reason}`);
    }

    return response.json();
  };

  return {
    baseUrl,
    fetch: fetchImpl,
    personalAccessToken,
    async getFile(fileKey: string): Promise<FigmaFileResponse> {
      const payload = await requestJson(`/v1/files/${fileKey}`);
      if (!isPlainObject(payload)) {
        throw new TypeError('Figma file response was not an object.');
      }
      const { styles } = payload as { styles?: unknown };
      const styleMap: Record<string, FigmaStyle | undefined> = {};
      if (isPlainObject(styles)) {
        for (const [key, value] of Object.entries(styles)) {
          if (isPlainObject(value)) {
            styleMap[key] = value as unknown as FigmaStyle;
          }
        }
      }
      return { styles: styleMap };
    },
    async getNodes(
      fileKey: string,
      nodeIds: readonly string[],
    ): Promise<Record<string, FigmaNode>> {
      const entries: [string, FigmaNode][] = [];
      const batches = chunk(nodeIds, FIGMA_NODE_CHUNK_SIZE);
      for (const ids of batches) {
        if (ids.length === 0) {
          continue;
        }
        const payload = await requestJson(`/v1/files/${fileKey}/nodes`, { ids: ids.join(',') });
        if (!isPlainObject(payload)) {
          throw new TypeError('Figma nodes response was not an object.');
        }
        const { nodes } = payload as FigmaNodesResponse;
        if (!nodes) {
          continue;
        }
        for (const [id, entry] of Object.entries(nodes)) {
          const node = entry?.document;
          if (node) {
            entries.push([id, node]);
          }
        }
      }
      return Object.fromEntries(entries);
    },
  };
};

interface FigmaColorValue {
  readonly colorSpace: string;
  readonly components: readonly [number, number, number, ...number[]];
  readonly alpha?: number;
  readonly hex: string;
}

const convertColor = (
  color: FigmaColor | undefined,
  opacity: number | undefined,
): FigmaColorValue | undefined => {
  if (!color) {
    return undefined;
  }
  const components = [color.r, color.g, color.b].map((component) =>
    roundToPrecision(clamp01(component)),
  ) as [number, number, number];
  const finalOpacity = clamp01((color.a ?? 1) * (opacity ?? 1));
  const hex = `#${components.map((component) => convertComponentToHex(component)).join('')}`;
  return {
    colorSpace: 'srgb',
    components,
    hex,
    ...(finalOpacity < 1 ? { alpha: roundToPrecision(finalOpacity) } : {}),
  };
};

const convertPaintToColorToken = (paint: FigmaPaint): JsonObject | undefined => {
  const value = convertColor(paint.color, paint.opacity);
  if (!value) {
    return undefined;
  }
  return {
    $type: 'color',
    $value: value,
  } satisfies JsonObject;
};

interface FigmaGradientValue {
  readonly gradientType: 'linear' | 'radial' | 'conic';
  readonly stops: readonly {
    readonly position: number;
    readonly color: FigmaColorValue;
  }[];
  readonly angle?: number;
  readonly center?: { readonly x: number; readonly y: number };
}

const convertPaintToGradientToken = (paint: FigmaPaint): JsonObject | undefined => {
  if (!paint.gradientStops || paint.gradientStops.length === 0) {
    return undefined;
  }

  let gradientType: FigmaGradientValue['gradientType'] | undefined;
  switch (paint.type) {
    case 'GRADIENT_LINEAR': {
      gradientType = 'linear';
      break;
    }
    case 'GRADIENT_RADIAL': {
      gradientType = 'radial';
      break;
    }
    case 'GRADIENT_ANGULAR': {
      gradientType = 'conic';
      break;
    }
    case 'GRADIENT_DIAMOND': {
      gradientType = 'radial';
      break;
    }
    default: {
      break;
    }
  }

  if (!gradientType) {
    return undefined;
  }

  const stops = paint.gradientStops
    .map((stop) => {
      const color = convertColor(stop.color, paint.opacity);
      if (!color) {
        return;
      }
      return {
        position: roundToPrecision(stop.position),
        color,
      };
    })
    .filter(
      (stop): stop is { readonly position: number; readonly color: FigmaColorValue } =>
        stop !== undefined,
    );

  if (stops.length === 0) {
    return undefined;
  }

  const gradientHandles = paint.gradientHandlePositions;
  let angle: number | undefined;
  let center: { readonly x: number; readonly y: number } | undefined;
  if (gradientHandles && gradientHandles.length >= 2) {
    const [start, end] = gradientHandles;
    if (start && end) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      if (dx !== 0 || dy !== 0) {
        const computedAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
        angle = roundToPrecision((computedAngle + 360) % 360);
      }
    }
    if (gradientType === 'radial') {
      const origin = gradientHandles[0];
      if (origin) {
        center = {
          x: roundToPrecision(origin.x),
          y: roundToPrecision(origin.y),
        };
      }
    }
  }

  const gradient: FigmaGradientValue = {
    gradientType,
    stops,
    ...(angle === undefined ? {} : { angle }),
    ...(center === undefined ? {} : { center }),
  };

  return {
    $type: 'gradient',
    $value: gradient,
  } satisfies JsonObject;
};

const convertPaintToImageToken = (
  paint: FigmaPaint,
  context: { readonly fileKey: string; readonly node: FigmaNode; readonly baseUrl: string },
): JsonObject | undefined => {
  if (!paint.imageRef) {
    return undefined;
  }
  const baseUrl = context.baseUrl.endsWith('/') ? context.baseUrl : `${context.baseUrl}/`;
  const url = new URL(`v1/images/${context.fileKey}`, baseUrl);
  url.searchParams.set('ids', context.node.id);
  url.searchParams.set('format', 'png');
  return {
    $type: 'string',
    $value: url.href,
  } satisfies JsonObject;
};

const mapTextCase = (textCase: FigmaTextStyle['textCase']): string | undefined => {
  if (textCase === undefined || textCase === 'ORIGINAL') {
    return undefined;
  }
  if (textCase === 'UPPER') {
    return 'uppercase';
  }
  if (textCase === 'LOWER') {
    return 'lowercase';
  }
  if (textCase === 'TITLE') {
    return 'title';
  }
  if (textCase === 'SMALL_CAPS') {
    return 'small-caps';
  }
  if (textCase === 'SMALL_CAPS_FORCED') {
    return 'small-caps-forced';
  }
  return textCase.toLowerCase();
};

const mapTextDecoration = (decoration: FigmaTextStyle['textDecoration']): string | undefined => {
  if (decoration === undefined || decoration === 'NONE') {
    return undefined;
  }
  if (decoration === 'UNDERLINE') {
    return 'underline';
  }
  if (decoration === 'STRIKETHROUGH') {
    return 'line-through';
  }
  return decoration.toLowerCase();
};

const createPxDimension = (value: number | undefined): JsonObject | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return {
    unit: 'px',
    value: roundToPrecision(value),
    dimensionType: 'length',
  } satisfies JsonObject;
};

const convertTextStyle = (
  style: FigmaTextStyle,
  paint: FigmaPaint | undefined,
): JsonObject | undefined => {
  const value: JsonObject = {};
  if (style.fontName?.family) {
    value['fontFamily'] = style.fontName.family.toLowerCase();
  }
  if (style.fontWeight !== undefined) {
    value['fontWeight'] = style.fontWeight;
  }
  if (style.fontName?.style) {
    value['fontStyle'] = style.fontName.style;
  }
  const fontSize = createPxDimension(style.fontSize);
  if (fontSize) {
    value['fontSize'] = fontSize;
  }
  const lineHeight = createPxDimension(style.lineHeightPx);
  if (lineHeight) {
    value['lineHeight'] = lineHeight;
  }
  const letterSpacing = (() => {
    if (style.letterSpacing === undefined) {
      return;
    }
    if (style.letterSpacingUnit === 'PERCENT') {
      return `${roundToPrecision(style.letterSpacing)}%`;
    }
    return createPxDimension(style.letterSpacing);
  })();
  if (letterSpacing) {
    value['letterSpacing'] = letterSpacing;
  }
  const paragraphSpacing = createPxDimension(style.paragraphSpacing);
  if (paragraphSpacing) {
    value['paragraphSpacing'] = paragraphSpacing;
  }
  const textCase = mapTextCase(style.textCase);
  if (textCase) {
    value['textCase'] = textCase;
  }
  const textDecoration = mapTextDecoration(style.textDecoration);
  if (textDecoration) {
    value['textDecoration'] = textDecoration;
  }
  if (paint?.type === 'SOLID') {
    const color = convertColor(paint.color, paint.opacity);
    if (color) {
      value['color'] = color;
    }
  }
  if (Object.keys(value).length === 0) {
    return undefined;
  }
  return {
    $type: 'typography',
    $value: value,
  } satisfies JsonObject;
};

const enrichTokenMetadata = (
  token: JsonObject,
  context: { readonly style: FigmaStyle; readonly fileKey: string },
): JsonObject => {
  const metadata: JsonObject = {
    ...(context.style.description ? { $description: context.style.description } : {}),
    $extensions: {
      [FIGMA_EXTENSION_NAMESPACE]: {
        fileKey: context.fileKey,
        styleKey: context.style.key,
        styleName: context.style.name,
        styleType: context.style.style_type,
        nodeId: context.style.node_id,
      },
    },
  } satisfies JsonObject;
  return { ...token, ...metadata } satisfies JsonObject;
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

const selectVisiblePaint = (node: FigmaNode): FigmaPaint | undefined => {
  if (!Array.isArray(node.fills)) {
    return undefined;
  }
  return node.fills.find((paint) => paint?.visible !== false);
};

const resolveTypographyPaint = (node: FigmaNode): FigmaPaint | undefined => {
  if (!Array.isArray(node.fills)) {
    return undefined;
  }
  return node.fills.find((paint) => paint?.type === 'SOLID' && paint.visible !== false);
};

export const extractFigmaTokens = async ({
  fileKey,
  personalAccessToken,
  nodeIds,
  apiBaseUrl,
  fetch: fetchImpl,
}: FigmaExtractorOptions): Promise<FigmaExtractResult> => {
  const client = createFigmaClient({
    personalAccessToken,
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const warnings: FigmaExtractionWarning[] = [];
  const document: MutableTokenDocument = {
    $schema: 'https://dtif.lapidist.net/schema/core.json',
    $version: '1.0.0',
  } as MutableTokenDocument;

  const file = await client.getFile(fileKey);
  const styles = file.styles ?? {};
  const styleEntries = Object.entries(styles)
    .map(([, style]) => style)
    .filter((style): style is FigmaStyle => style !== undefined);

  const filteredStyles =
    nodeIds && nodeIds.length > 0
      ? styleEntries.filter((style) => (style.node_id ? nodeIds.includes(style.node_id) : false))
      : styleEntries;

  const requiredNodeIds = filteredStyles
    .map((style) => style.node_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const nodeMap = await client.getNodes(fileKey, requiredNodeIds);

  for (const style of filteredStyles) {
    if (style.style_type !== 'FILL' && style.style_type !== 'TEXT') {
      warnings.push({
        code: 'unsupported-style-type',
        style,
        message: `Skipping style "${style.name}" with unsupported type ${style.style_type}.`,
      });
      continue;
    }

    const nodeId = style.node_id;
    if (!nodeId) {
      warnings.push({
        code: 'missing-style-node',
        style,
        message: `Style "${style.name}" is missing node metadata and cannot be converted.`,
      });
      continue;
    }

    const node = nodeMap[nodeId];
    if (!node) {
      warnings.push({
        code: 'missing-style-node',
        style,
        message: `Figma node ${nodeId} for style "${style.name}" was not returned.`,
      });
      continue;
    }

    const paint = selectVisiblePaint(node);

    if (style.style_type === 'TEXT') {
      if (!node.style) {
        warnings.push({
          code: 'missing-text-style',
          style,
          message: `Text style "${style.name}" is missing typography metadata.`,
        });
        continue;
      }
      const fill = resolveTypographyPaint(node);
      if (!fill) {
        warnings.push({
          code: 'missing-text-fill',
          style,
          message: `Text style "${style.name}" does not define a solid fill colour.`,
        });
      }
      const token = convertTextStyle(node.style, fill);
      if (!token) {
        warnings.push({
          code: 'missing-text-style',
          style,
          message: `Text style "${style.name}" did not yield typography metadata.`,
        });
        continue;
      }
      const enriched = enrichTokenMetadata(token, { style, fileKey });
      const path = normaliseStylePath(style.name, 'typography');
      mergeTokenIntoDocument(document, path, enriched);
      continue;
    }

    if (!paint) {
      warnings.push({
        code: 'missing-style-paint',
        style,
        message: `Paint data for style "${style.name}" could not be resolved.`,
      });
      continue;
    }

    let token: JsonObject | undefined;
    if (paint.type === 'SOLID') {
      token = convertPaintToColorToken(paint);
    } else if (paint.type.startsWith('GRADIENT_')) {
      token = convertPaintToGradientToken(paint);
      if (!token) {
        warnings.push({
          code: 'unmapped-gradient',
          style,
          message: `Gradient style "${style.name}" could not be mapped to DTIF structures.`,
        });
        continue;
      }
    } else if (paint.type === 'IMAGE') {
      token = convertPaintToImageToken(paint, { fileKey, node, baseUrl: client.baseUrl });
    }

    if (!token) {
      warnings.push({
        code: 'unsupported-paint',
        style,
        message: `Style "${style.name}" uses an unsupported paint type ${paint.type}.`,
      });
      continue;
    }

    const enriched = enrichTokenMetadata(token, { style, fileKey });
    const rawType = (token as { $type?: unknown }).$type;
    let fallback = 'color';
    if (typeof rawType === 'string') {
      switch (rawType) {
        case 'gradient': {
          fallback = 'gradient';
          break;
        }
        case 'typography': {
          fallback = 'typography';
          break;
        }
        case 'string': {
          fallback = 'asset';
          break;
        }
        default: {
          break;
        }
      }
    }
    const path = normaliseStylePath(style.name, fallback);
    mergeTokenIntoDocument(document, path, enriched);
  }

  return { document, warnings };
};

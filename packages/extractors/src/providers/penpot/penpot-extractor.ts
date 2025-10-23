import type { DesignTokenInterchangeFormat } from '@dtifx/core';

const DEFAULT_PENPOT_BASE_URL = 'https://design.penpot.app/api/rest/';
const PENPOT_EXTENSION_NAMESPACE = 'net.lapidist.sources.penpot';

interface PenpotColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

interface PenpotColorStyle {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly color?: PenpotColor;
}

interface PenpotGradientStop {
  readonly position: number;
  readonly color?: PenpotColor;
}

interface PenpotGradientStyle {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly kind: 'linear' | 'radial' | (string & Record<never, never>);
  readonly angle?: number;
  readonly stops?: readonly PenpotGradientStop[];
}

interface PenpotTypographyStyle {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly paragraphSpacing?: number;
  readonly textCase?: string;
  readonly textDecoration?: string;
  readonly color?: PenpotColor;
}

interface PenpotStylesResponse {
  readonly colors?: readonly PenpotColorStyle[];
  readonly gradients?: readonly PenpotGradientStyle[];
  readonly typography?: readonly PenpotTypographyStyle[];
}

interface PenpotClient {
  readonly baseUrl: string;
  readonly fetch: typeof fetch;
  readonly accessToken: string;
  getStyles(fileId: string): Promise<PenpotStylesResponse>;
}

export interface PenpotExtractionWarning {
  readonly code:
    | 'missing-color-value'
    | 'missing-gradient-stop'
    | 'unsupported-gradient-type'
    | 'missing-typography-value';
  readonly message: string;
  readonly styleId?: string;
  readonly styleName?: string;
}

export interface PenpotExtractorOptions {
  readonly fileId: string;
  readonly accessToken: string;
  readonly apiBaseUrl?: string;
  readonly fetch?: typeof fetch;
}

export interface PenpotExtractResult {
  readonly document: DesignTokenInterchangeFormat;
  readonly warnings: readonly PenpotExtractionWarning[];
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

const convertPenpotColor = (color: PenpotColor | undefined): JsonObject | undefined => {
  if (!color) {
    return undefined;
  }
  const components = [color.r, color.g, color.b].map((component) =>
    roundToPrecision(clamp01(component)),
  ) as [number, number, number];
  const alpha = clamp01(color.a ?? 1);
  const hex = `#${components.map((component) => convertComponentToHex(component)).join('')}`;
  return {
    colorSpace: 'srgb',
    components,
    hex,
    ...(alpha < 1 ? { alpha: roundToPrecision(alpha) } : {}),
  } satisfies JsonObject;
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
      [PENPOT_EXTENSION_NAMESPACE]: {
        id: context.style.id,
        name: context.style.name,
      },
    },
  } satisfies JsonObject;
  return { ...token, ...metadata } satisfies JsonObject;
};

const createPenpotClient = ({
  accessToken,
  apiBaseUrl = DEFAULT_PENPOT_BASE_URL,
  fetchImpl = fetch,
}: {
  readonly accessToken: string;
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}): PenpotClient => {
  const baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`;

  const requestJson = async (path: string): Promise<unknown> => {
    const url = new URL(path.replace(/^\//, ''), baseUrl);
    const response = await fetchImpl(url.href, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const reason = `${response.status} ${response.statusText}`.trim();
      throw new Error(`Penpot request for ${url.pathname} failed: ${reason}`);
    }

    return response.json();
  };

  return {
    baseUrl,
    fetch: fetchImpl,
    accessToken,
    async getStyles(fileId: string): Promise<PenpotStylesResponse> {
      const payload = await requestJson(`/design/files/${fileId}/styles`);
      if (!isPlainObject(payload)) {
        throw new TypeError('Penpot styles response was not an object.');
      }
      const { colors, gradients, typography } = payload as PenpotStylesResponse;
      return {
        ...(Array.isArray(colors) ? { colors } : {}),
        ...(Array.isArray(gradients) ? { gradients } : {}),
        ...(Array.isArray(typography) ? { typography } : {}),
      };
    },
  } satisfies PenpotClient;
};

const createColorToken = (
  style: PenpotColorStyle,
  warnings: PenpotExtractionWarning[],
): JsonObject | undefined => {
  const value = convertPenpotColor(style.color);
  if (!value) {
    warnings.push({
      code: 'missing-color-value',
      message: `Penpot color style "${style.name}" is missing a value.`,
      styleId: style.id,
      styleName: style.name,
    });
    return undefined;
  }
  return {
    $type: 'color',
    $value: value,
  } satisfies JsonObject;
};

const createGradientToken = (
  style: PenpotGradientStyle,
  warnings: PenpotExtractionWarning[],
): JsonObject | undefined => {
  const stops = Array.isArray(style.stops) ? style.stops : [];
  const isSupportedType = style.kind === 'linear' || style.kind === 'radial';
  if (!isSupportedType) {
    warnings.push({
      code: 'unsupported-gradient-type',
      message: `Penpot gradient "${style.name}" has unsupported type "${style.kind}".`,
      styleId: style.id,
      styleName: style.name,
    });
  }
  const convertedStops: JsonObject[] = [];
  for (const stop of stops) {
    const color = convertPenpotColor(stop.color);
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
      message: `Penpot gradient "${style.name}" does not define valid color stops.`,
      styleId: style.id,
      styleName: style.name,
    });
  }

  if (!isSupportedType || convertedStops.length === 0) {
    return undefined;
  }

  return {
    $type: 'gradient',
    $value: {
      gradientType: style.kind,
      ...(typeof style.angle === 'number' ? { angle: roundToPrecision(style.angle) } : {}),
      stops: convertedStops,
    },
  } satisfies JsonObject;
};

const mapTextCase = (
  value: PenpotTypographyStyle['textCase'],
): 'uppercase' | 'lowercase' | 'title' | 'small-caps' | undefined => {
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
  value: PenpotTypographyStyle['textDecoration'],
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
  style: PenpotTypographyStyle,
  warnings: PenpotExtractionWarning[],
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
  const color = convertPenpotColor(style.color);
  if (color) {
    value['color'] = color;
  }
  if (Object.keys(value).length === 0) {
    warnings.push({
      code: 'missing-typography-value',
      message: `Penpot typography style "${style.name}" does not define any properties.`,
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

export const extractPenpotTokens = async ({
  fileId,
  accessToken,
  apiBaseUrl,
  fetch: fetchImpl,
}: PenpotExtractorOptions): Promise<PenpotExtractResult> => {
  const client = createPenpotClient({
    accessToken,
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const warnings: PenpotExtractionWarning[] = [];
  const document: MutableTokenDocument = {
    $schema: 'https://dtif.lapidist.net/schema/core.json',
    $version: '1.0.0',
  } as MutableTokenDocument;

  const payload = await client.getStyles(fileId);

  for (const style of payload.colors ?? []) {
    const token = createColorToken(style, warnings);
    if (!token) {
      continue;
    }
    const path = normaliseStylePath(style.name, 'color');
    mergeTokenIntoDocument(document, path, enrichTokenMetadata(token, { style }));
  }

  for (const gradient of payload.gradients ?? []) {
    const token = createGradientToken(gradient, warnings);
    if (!token) {
      continue;
    }
    const path = normaliseStylePath(gradient.name, 'gradient');
    mergeTokenIntoDocument(document, path, enrichTokenMetadata(token, { style: gradient }));
  }

  for (const style of payload.typography ?? []) {
    const token = createTypographyToken(style, warnings);
    if (!token) {
      continue;
    }
    const path = normaliseStylePath(style.name, 'typography');
    mergeTokenIntoDocument(document, path, enrichTokenMetadata(token, { style }));
  }

  return { document, warnings } satisfies PenpotExtractResult;
};

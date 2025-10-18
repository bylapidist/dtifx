export type RgbComponentArray = readonly [number, number, number, ...number[]];

export interface ColorValue {
  readonly colorSpace: string;
  readonly components: RgbComponentArray;
  readonly alpha?: number;
  readonly hex?: string;
}

export interface ColorCssMetadata {
  readonly srgbHex: string;
  readonly oklch: {
    readonly l: number;
    readonly c: number;
    readonly h: number;
    readonly css: string;
  };
  readonly relativeLuminance: number;
}

const SUPPORTED_COLOR_SPACES = new Set(['srgb', 'oklch', 'oklab']);

/**
 * Attempts to coerce unknown input into a strongly typed {@link ColorValue} structure.
 * @param {unknown} input - Raw token value that may describe a color.
 * @returns {ColorValue | undefined} The structured color value when supported fields are present.
 */
export function parseColorValue(input: unknown): ColorValue | undefined {
  if (Object(input) === input) {
    const candidate = input as Partial<ColorValue> & { readonly components?: unknown };
    const hasColorSpace =
      typeof candidate.colorSpace === 'string' && candidate.colorSpace.length > 0;
    if (hasColorSpace && isNumberArray(candidate.components) && candidate.components.length >= 3) {
      const [red, green, blue, ...remainder] = candidate.components;
      const components = [red, green, blue, ...remainder] as RgbComponentArray;
      return {
        colorSpace: candidate.colorSpace,
        components,
        ...(typeof candidate.alpha === 'number' ? { alpha: candidate.alpha } : {}),
        ...(typeof candidate.hex === 'string' ? { hex: candidate.hex } : {}),
      } satisfies ColorValue;
    }
  }
  return undefined;
}

/**
 * Normalises the provided color token into CSS-ready luminance and OKLCH metadata.
 * @param {ColorValue} value - Parsed color token data.
 * @returns {ColorCssMetadata} A payload containing CSS serialisations and derived luminance metrics.
 */
export function toColorCssOutput(value: ColorValue): ColorCssMetadata {
  const srgbValue = normaliseColorValueToSrgb(value);
  const maybeAlpha = srgbValue.components[3];
  let alpha: number | undefined;
  if (typeof srgbValue.alpha === 'number') {
    alpha = srgbValue.alpha;
  } else if (typeof maybeAlpha === 'number') {
    alpha = maybeAlpha;
  }

  const srgbHex = srgbValue.hex ?? componentsToHex(srgbValue.components, alpha);
  const oklch = toOklch(srgbValue.components);
  const alphaSegment = alpha === undefined ? '' : ` / ${alpha.toFixed(4)}`;
  const css = `oklch(${oklch.l.toFixed(4)} ${oklch.c.toFixed(4)} ${oklch.h.toFixed(4)}${alphaSegment})`;
  const luminance = relativeLuminance(srgbValue.components);

  return {
    srgbHex,
    oklch: {
      ...oklch,
      css,
    },
    relativeLuminance: luminance,
  } satisfies ColorCssMetadata;
}

/**
 * Normalises supported DTIF color spaces into sRGB component payloads.
 * @param {ColorValue} value - Parsed color token data.
 * @returns {ColorValue} A color value expressed in the sRGB color space.
 * @throws {TypeError} When the provided color space cannot be converted to sRGB.
 */
export function normaliseColorValueToSrgb(value: ColorValue): ColorValue {
  if (!SUPPORTED_COLOR_SPACES.has(value.colorSpace)) {
    throw new TypeError(`Unsupported color space: ${value.colorSpace}`);
  }

  if (value.colorSpace === 'srgb') {
    return value;
  }

  const alphaComponent = extractAlphaComponent(value);
  const components =
    value.colorSpace === 'oklch'
      ? oklchToSrgb(value.components[0], value.components[1], value.components[2])
      : oklabToSrgb(value.components[0], value.components[1], value.components[2]);

  const srgbComponents =
    alphaComponent === undefined
      ? components
      : ([...components, alphaComponent] as RgbComponentArray);

  return {
    colorSpace: 'srgb',
    components: srgbComponents,
    ...(typeof value.alpha === 'number' ? { alpha: value.alpha } : {}),
  } satisfies ColorValue;
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((component) => typeof component === 'number');
}

function componentsToHex(components: RgbComponentArray, alpha?: number): string {
  const [red, green, blue] = components;
  const r = Math.round(normaliseComponent(red) * 255);
  const g = Math.round(normaliseComponent(green) * 255);
  const b = Math.round(normaliseComponent(blue) * 255);
  const alphaComponent =
    typeof alpha === 'number' ? Math.round(normaliseComponent(alpha) * 255) : undefined;
  const base = `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
  return alphaComponent === undefined ? base : `${base}${componentToHex(alphaComponent)}`;
}

function normaliseComponent(value: number): number {
  if (Number.isNaN(value) || Number.isFinite(value) === false) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function componentToHex(component: number): string {
  return component.toString(16).padStart(2, '0');
}

function linearToSrgb(component: number): number {
  if (Number.isNaN(component) || Number.isFinite(component) === false) {
    return 0;
  }
  if (component <= 3.1308e-3) {
    return 12.92 * Math.max(0, component);
  }
  return 1.055 * Math.pow(component, 1 / 2.4) - 0.055;
}

function toLinear(component: number): number {
  const value = normaliseComponent(component);
  const threshold = 4.045e-2;
  const offset = 5.5e-2;
  return value <= threshold ? value / 12.92 : ((value + offset) / 1.055) ** 2.4;
}

function oklchToSrgb(l: number, c: number, h: number): RgbComponentArray {
  const hueRadians = (h * Math.PI) / 180;
  const a = Math.cos(hueRadians) * c;
  const b = Math.sin(hueRadians) * c;
  return oklabToSrgb(l, a, b);
}

function oklabToSrgb(l: number, a: number, b: number): RgbComponentArray {
  const lPrime = l + Number.parseFloat('0.3963377774') * a + Number.parseFloat('0.2158037573') * b;
  const mPrime = l - Number.parseFloat('0.1055613458') * a - Number.parseFloat('0.0638541728') * b;
  const sPrime = l - Number.parseFloat('0.0894841775') * a - Number.parseFloat('1.291485548') * b;

  const lCubed = lPrime ** 3;
  const mCubed = mPrime ** 3;
  const sCubed = sPrime ** 3;

  const redLinear =
    Number.parseFloat('4.0767416621') * lCubed -
    Number.parseFloat('3.3077115913') * mCubed +
    Number.parseFloat('0.2309699292') * sCubed;
  const greenLinear =
    Number.parseFloat('-1.2684380046') * lCubed +
    Number.parseFloat('2.6097574011') * mCubed -
    Number.parseFloat('0.3413193965') * sCubed;
  const blueLinear =
    Number.parseFloat('-0.0041960863') * lCubed -
    Number.parseFloat('0.7034186147') * mCubed +
    Number.parseFloat('1.707614701') * sCubed;

  const red = clampSrgbComponent(linearToSrgb(redLinear));
  const green = clampSrgbComponent(linearToSrgb(greenLinear));
  const blue = clampSrgbComponent(linearToSrgb(blueLinear));

  return [red, green, blue] as RgbComponentArray;
}

function clampSrgbComponent(component: number): number {
  if (Number.isNaN(component) || Number.isFinite(component) === false) {
    return 0;
  }
  if (component < 0) {
    return 0;
  }
  if (component > 1) {
    return 1;
  }
  return Math.round(component * 1_000_000) / 1_000_000;
}

function extractAlphaComponent(value: ColorValue): number | undefined {
  if (typeof value.alpha === 'number') {
    return value.alpha;
  }
  const componentAlpha = value.components[3];
  if (typeof componentAlpha === 'number') {
    return componentAlpha;
  }
  return undefined;
}

function relativeLuminance(components: RgbComponentArray): number {
  const [red, green, blue] = components;
  const r = toLinear(red);
  const g = toLinear(green);
  const b = toLinear(blue);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return Math.round(luminance * 1_000_000) / 1_000_000;
}

function toOklch(components: RgbComponentArray): {
  readonly l: number;
  readonly c: number;
  readonly h: number;
} {
  const [red, green, blue] = components;
  const r = toLinear(red);
  const g = toLinear(green);
  const b = toLinear(blue);
  const l = 0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b;
  const m = 0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b;
  const s = 0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  const L = 0.210_454_255_3 * lRoot + 0.793_617_785 * mRoot - 0.004_072_046_8 * sRoot;
  const a = 1.977_998_495_1 * lRoot - 2.428_592_205 * mRoot + 0.450_593_709_9 * sRoot;
  const bLab = 0.025_904_037_1 * lRoot + 0.782_771_766_2 * mRoot - 0.808_675_766 * sRoot;

  const C = Math.hypot(a, bLab);
  const H = (Math.atan2(bLab, a) * (180 / Math.PI) + 360) % 360;

  return {
    l: Math.round(L * 1_000_000) / 1_000_000,
    c: Math.round(C * 1_000_000) / 1_000_000,
    h: Math.round(H * 1_000_000) / 1_000_000,
  };
}

/**
 * Computes the relative luminance for the provided color value.
 * @param {ColorValue} value - Structured color value.
 * @returns {number} Relative luminance value between 0 and 1.
 */
export function computeRelativeLuminance(value: ColorValue): number {
  return relativeLuminance(value.components);
}

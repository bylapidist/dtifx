import type { JsonValue } from '@lapidist/dtif-parser';

export type RgbComponentArray = readonly [number, number, number, ...number[]];

export interface ReferenceValue {
  readonly $ref: string;
}

export interface ValueWrapper<TValue> {
  readonly $value?: TValue;
  readonly value?: TValue;
  readonly $resolved?: TValue;
  readonly resolved?: TValue;
  readonly $ref?: string;
  readonly ref?: string;
}

export interface FunctionValue {
  readonly fn: string;
  readonly parameters?: readonly FunctionParameter[];
}

export type FunctionParameter =
  | string
  | number
  | boolean
  | null
  | ReferenceValue
  | FunctionValue
  | readonly FunctionParameter[]
  | Record<string, unknown>;

export type ResolvableValue<TValue> = TValue | ReferenceValue | ValueWrapper<TValue>;

export type ComputedValue<TValue> = ResolvableValue<TValue> | FunctionValue;

export interface ColorValue {
  readonly colorSpace: string;
  readonly components: RgbComponentArray;
  readonly alpha?: number;
  readonly hex?: string;
}

export type DimensionKind =
  | 'length'
  | 'angle'
  | 'resolution'
  | 'custom'
  | (string & Record<never, never>);

export interface DimensionValue {
  readonly unit: string;
  readonly value: number;
  readonly dimensionType: DimensionKind;
  readonly fontScale?: boolean;
}

export interface FontDimensionValue extends DimensionValue {}

export type DimensionToken = number | string | ComputedValue<DimensionValue>;

export type FontDimensionToken = number | string | ComputedValue<FontDimensionValue>;

export type ColorToken = ComputedValue<ColorValue>;

export interface FontValue {
  readonly fontType: string;
  readonly family: string;
  readonly fallbacks?: readonly string[];
  readonly style?: string;
  readonly weight?: number | string;
  readonly stretch?: string;
  readonly variant?: string;
}

export type TypographyFontFamily = string | ResolvableValue<FontValue>;

export interface TypographyValue {
  readonly typographyType?: string;
  readonly fontFamily?: TypographyFontFamily;
  readonly fontWeight?: number | string;
  readonly fontStyle?: string;
  readonly fontVariant?: string;
  readonly fontStretch?: string;
  readonly fontSize?: FontDimensionToken;
  readonly lineHeight?: number | FontDimensionToken;
  readonly letterSpacing?: FontDimensionToken | 'normal';
  readonly wordSpacing?: FontDimensionToken | 'normal';
  readonly textDecoration?: string;
  readonly textTransform?: readonly string[];
  readonly paragraphSpacing?: FontDimensionToken;
  readonly textCase?: string;
  readonly color?: ColorToken;
  readonly fontFeatures?: readonly string[];
  readonly underlineThickness?: FontDimensionToken;
  readonly underlineOffset?: FontDimensionToken;
  readonly overlineThickness?: FontDimensionToken;
  readonly overlineOffset?: FontDimensionToken;
}

export interface GradientStopValue {
  readonly position: number | string;
  readonly color: ColorToken;
  readonly hint?: number | string;
}

export interface GradientValue {
  readonly gradientType: 'linear' | 'radial' | 'conic';
  readonly kind?: 'linear' | 'radial' | 'conic';
  readonly angle?: number | string;
  readonly stops: readonly GradientStopValue[];
  readonly center?: { readonly x: number; readonly y: number } | string;
  readonly shape?: 'circle' | 'ellipse';
}

export type BorderStyle =
  | 'none'
  | 'hidden'
  | 'dotted'
  | 'dashed'
  | 'solid'
  | 'double'
  | 'groove'
  | 'ridge'
  | 'inset'
  | 'outset';

export type BorderCornerValue =
  | DimensionToken
  | {
      readonly x?: DimensionToken;
      readonly y?: DimensionToken;
    };

export interface BorderRadiusValue {
  readonly topLeft?: BorderCornerValue;
  readonly topRight?: BorderCornerValue;
  readonly bottomRight?: BorderCornerValue;
  readonly bottomLeft?: BorderCornerValue;
  readonly topStart?: BorderCornerValue;
  readonly topEnd?: BorderCornerValue;
  readonly bottomStart?: BorderCornerValue;
  readonly bottomEnd?: BorderCornerValue;
}

export interface StrokeStyleValue {
  readonly dashArray?: readonly DimensionToken[];
  readonly dashOffset?: DimensionToken;
  readonly lineCap?: 'butt' | 'round' | 'square';
  readonly lineJoin?: 'miter' | 'round' | 'bevel';
  readonly miterLimit?: number;
}

export interface BorderValue {
  readonly borderType?: string;
  readonly width?: DimensionToken | 'thin' | 'medium' | 'thick';
  readonly style?: BorderStyle;
  readonly color?: ColorToken;
  readonly radius?: DimensionToken | BorderRadiusValue;
  readonly strokeStyle?: ResolvableValue<StrokeStyleValue>;
}

export interface ShadowLayerEntry {
  readonly shadowType?: string;
  readonly offsetX?: DimensionToken;
  readonly offsetY?: DimensionToken;
  readonly x?: DimensionToken;
  readonly y?: DimensionToken;
  readonly horizontal?: DimensionToken;
  readonly vertical?: DimensionToken;
  readonly blur?: DimensionToken;
  readonly radius?: DimensionToken;
  readonly spread?: DimensionToken;
  readonly opacity?: number;
  readonly color?: ColorToken;
}

export interface ShadowTokenValue extends ShadowLayerEntry {
  readonly layers?: readonly ShadowLayerEntry[];
}

export interface CursorValue {
  readonly cursorType: string;
  readonly value: string | Record<string, unknown>;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface OpacityValue {
  readonly opacityType: string;
  readonly value: number | string;
}

export interface DurationValue {
  readonly durationType: string;
  readonly value: number;
  readonly unit: string;
}

export interface EasingValue {
  readonly easingFunction: string;
  readonly parameters?: readonly (number | string)[];
}

export interface FilterOperation {
  readonly fn: string;
  readonly parameters?: readonly FunctionParameter[];
}

export interface FilterValue {
  readonly filterType: string;
  readonly operations: readonly FilterOperation[];
}

export type MotionLengthValue = DimensionToken;

export interface MotionOrigin {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
}

export interface MotionAxis {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
}

export interface MotionTranslationParameters {
  readonly x?: MotionLengthValue;
  readonly y?: MotionLengthValue;
  readonly z?: MotionLengthValue;
  readonly origin?: MotionOrigin;
}

export interface MotionRotationParameters {
  readonly angle: number | string | FunctionValue;
  readonly axis?: MotionAxis;
  readonly origin?: MotionOrigin;
}

export interface MotionScaleParameters {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly uniform?: number;
  readonly origin?: MotionOrigin;
}

export interface MotionPathPosition {
  readonly x?: MotionLengthValue;
  readonly y?: MotionLengthValue;
  readonly z?: MotionLengthValue;
}

export interface MotionPathPoint {
  readonly time: number;
  readonly position: MotionPathPosition;
  readonly easing?: string;
}

export interface MotionPathParameters {
  readonly points: readonly MotionPathPoint[];
}

export type MotionParameters =
  | MotionTranslationParameters
  | MotionRotationParameters
  | MotionScaleParameters
  | MotionPathParameters
  | Readonly<Record<string, unknown>>;

export interface MotionValue {
  readonly motionType: string;
  readonly parameters: MotionParameters;
}

export interface ElevationValue {
  readonly elevationType: string;
  readonly offset: MotionLengthValue;
  readonly blur: MotionLengthValue;
  readonly color: ColorToken;
}

export interface ComponentValue {
  readonly $slots: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export type LineHeightValue = number | FontDimensionToken;

export type FontFaceSource =
  | {
      readonly url: string;
      readonly format?: string | readonly string[];
      readonly tech?: readonly string[];
    }
  | {
      readonly local: string;
    };

export interface FontFaceValue {
  readonly src: readonly FontFaceSource[];
  readonly fontFamily: string;
  readonly fontWeight?: number | string;
  readonly fontStyle?: string;
  readonly fontStretch?: string;
  readonly unicodeRange?: string;
  readonly fontDisplay?: string;
}

export interface ZIndexValue {
  readonly zIndexType: string;
  readonly value: number;
}

export interface TokenTypeValueMap {
  readonly border: BorderValue;
  readonly color: ColorValue;
  readonly component: ComponentValue;
  readonly cursor: CursorValue;
  readonly dimension: DimensionValue;
  readonly duration: DurationValue;
  readonly easing: EasingValue;
  readonly elevation: ElevationValue;
  readonly filter: FilterValue;
  readonly font: FontValue;
  readonly fontFace: FontFaceValue;
  readonly gradient: GradientValue;
  readonly 'line-height': LineHeightValue;
  readonly motion: MotionValue;
  readonly opacity: OpacityValue;
  readonly shadow: ShadowTokenValue;
  readonly strokeStyle: StrokeStyleValue;
  readonly typography: TypographyValue;
  readonly 'z-index': ZIndexValue;
}

export type TokenTypeIdentifier = keyof TokenTypeValueMap;

const TOKEN_TYPE_IDENTIFIERS: readonly TokenTypeIdentifier[] = [
  'border',
  'color',
  'component',
  'cursor',
  'dimension',
  'duration',
  'easing',
  'elevation',
  'filter',
  'font',
  'fontFace',
  'gradient',
  'line-height',
  'motion',
  'opacity',
  'shadow',
  'strokeStyle',
  'typography',
  'z-index',
] as const;

/**
 * Determines whether a string represents a supported design token type identifier.
 * @param {string} value - The string value to test.
 * @returns {boolean} `true` when the value matches a known token type identifier.
 */
export function isTokenTypeIdentifier(value: string): value is TokenTypeIdentifier {
  return (TOKEN_TYPE_IDENTIFIERS as readonly string[]).includes(value);
}

/* prettier-ignore */
export type TokenTypeValue<TType extends TokenTypeIdentifier | undefined> = TType extends TokenTypeIdentifier ? TokenTypeValueMap[TType] : JsonValue;

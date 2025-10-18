export type TokenTypeIdentifier =
  | 'border'
  | 'color'
  | 'component'
  | 'cursor'
  | 'dimension'
  | 'duration'
  | 'easing'
  | 'elevation'
  | 'filter'
  | 'font'
  | 'fontFace'
  | 'gradient'
  | 'line-height'
  | 'motion'
  | 'opacity'
  | 'shadow'
  | 'strokeStyle'
  | 'typography'
  | 'z-index';

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

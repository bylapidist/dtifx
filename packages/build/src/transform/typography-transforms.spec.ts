import { describe, expect, it } from 'vitest';

import type { TokenSnapshot } from '../session/resolution-session.js';
import {
  typographyToCssTransform,
  typographyToAndroidComposeTransform,
  typographyToAndroidMaterialTransform,
  typographyToSwiftUiTransform,
} from './typography-transforms.js';

function createSnapshot(pointer: string): TokenSnapshot {
  return { pointer } as unknown as TokenSnapshot;
}

function createFontDimensionReference(
  value: number,
  pointer: string,
  options?: { readonly fontScale?: boolean },
): unknown {
  const fontScale = options?.fontScale ?? true;
  return {
    $ref: pointer,
    fontDimensionReference: {
      pointer,
      value: {
        unit: 'pixel',
        value,
        dimensionType: 'length',
        fontScale,
      },
    },
  };
}

function createFontDimensionReferenceWithoutFontScale(value: number, pointer: string): unknown {
  return {
    $ref: pointer,
    fontDimensionReference: {
      pointer,
      value: {
        unit: 'pixel',
        value,
        dimensionType: 'length',
      },
    },
  };
}

interface TypographyFixture {
  readonly pointer: string;
  readonly value: unknown;
}

const computedTypographyFixtures = {
  computed: {
    pointer: '/typography/body/computed',
    value: {
      fontSize: {
        fn: 'clamp',
        parameters: [
          {
            $ref: '#/dimension/typography/fontSize/min',
            $resolved: {
              unit: 'rem',
              value: 1,
              dimensionType: 'length',
              fontScale: true,
            },
          },
          {
            $ref: '#/dimension/typography/fontSize/preferred',
            $resolved: {
              unit: 'rem',
              value: 1.125,
              dimensionType: 'length',
              fontScale: true,
            },
          },
          {
            $ref: '#/dimension/typography/fontSize/max',
            $resolved: {
              unit: 'rem',
              value: 1.5,
              dimensionType: 'length',
              fontScale: true,
            },
          },
        ],
        $resolved: {
          unit: 'rem',
          value: 1.125,
          dimensionType: 'length',
          fontScale: true,
        },
        fontScale: true,
      },
      lineHeight: {
        fn: 'calc',
        parameters: [
          {
            $ref: '#/dimension/typography/lineHeight/base',
            $resolved: {
              unit: 'pixel',
              value: 20,
              dimensionType: 'length',
              fontScale: true,
            },
          },
          {
            $ref: '#/dimension/typography/lineHeight/offset',
            value: {
              fn: 'calc',
              parameters: [
                {
                  $ref: '#/dimension/typography/lineHeight/offset/a',
                  $resolved: {
                    unit: 'pixel',
                    value: 2,
                    dimensionType: 'length',
                    fontScale: true,
                  },
                },
                {
                  $ref: '#/dimension/typography/lineHeight/offset/b',
                  $resolved: {
                    unit: 'pixel',
                    value: 2,
                    dimensionType: 'length',
                    fontScale: true,
                  },
                },
              ],
              $resolved: {
                unit: 'pixel',
                value: 4,
                dimensionType: 'length',
                fontScale: true,
              },
              fontScale: true,
            },
          },
        ],
        $resolved: {
          unit: 'pixel',
          value: 24,
          dimensionType: 'length',
          fontScale: true,
        },
        fontScale: true,
      },
      letterSpacing: {
        fontDimensionReference: {
          pointer: '#/dimension/typography/letterSpacing/computed',
          value: {
            fn: 'calc',
            parameters: [
              {
                $ref: '#/dimension/typography/letterSpacing/base',
                $resolved: {
                  unit: 'pixel',
                  value: 1,
                  dimensionType: 'length',
                  fontScale: true,
                },
              },
              {
                $ref: '#/dimension/typography/letterSpacing/offset',
                value: {
                  fn: 'calc',
                  parameters: [
                    {
                      $ref: '#/dimension/typography/letterSpacing/offset/a',
                      $resolved: {
                        unit: 'pixel',
                        value: -0.25,
                        dimensionType: 'length',
                        fontScale: true,
                      },
                    },
                    {
                      $ref: '#/dimension/typography/letterSpacing/offset/b',
                      $resolved: {
                        unit: 'pixel',
                        value: -0.25,
                        dimensionType: 'length',
                        fontScale: true,
                      },
                    },
                  ],
                  $resolved: {
                    unit: 'pixel',
                    value: -0.5,
                    dimensionType: 'length',
                    fontScale: true,
                  },
                  fontScale: true,
                },
              },
            ],
            $resolved: {
              unit: 'pixel',
              value: 0.5,
              dimensionType: 'length',
              fontScale: true,
            },
            fontScale: true,
          },
        },
      },
      paragraphSpacing: {
        fontDimensionReference: {
          pointer: '#/dimension/typography/paragraphSpacing/computed',
          value: {
            fn: 'clamp',
            parameters: [
              {
                $ref: '#/dimension/typography/paragraphSpacing/min',
                $resolved: {
                  unit: 'pixel',
                  value: 8,
                  dimensionType: 'length',
                  fontScale: false,
                },
              },
              {
                $ref: '#/dimension/typography/paragraphSpacing/preferred',
                value: {
                  $resolved: {
                    unit: 'pixel',
                    value: 12,
                    dimensionType: 'length',
                    fontScale: false,
                  },
                },
              },
              {
                $ref: '#/dimension/typography/paragraphSpacing/max',
                $resolved: {
                  unit: 'pixel',
                  value: 16,
                  dimensionType: 'length',
                  fontScale: false,
                },
              },
            ],
            $resolved: {
              unit: 'pixel',
              value: 12,
              dimensionType: 'length',
              fontScale: false,
            },
            fontScale: false,
          },
        },
      },
    },
  },
} as const satisfies Record<string, TypographyFixture>;

const unsupportedFunctionTypographyFixture = {
  pointer: '/typography/body/unsupported-functions',
  value: {
    fontSize: {
      fn: 'min',
      value: 'min(1rem, 2vw)',
    },
  },
} as const satisfies TypographyFixture;

type TypographyTransformInput = Parameters<typeof typographyToCssTransform.run>[0];

function runTypographyTransformWithFixture<T>(
  transform: { run: (input: TypographyTransformInput) => T },
  fixture: TypographyFixture,
): T {
  const snapshot = createSnapshot(fixture.pointer);
  return transform.run({
    snapshot,
    pointer: snapshot.pointer,
    type: 'typography',
    value: fixture.value,
  });
}

describe('typographyToCssTransform', () => {
  it('serialises dimension references to CSS strings', () => {
    const snapshot = createSnapshot('/typography/body/css');
    const result = typographyToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        fontFamily: 'Inter',
        fontWeight: 600,
        fontSize: createFontDimensionReference(16, '/dimension/typography/fontSize'),
        lineHeight: createFontDimensionReference(24, '/dimension/typography/lineHeight'),
        letterSpacing: createFontDimensionReference(0.5, '/dimension/typography/letterSpacing'),
        paragraphSpacing: { unit: 'pixel', value: 12, dimensionType: 'length' },
        textTransform: 'uppercase',
      },
    });
    expect(result).toStrictEqual({
      fontFamily: 'Inter',
      fontWeight: '600',
      fontSize: '16px',
      lineHeight: '24px',
      letterSpacing: '0.5px',
      paragraphSpacing: '12px',
      textTransform: 'uppercase',
    });
  });

  it('supports inline dimension literals', () => {
    const snapshot = createSnapshot('/typography/heading/css');
    const result = typographyToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        fontSize: '18px',
        lineHeight: '150%',
        letterSpacing: 0.25,
      },
    });

    expect(result).toStrictEqual({
      fontSize: '18px',
      lineHeight: '150%',
      letterSpacing: '0.25px',
    });
  });
});

describe('typography transform integration with computed tokens', () => {
  it('evaluates calc and clamp expressions across supported targets', () => {
    const css = runTypographyTransformWithFixture(
      typographyToCssTransform,
      computedTypographyFixtures.computed,
    );
    expect(css).toStrictEqual({
      fontSize: '18px',
      lineHeight: '24px',
      letterSpacing: '0.5px',
      paragraphSpacing: '12px',
    });

    const swift = runTypographyTransformWithFixture(
      typographyToSwiftUiTransform,
      computedTypographyFixtures.computed,
    );
    expect(swift).toStrictEqual({
      fontSize: { points: 18, literal: '18.0' },
      lineHeight: { points: 24, literal: '24.0' },
      letterSpacing: { points: 0.5, literal: '0.5' },
      paragraphSpacing: { points: 12, literal: '12.0' },
    });

    const android = runTypographyTransformWithFixture(
      typographyToAndroidMaterialTransform,
      computedTypographyFixtures.computed,
    );
    expect(android).toStrictEqual({
      fontSize: { sp: 18, literal: '18sp' },
      lineHeight: { sp: 24, literal: '24sp' },
      letterSpacing: { sp: 0.5, literal: '0.5sp' },
      paragraphSpacing: { dp: 12, literal: '12dp' },
    });

    const compose = runTypographyTransformWithFixture(
      typographyToAndroidComposeTransform,
      computedTypographyFixtures.computed,
    );
    expect(compose).toStrictEqual({
      fontSize: { sp: 18, literal: '18sp' },
      lineHeight: { sp: 24, literal: '24sp' },
      letterSpacing: { sp: 0.5, literal: '0.5sp' },
      paragraphSpacing: { dp: 12, literal: '12dp' },
    });
  });

  it('leaves unsupported function payloads untouched', () => {
    const css = runTypographyTransformWithFixture(
      typographyToCssTransform,
      unsupportedFunctionTypographyFixture,
    );
    expect(css).toStrictEqual({ fontSize: 'min(1rem, 2vw)' });

    expect(
      runTypographyTransformWithFixture(
        typographyToSwiftUiTransform,
        unsupportedFunctionTypographyFixture,
      ),
    ).toBeUndefined();
    expect(
      runTypographyTransformWithFixture(
        typographyToAndroidMaterialTransform,
        unsupportedFunctionTypographyFixture,
      ),
    ).toBeUndefined();
  });
});

describe('typographyToSwiftUiTransform', () => {
  it('normalises typography values into SwiftUI metadata', () => {
    const snapshot = createSnapshot('/typography/body');
    const result = typographyToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        fontFamily: 'Inter',
        fontWeight: 600,
        fontSize: '16px',
        lineHeight: '24px',
        letterSpacing: '0.5px',
        paragraphSpacing: { unit: 'pixel', value: 12, dimensionType: 'length' },
        textCase: 'uppercase',
        textTransform: 'capitalize',
      },
    });

    expect(result).toStrictEqual({
      fontFamily: 'Inter',
      fontWeight: '600',
      fontSize: { points: 16, literal: '16.0' },
      lineHeight: { points: 24, literal: '24.0' },
      letterSpacing: { points: 0.5, literal: '0.5' },
      paragraphSpacing: { points: 12, literal: '12.0' },
      textCase: 'uppercase',
      textTransform: 'capitalize',
    });
  });

  it('resolves referenced typography dimensions into SwiftUI metadata', () => {
    const snapshot = createSnapshot('/typography/body/reference');
    const result = typographyToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        fontSize: createFontDimensionReference(16, '/dimension/typography/fontSize'),
        lineHeight: createFontDimensionReference(24, '/dimension/typography/lineHeight'),
        letterSpacing: createFontDimensionReference(0.5, '/dimension/typography/letterSpacing'),
        paragraphSpacing: createFontDimensionReference(
          12,
          '/dimension/typography/paragraphSpacing',
          { fontScale: false },
        ),
      },
    });

    expect(result).toStrictEqual({
      fontSize: { points: 16, literal: '16.0' },
      lineHeight: { points: 24, literal: '24.0' },
      letterSpacing: { points: 0.5, literal: '0.5' },
      paragraphSpacing: { points: 12, literal: '12.0' },
    });
  });

  it('supports percentage and unitless line heights', () => {
    const snapshot = createSnapshot('/typography/heading');
    const percent = typographyToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        lineHeight: '150%',
      },
    });

    expect(percent).toStrictEqual({ lineHeight: { multiplier: 1.5, literal: '1.5' } });

    const multiplier = typographyToSwiftUiTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        lineHeight: '1.25',
      },
    });

    expect(multiplier).toStrictEqual({ lineHeight: { multiplier: 1.25, literal: '1.25' } });
  });

  it('returns undefined when no supported properties are present', () => {
    const snapshot = createSnapshot('/typography/empty');

    expect(
      typographyToSwiftUiTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'typography',
        value: {},
      }),
    ).toBeUndefined();
  });
});

describe('typographyToAndroidMaterialTransform', () => {
  it('normalises typography values into Android metadata', () => {
    const snapshot = createSnapshot('/typography/body/android');
    const result = typographyToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        fontFamily: 'Inter',
        fontWeight: 500,
        fontSize: '16px',
        lineHeight: '24px',
        letterSpacing: '0.5px',
        paragraphSpacing: { unit: 'pixel', value: 12, dimensionType: 'length' },
        textCase: 'uppercase',
        textTransform: 'capitalize',
      },
    });

    expect(result).toStrictEqual({
      fontFamily: 'Inter',
      fontWeight: '500',
      fontSize: { sp: 16, literal: '16sp' },
      lineHeight: { sp: 24, literal: '24sp' },
      letterSpacing: { sp: 0.5, literal: '0.5sp' },
      paragraphSpacing: { dp: 12, literal: '12dp' },
      textCase: 'uppercase',
      textTransform: 'capitalize',
    });
  });

  it('resolves referenced typography dimensions into Android metadata', () => {
    const snapshot = createSnapshot('/typography/body/android/reference');
    const result = typographyToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        fontSize: createFontDimensionReference(16, '/dimension/typography/fontSize'),
        lineHeight: createFontDimensionReference(20, '/dimension/typography/lineHeight'),
        letterSpacing: createFontDimensionReference(0.25, '/dimension/typography/letterSpacing'),
        paragraphSpacing: createFontDimensionReference(
          12,
          '/dimension/typography/paragraphSpacing',
          { fontScale: false },
        ),
      },
    });

    expect(result).toStrictEqual({
      fontSize: { sp: 16, literal: '16sp' },
      lineHeight: { sp: 20, literal: '20sp' },
      letterSpacing: { sp: 0.25, literal: '0.25sp' },
      paragraphSpacing: { dp: 12, literal: '12dp' },
    });
  });

  it('serialises pixel references without fontScale metadata into Android typography output', () => {
    const snapshot = createSnapshot('/typography/body/android/reference');
    const result = typographyToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        fontSize: createFontDimensionReferenceWithoutFontScale(
          16,
          '/dimension/typography/fontSize',
        ),
        lineHeight: createFontDimensionReferenceWithoutFontScale(
          24,
          '/dimension/typography/lineHeight',
        ),
        letterSpacing: createFontDimensionReferenceWithoutFontScale(
          0.5,
          '/dimension/typography/letterSpacing',
        ),
      },
    });

    expect(result).toStrictEqual({
      fontSize: { sp: 16, literal: '16sp' },
      lineHeight: { sp: 24, literal: '24sp' },
      letterSpacing: { sp: 0.5, literal: '0.5sp' },
    });
  });

  it('supports percentage and unitless line heights', () => {
    const snapshot = createSnapshot('/typography/heading/android');
    const percent = typographyToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        lineHeight: '150%',
      },
    });

    expect(percent).toStrictEqual({ lineHeight: { multiplier: 1.5, literal: '1.5' } });

    const multiplier = typographyToAndroidMaterialTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        lineHeight: '1.25',
      },
    });

    expect(multiplier).toStrictEqual({ lineHeight: { multiplier: 1.25, literal: '1.25' } });
  });

  it('returns undefined when no supported properties are present', () => {
    const snapshot = createSnapshot('/typography/android/empty');

    expect(
      typographyToAndroidMaterialTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'typography',
        value: {},
      }),
    ).toBeUndefined();
  });
});

describe('typographyToAndroidComposeTransform', () => {
  it('shares the Android metadata serialisation for Compose consumers', () => {
    const snapshot = createSnapshot('/typography/body/compose');
    const result = typographyToAndroidComposeTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        fontFamily: 'Inter',
        fontWeight: 500,
        fontSize: '16px',
        lineHeight: '24px',
        letterSpacing: '0.5px',
        paragraphSpacing: { unit: 'pixel', value: 12, dimensionType: 'length' },
        textCase: 'uppercase',
        textTransform: 'capitalize',
      },
    });

    expect(result).toStrictEqual({
      fontFamily: 'Inter',
      fontWeight: '500',
      fontSize: { sp: 16, literal: '16sp' },
      lineHeight: { sp: 24, literal: '24sp' },
      letterSpacing: { sp: 0.5, literal: '0.5sp' },
      paragraphSpacing: { dp: 12, literal: '12dp' },
      textCase: 'uppercase',
      textTransform: 'capitalize',
    });
  });

  it('serialises pixel references without fontScale metadata into Compose typography output', () => {
    const snapshot = createSnapshot('/typography/body/compose');
    const result = typographyToAndroidComposeTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'typography',
      value: {
        fontSize: createFontDimensionReferenceWithoutFontScale(
          16,
          '/dimension/typography/fontSize',
        ),
        lineHeight: createFontDimensionReferenceWithoutFontScale(
          24,
          '/dimension/typography/lineHeight',
        ),
        letterSpacing: createFontDimensionReferenceWithoutFontScale(
          0.5,
          '/dimension/typography/letterSpacing',
        ),
      },
    });

    expect(result).toStrictEqual({
      fontSize: { sp: 16, literal: '16sp' },
      lineHeight: { sp: 24, literal: '24sp' },
      letterSpacing: { sp: 0.5, literal: '0.5sp' },
    });
  });

  it('returns undefined when no supported properties are present', () => {
    const snapshot = createSnapshot('/typography/compose/empty');

    expect(
      typographyToAndroidComposeTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'typography',
        value: {},
      }),
    ).toBeUndefined();
  });
});

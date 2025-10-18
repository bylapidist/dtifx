import { describe, expect, it } from 'vitest';

import {
  dimensionToAndroidDpTransform,
  dimensionToAndroidSpTransform,
  dimensionToPxTransform,
  dimensionToRemTransform,
  dimensionToSwiftUiPointsTransform,
  evaluateDimensionToken,
} from './dimension-transforms.js';
import type { TokenSnapshot } from '../session/resolution-session.js';
import type { FormatterToken } from '../formatter/formatter-registry.js';
import { collectWebVariableDeclarations } from '../infrastructure/formatting/web-variable-helpers.js';

function createSnapshot(pointer: string): TokenSnapshot {
  return { pointer } as unknown as TokenSnapshot;
}

interface DimensionFixture {
  readonly pointer: string;
  readonly value: unknown;
}

const computedDimensionFixtures = {
  calc: {
    pointer: '/dimension/spacing/computed/calc',
    value: {
      fn: 'calc',
      parameters: [
        {
          $ref: '#/dimension/spacing/base',
          $resolved: {
            unit: 'rem',
            value: 1,
            dimensionType: 'length',
          },
        },
        {
          $ref: '#/dimension/spacing/offset',
          $resolved: {
            unit: 'pixel',
            value: 8,
            dimensionType: 'length',
          },
        },
      ],
      $resolved: {
        unit: 'pixel',
        value: 24,
        dimensionType: 'length',
      },
    },
  },
  clamp: {
    pointer: '/dimension/typography/computed/clamp',
    value: {
      fn: 'clamp',
      parameters: [
        {
          $ref: '#/dimension/typography/min',
          $resolved: {
            unit: 'rem',
            value: 1,
            dimensionType: 'length',
            fontScale: true,
          },
        },
        {
          $ref: '#/dimension/typography/preferred',
          $resolved: {
            unit: 'rem',
            value: 1.125,
            dimensionType: 'length',
            fontScale: true,
          },
        },
        {
          $ref: '#/dimension/typography/max',
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
  },
} as const satisfies Record<string, DimensionFixture>;

type DimensionTransformInput = Parameters<typeof dimensionToRemTransform.run>[0];

function runTransformWithFixture<T>(
  transform: { run: (input: DimensionTransformInput) => T },
  fixture: DimensionFixture,
): T {
  const snapshot = createSnapshot(fixture.pointer);
  return transform.run({
    snapshot,
    pointer: snapshot.pointer,
    type: 'dimension',
    value: fixture.value,
  });
}

describe('evaluateDimensionToken', () => {
  it('returns direct dimension values', () => {
    const value = { unit: 'pixel', value: 12, dimensionType: 'length' } as const;

    expect(evaluateDimensionToken(value)).toStrictEqual(value);
  });

  it('prefers parser resolved payloads exposed through wrappers', () => {
    const token = {
      $value: { unit: 'rem', value: 1, dimensionType: 'length' },
      $resolved: { unit: 'pixel', value: 16, dimensionType: 'length', fontScale: true },
      fontScale: true,
    };

    expect(evaluateDimensionToken(token)).toStrictEqual({
      unit: 'pixel',
      value: 16,
      dimensionType: 'length',
      fontScale: true,
    });
  });

  it('resolves function tokens using parser supplied results', () => {
    const token = {
      fn: 'calc',
      parameters: [
        { $resolved: { unit: 'pixel', value: 8, dimensionType: 'length' } },
        { $resolved: { unit: 'pixel', value: 4, dimensionType: 'length' } },
      ],
      $resolved: { unit: 'pixel', value: 12 },
    };

    expect(evaluateDimensionToken(token)).toStrictEqual({
      unit: 'pixel',
      value: 12,
      dimensionType: 'length',
    });
  });

  it('returns undefined for unsupported function payloads', () => {
    const token = {
      fn: 'calc',
      parameters: [{ $value: { unit: 'pixel', value: 8, dimensionType: 'length' } }],
    };

    expect(evaluateDimensionToken(token)).toBeUndefined();
  });
});

describe('dimension transform integration with computed tokens', () => {
  it('converts calc function results across supported transforms', () => {
    expect(
      runTransformWithFixture(dimensionToRemTransform, computedDimensionFixtures.calc),
    ).toStrictEqual({
      rem: 1.5,
      css: '1.5rem',
    });
    expect(
      runTransformWithFixture(dimensionToPxTransform, computedDimensionFixtures.calc),
    ).toStrictEqual({
      px: 24,
      css: '24px',
    });
    expect(
      runTransformWithFixture(dimensionToSwiftUiPointsTransform, computedDimensionFixtures.calc),
    ).toStrictEqual({
      points: 24,
      literal: '24.0',
    });
    expect(
      runTransformWithFixture(dimensionToAndroidDpTransform, computedDimensionFixtures.calc),
    ).toStrictEqual({
      dp: 24,
      literal: '24dp',
    });
    expect(
      runTransformWithFixture(dimensionToAndroidSpTransform, computedDimensionFixtures.calc),
    ).toBeUndefined();
  });

  it('converts clamp function results across supported transforms', () => {
    expect(
      runTransformWithFixture(dimensionToRemTransform, computedDimensionFixtures.clamp),
    ).toStrictEqual({
      rem: 1.125,
      css: '1.125rem',
    });
    expect(
      runTransformWithFixture(dimensionToPxTransform, computedDimensionFixtures.clamp),
    ).toStrictEqual({
      px: 18,
      css: '18px',
    });
    expect(
      runTransformWithFixture(dimensionToSwiftUiPointsTransform, computedDimensionFixtures.clamp),
    ).toStrictEqual({
      points: 18,
      literal: '18.0',
    });
    expect(
      runTransformWithFixture(dimensionToAndroidDpTransform, computedDimensionFixtures.clamp),
    ).toBeUndefined();
    expect(
      runTransformWithFixture(dimensionToAndroidSpTransform, computedDimensionFixtures.clamp),
    ).toStrictEqual({
      sp: 18,
      literal: '18sp',
    });
  });

  it('falls back to literal dimension payloads when function results are unavailable', () => {
    const unsupportedFunctionFixture: DimensionFixture = {
      pointer: '/dimension/spacing/computed/unsupported',
      value: {
        fn: 'unsupported',
        parameters: [
          {
            $ref: '#/dimension/spacing/base',
            $resolved: { unit: 'pixel', value: 8, dimensionType: 'length' },
          },
        ],
        $value: { unit: 'pixel', value: 12, dimensionType: 'length' },
      },
    };

    expect(
      runTransformWithFixture(dimensionToRemTransform, unsupportedFunctionFixture),
    ).toStrictEqual({
      rem: 0.75,
      css: '0.75rem',
    });
    expect(
      runTransformWithFixture(dimensionToPxTransform, unsupportedFunctionFixture),
    ).toStrictEqual({
      px: 12,
      css: '12px',
    });
    expect(
      runTransformWithFixture(dimensionToSwiftUiPointsTransform, unsupportedFunctionFixture),
    ).toStrictEqual({
      points: 12,
      literal: '12.0',
    });
    expect(
      runTransformWithFixture(dimensionToAndroidDpTransform, unsupportedFunctionFixture),
    ).toStrictEqual({
      dp: 12,
      literal: '12dp',
    });
    expect(
      runTransformWithFixture(dimensionToAndroidSpTransform, unsupportedFunctionFixture),
    ).toBeUndefined();
  });
});

describe('dimensionToSwiftUiPointsTransform', () => {
  it('converts pixel dimensions into SwiftUI points', () => {
    const snapshot = createSnapshot('/dimension/spacing/large');
    const result = dimensionToSwiftUiPointsTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'pixel', value: 24, dimensionType: 'length' },
    });

    expect(result).toStrictEqual({
      points: 24,
      literal: '24.0',
    });
  });

  it('converts rem dimensions into SwiftUI points', () => {
    const snapshot = createSnapshot('/dimension/spacing/base');
    const result = dimensionToSwiftUiPointsTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'rem', value: 1.5, dimensionType: 'length' },
    });

    expect(result).toStrictEqual({
      points: 24,
      literal: '24.0',
    });
  });

  it('returns undefined for unsupported values', () => {
    const snapshot = createSnapshot('/dimension/spacing/invalid');

    expect(
      dimensionToSwiftUiPointsTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'dimension',
        value: { unit: 'pixel', value: Number.NaN, dimensionType: 'length' },
      }),
    ).toBeUndefined();

    expect(
      dimensionToSwiftUiPointsTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'dimension',
        value: '16px' as unknown,
      }),
    ).toBeUndefined();
  });
});

describe('dimensionToRemTransform', () => {
  it('formats percentage units for CSS consumption', () => {
    const snapshot = createSnapshot('/dimension/spacing/percentage');
    const result = dimensionToRemTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'percent', value: 50, dimensionType: 'length' },
    });

    expect(result).toStrictEqual({
      css: '50%',
    });
  });

  it('formats viewport units when conversion is not available', () => {
    const snapshot = createSnapshot('/dimension/spacing/viewport');
    const result = dimensionToRemTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'vh', value: 25, dimensionType: 'length' },
    });

    expect(result).toStrictEqual({
      css: '25vh',
    });
  });

  it('skips non-length dimensions', () => {
    const snapshot = createSnapshot('/dimension/rotation');
    const result = dimensionToRemTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'deg', value: 45, dimensionType: 'angle' },
    });

    expect(result).toBeUndefined();
  });
});

describe('dimensionToPxTransform', () => {
  it('preserves em units for CSS output', () => {
    const snapshot = createSnapshot('/dimension/spacing/em');
    const result = dimensionToPxTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'em', value: 1.25, dimensionType: 'length' },
    });

    expect(result).toStrictEqual({
      css: '1.25em',
    });
  });
});

describe('dimensionToAndroidDpTransform', () => {
  it('converts pixel dimensions into dp outputs', () => {
    const snapshot = createSnapshot('/dimension/spacing/android');
    const result = dimensionToAndroidDpTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'pixel', value: 20, dimensionType: 'length' },
    });

    expect(result).toStrictEqual({
      dp: 20,
      literal: '20dp',
    });
  });

  it('converts rem dimensions into dp outputs', () => {
    const snapshot = createSnapshot('/dimension/spacing/rem');
    const result = dimensionToAndroidDpTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'rem', value: 0.75, dimensionType: 'length' },
    });

    expect(result).toStrictEqual({
      dp: 12,
      literal: '12dp',
    });
  });

  it('returns undefined for unsupported values', () => {
    const snapshot = createSnapshot('/dimension/spacing/invalid/android');

    expect(
      dimensionToAndroidDpTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'dimension',
        value: { unit: 'pixel', value: Number.NaN, dimensionType: 'length' },
      }),
    ).toBeUndefined();

    expect(
      dimensionToAndroidDpTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'dimension',
        value: '16px' as unknown,
      }),
    ).toBeUndefined();
  });

  it('skips font-scaled dimensions for dp outputs', () => {
    const snapshot = createSnapshot('/dimension/spacing/fontScaled');
    const result = dimensionToAndroidDpTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'pixel', value: 18, dimensionType: 'length', fontScale: true },
    });

    expect(result).toBeUndefined();
  });
});

describe('collectWebVariableDeclarations integration', () => {
  it('collects CSS values for non-pixel units', () => {
    const percentageSnapshot = createSnapshot('/dimension/layout/percentage');
    const percentageTransform = dimensionToRemTransform.run({
      snapshot: percentageSnapshot,
      pointer: percentageSnapshot.pointer,
      type: 'dimension',
      value: { unit: 'percentage', value: 64, dimensionType: 'length' },
    });
    expect(percentageTransform).toBeDefined();

    const viewportSnapshot = createSnapshot('/dimension/layout/viewport');
    const viewportTransform = dimensionToPxTransform.run({
      snapshot: viewportSnapshot,
      pointer: viewportSnapshot.pointer,
      type: 'dimension',
      value: { unit: 'vw', value: 33.3333, dimensionType: 'length' },
    });
    expect(viewportTransform).toBeDefined();

    const tokens: readonly FormatterToken[] = [
      {
        snapshot: percentageSnapshot as unknown as FormatterToken['snapshot'],
        pointer: percentageSnapshot.pointer,
        type: 'dimension',
        value: { unit: 'percentage', value: 64, dimensionType: 'length' },
        transforms: new Map([['dimension.toRem', percentageTransform]]),
      } as FormatterToken,
      {
        snapshot: viewportSnapshot as unknown as FormatterToken['snapshot'],
        pointer: viewportSnapshot.pointer,
        type: 'dimension',
        value: { unit: 'vw', value: 33.3333, dimensionType: 'length' },
        transforms: new Map([['dimension.toPx', viewportTransform]]),
      } as FormatterToken,
    ];

    const declarations = collectWebVariableDeclarations(tokens, {
      prefix: 'theme',
      createIdentifier: (segments) => segments.join('-'),
    });

    expect(declarations).toStrictEqual([
      {
        name: 'theme-dimension-layout-percentage',
        value: '64%',
      },
      {
        name: 'theme-dimension-layout-viewport',
        value: '33.3333vw',
      },
    ]);
  });
});

describe('dimensionToAndroidSpTransform', () => {
  it('converts pixel dimensions into sp outputs', () => {
    const snapshot = createSnapshot('/dimension/typography/android');
    const result = dimensionToAndroidSpTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'pixel', value: 18, dimensionType: 'length', fontScale: true },
    });

    expect(result).toStrictEqual({
      sp: 18,
      literal: '18sp',
    });
  });

  it('converts rem dimensions into sp outputs', () => {
    const snapshot = createSnapshot('/dimension/typography/rem');
    const result = dimensionToAndroidSpTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'rem', value: 1.125, dimensionType: 'length', fontScale: true },
    });

    expect(result).toStrictEqual({
      sp: 18,
      literal: '18sp',
    });
  });

  it('returns undefined for unsupported values', () => {
    const snapshot = createSnapshot('/dimension/typography/invalid/android');

    expect(
      dimensionToAndroidSpTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'dimension',
        value: { unit: 'pixel', value: Number.NaN, dimensionType: 'length', fontScale: true },
      }),
    ).toBeUndefined();

    expect(
      dimensionToAndroidSpTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'dimension',
        value: '16px' as unknown,
      }),
    ).toBeUndefined();
  });

  it('skips non font-scaled dimensions for sp outputs', () => {
    const snapshot = createSnapshot('/dimension/typography/plain');
    const result = dimensionToAndroidSpTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'dimension',
      value: { unit: 'pixel', value: 14, dimensionType: 'length' },
    });

    expect(result).toBeUndefined();
  });
});

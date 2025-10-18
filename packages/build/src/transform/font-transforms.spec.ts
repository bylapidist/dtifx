import type { TokenSnapshot } from '../session/resolution-session.js';
import { describe, expect, it } from 'vitest';

import { fontToCssTransform } from './font-transforms.js';

function createSnapshot(pointer: string): TokenSnapshot {
  return { pointer } as unknown as TokenSnapshot;
}

describe('fontToCssTransform', () => {
  it('normalises font metadata into CSS payloads', () => {
    const snapshot = createSnapshot('/font/brand/primary');
    const result = fontToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'font',
      value: {
        fontType: 'css.font-face',
        family: 'Inter',
        fallbacks: ['"Helvetica Neue"', 'Arial', 'sans-serif'],
        style: ' italic ',
        weight: 500,
      },
    });

    expect(result).toStrictEqual({
      css: 'Inter, "Helvetica Neue", Arial, sans-serif',
      family: 'Inter',
      fallbacks: ['"Helvetica Neue"', 'Arial', 'sans-serif'],
      fontStyle: 'italic',
      fontWeight: '500',
      fontType: 'css.font-face',
    });
  });

  it('omits optional metadata when unavailable', () => {
    const snapshot = createSnapshot('/font/system/default');
    const result = fontToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'font',
      value: {
        fontType: 'css.font-face',
        family: 'System UI',
        fallbacks: ['  serif  ', '', 42, '  '],
      },
    });

    expect(result).toStrictEqual({
      css: 'System UI, serif',
      family: 'System UI',
      fallbacks: ['serif'],
      fontType: 'css.font-face',
    });
  });

  it('returns undefined when fontType is missing', () => {
    const snapshot = createSnapshot('/font/system/default');
    const result = fontToCssTransform.run({
      snapshot,
      pointer: snapshot.pointer,
      type: 'font',
      value: {
        family: 'System UI',
        fallbacks: ['  serif  ', '', 42, '  '],
      },
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined for non-object values', () => {
    const snapshot = createSnapshot('/font/invalid/value');

    expect(
      fontToCssTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'font',
        value: undefined,
      }),
    ).toBeUndefined();
  });

  it('returns undefined when family cannot be determined', () => {
    const snapshot = createSnapshot('/font/invalid/family');

    expect(
      fontToCssTransform.run({
        snapshot,
        pointer: snapshot.pointer,
        type: 'font',
        value: {
          family: '   ',
        },
      }),
    ).toBeUndefined();
  });
});

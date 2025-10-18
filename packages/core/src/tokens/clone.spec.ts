import { describe, expect, it } from 'vitest';

import { cloneTokenExtensions, cloneTokenValue } from './index.js';

describe('cloneTokenValue', () => {
  it('returns primitives as-is', () => {
    const nullValue = JSON.parse('null') as null;

    expect(cloneTokenValue('text')).toBe('text');
    expect(cloneTokenValue(42)).toBe(42);

    const clonedNull = cloneTokenValue(nullValue);
    expect(clonedNull).toBe(nullValue);
  });

  it('performs a deep clone on arrays', () => {
    const source = [{ kind: 'a' }, { kind: 'b' }];

    const clone = cloneTokenValue(source);

    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    expect(clone[0]).not.toBe(source[0]);
  });

  it('performs a deep clone on objects', () => {
    const source = { values: { primary: '#fff' } };

    const clone = cloneTokenValue(source);

    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    expect(clone.values).not.toBe(source.values);
  });
});

describe('cloneTokenExtensions', () => {
  it('returns an empty object for non-record values', () => {
    let unknownValue: unknown;

    expect(cloneTokenExtensions(unknownValue)).toEqual({});
    expect(cloneTokenExtensions('text')).toEqual({});
    expect(cloneTokenExtensions(12)).toEqual({});
    expect(cloneTokenExtensions([1, 2, 3])).toEqual({});
  });

  it('deeply clones extension records', () => {
    const extensions = {
      preview: {
        background: '#fff',
      },
    };

    const cloned = cloneTokenExtensions(extensions);

    expect(cloned).toEqual(extensions);
    expect(cloned).not.toBe(extensions);
    expect(cloned.preview).not.toBe(extensions.preview);
  });
});

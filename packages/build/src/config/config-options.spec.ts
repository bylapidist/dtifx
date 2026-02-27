import { describe, expect, it } from 'vitest';

import {
  assertAllowedKeys,
  assertNumberOption,
  assertPlainObject,
  assertStringArrayOption,
  assertStringOption,
} from './config-options.js';

describe('config-options', () => {
  it('validates plain object options and clones the input', () => {
    const input = { alpha: 1, beta: 'two' };

    const output = assertPlainObject(input, 'formatter.alpha');

    expect(output).toEqual(input);
    expect(output).not.toBe(input);

    expect(() => assertPlainObject(undefined, 'formatter.alpha')).toThrow(
      /must be an object of key\/value pairs/i,
    );
    expect(() => assertPlainObject(['x'], 'formatter.alpha')).toThrow(
      /must be an object of key\/value pairs/i,
    );
    expect(() => assertPlainObject('value', 'formatter.alpha')).toThrow(
      /must be an object of key\/value pairs/i,
    );
  });

  it('rejects unknown keys for option sets', () => {
    expect(() =>
      assertAllowedKeys({ enabled: true }, new Set(['enabled']), 'preview', 'formatter'),
    ).not.toThrow();

    expect(() =>
      assertAllowedKeys({ enabled: true, extra: false }, new Set(['enabled']), 'preview', 'policy'),
    ).toThrow('Unknown policy option "extra" supplied for "preview".');
  });

  it('validates numeric options', () => {
    expect(assertNumberOption(42, 'cache', 'ttl')).toBe(42);

    expect(() => assertNumberOption(Number.NaN, 'cache', 'ttl')).toThrow(
      'Option "ttl" for "cache" must be a finite number. Received NaN.',
    );

    expect(() => assertNumberOption('42', 'cache', 'ttl')).toThrow(
      'Option "ttl" for "cache" must be a finite number. Received 42.',
    );
  });

  it('validates string options', () => {
    expect(assertStringOption('preview', 'formatter', 'name')).toBe('preview');

    expect(() => assertStringOption(12, 'formatter', 'name')).toThrow(
      'Option "name" for "formatter" must be a string. Received 12.',
    );
  });

  it('validates string array options and clones arrays', () => {
    const input = ['json', 'yaml'];
    const output = assertStringArrayOption(input, 'formatter', 'targets');

    expect(output).toEqual(input);
    expect(output).not.toBe(input);

    expect(() => assertStringArrayOption('json', 'formatter', 'targets')).toThrow(
      'Option "targets" for "formatter" must be an array of strings. Received "json".',
    );

    expect(() => assertStringArrayOption(['json', 1], 'formatter', 'targets')).toThrow(
      'Option "targets" for "formatter" must be an array of strings. Received ["json",1].',
    );
  });
});

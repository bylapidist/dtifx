import { JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import { describe, expect, it } from 'vitest';

import { pointerTemplate, PointerTemplateError, resolvePointerTemplate } from './index.js';

describe('resolvePointerTemplate', () => {
  it('appends string segments in order', () => {
    const template = pointerTemplate('tokens', 'color');

    const pointer = resolvePointerTemplate(template, { sourceId: 'source' });

    expect(pointer).toBe(`${JSON_POINTER_ROOT}/tokens/color`);
  });

  it('expands the source placeholder', () => {
    const template = pointerTemplate({ kind: 'placeholder', name: 'source' });

    const pointer = resolvePointerTemplate(template, { sourceId: 'design-tokens' });

    expect(pointer).toBe(`${JSON_POINTER_ROOT}/design-tokens`);
  });

  it('throws when the basename placeholder lacks file context', () => {
    const template = pointerTemplate({ kind: 'placeholder', name: 'basename' });

    expect(() => resolvePointerTemplate(template, { sourceId: 'foo' })).toThrowError(
      new PointerTemplateError('Basename placeholder requires file context'),
    );
  });

  it('expands relative segments when provided', () => {
    const template = pointerTemplate({ kind: 'placeholder', name: 'relative' });

    const pointer = resolvePointerTemplate(template, {
      sourceId: 'foo',
      relativeSegments: ['brand', 'core'],
    });

    expect(pointer).toBe(`${JSON_POINTER_ROOT}/brand/core`);
  });
});

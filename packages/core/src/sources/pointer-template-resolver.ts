import { appendJsonPointer, JSON_POINTER_ROOT } from '@lapidist/dtif-parser';
import type { JsonPointer } from '@lapidist/dtif-parser';

import type { PointerPlaceholder, PointerPlaceholderName, PointerTemplate } from './config.js';

export interface PointerTemplateContext {
  readonly sourceId: string;
  readonly relativeSegments?: readonly string[];
  readonly basename?: string;
  readonly stem?: string;
}

/**
 * Error thrown when a pointer template cannot be expanded for a given context.
 */
export class PointerTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PointerTemplateError';
  }
}

/**
 * Resolves a pointer template into a concrete JSON pointer for the provided context.
 *
 * @param template - The pointer template definition from configuration.
 * @param context - Runtime values describing the source being expanded.
 * @returns The fully expanded JSON pointer derived from the template and context.
 */
export function resolvePointerTemplate(
  template: PointerTemplate,
  context: PointerTemplateContext,
): JsonPointer {
  let pointer: JsonPointer = template.base ?? JSON_POINTER_ROOT;

  for (const segment of template.segments) {
    if (typeof segment === 'string') {
      pointer = appendJsonPointer(pointer, segment);
      continue;
    }

    pointer = appendPlaceholder(pointer, segment, context);
  }

  return pointer;
}

function appendPlaceholder(
  pointer: JsonPointer,
  placeholder: PointerPlaceholder,
  context: PointerTemplateContext,
): JsonPointer {
  const name: PointerPlaceholderName = placeholder.name;
  switch (name) {
    case 'relative': {
      if (!context.relativeSegments || context.relativeSegments.length === 0) {
        throw new PointerTemplateError('Relative path placeholder requires file context');
      }
      return appendJsonPointer(pointer, ...context.relativeSegments);
    }
    case 'basename': {
      if (!context.basename) {
        throw new PointerTemplateError('Basename placeholder requires file context');
      }
      return appendJsonPointer(pointer, context.basename);
    }
    case 'stem': {
      if (!context.stem) {
        throw new PointerTemplateError('Stem placeholder requires file context');
      }
      return appendJsonPointer(pointer, context.stem);
    }
    case 'source': {
      return appendJsonPointer(pointer, context.sourceId);
    }
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}

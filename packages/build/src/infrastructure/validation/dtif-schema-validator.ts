import type { JsonPointer } from '@lapidist/dtif-parser';
import { JSON_POINTER_ROOT, appendJsonPointer, splitJsonPointer } from '@lapidist/dtif-parser';
import { createDtifValidator } from '@lapidist/dtif-validator';

import type {
  SchemaValidationIssue,
  SchemaValidationPort,
  SourceDiscoveryContext,
  SourceDocument,
} from '../../domain/ports/index.js';

interface AjvErrorLike {
  readonly keyword?: string;
  readonly instancePath?: string;
  readonly schemaPath?: string;
  readonly message?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/**
 * Splits an AJV instance path into pointer segments.
 * @param {string} path - Instance path emitted by AJV.
 * @returns {readonly string[]} JSON pointer segments representing the failing location.
 */
function parseInstancePath(path: string): readonly string[] {
  if (!path) {
    return [];
  }
  const pointer: JsonPointer = path as JsonPointer;
  return splitJsonPointer(pointer);
}

/**
 * Validates DTIF documents against the shared schema definition and emits
 * structured issues compatible with the build diagnostics pipeline.
 */
export class DtifSchemaValidationAdapter implements SchemaValidationPort {
  private readonly validator = createDtifValidator();

  async validate(
    document: SourceDocument,
    context: SourceDiscoveryContext,
  ): Promise<readonly SchemaValidationIssue[] | undefined> {
    const valid = this.validator.validate(document.document);
    const rawErrors = Array.isArray(this.validator.validate.errors)
      ? (this.validator.validate.errors as AjvErrorLike[])
      : [];
    const issues = rawErrors
      .map((error) => this.toIssue(error, document, context))
      .filter((issue): issue is SchemaValidationIssue => issue !== null);

    if (valid && issues.length === 0) {
      return undefined;
    }
    return issues;
  }

  private toIssue(
    error: AjvErrorLike,
    document: SourceDocument,
    context: SourceDiscoveryContext,
  ): SchemaValidationIssue | null {
    const keyword = typeof error.keyword === 'string' ? error.keyword : 'unknown';
    const instancePath = typeof error.instancePath === 'string' ? error.instancePath : '';
    const schemaPath = typeof error.schemaPath === 'string' ? error.schemaPath : undefined;
    const message = typeof error.message === 'string' ? error.message : undefined;
    const params =
      error.params && typeof error.params === 'object' ? { ...error.params } : undefined;
    const segments = parseInstancePath(instancePath);
    const pointer =
      segments.length === 0
        ? document.pointerPrefix
        : appendJsonPointer(document.pointerPrefix, ...segments);
    const relativePointer =
      segments.length === 0 ? JSON_POINTER_ROOT : appendJsonPointer(JSON_POINTER_ROOT, ...segments);

    return {
      kind: 'validation',
      sourceId: context.source.id,
      uri: document.uri,
      pointerPrefix: document.pointerPrefix,
      pointer,
      instancePath: relativePointer,
      keyword,
      ...(schemaPath ? { schemaPath } : {}),
      ...(message ? { message } : {}),
      ...(params ? { params } : {}),
      severity: 'error',
    } satisfies SchemaValidationIssue;
  }
}

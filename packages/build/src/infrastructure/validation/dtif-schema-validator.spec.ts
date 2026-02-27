import { describe, expect, it, vi } from 'vitest';

import { DtifSchemaValidationAdapter } from './dtif-schema-validator.js';
import type { SourceDiscoveryContext, SourceDocument } from '../../domain/ports/index.js';

function createDocument(pointerPrefix = '/tokens'): SourceDocument {
  return {
    uri: 'file:///workspace/tokens.json',
    pointerPrefix,
    document: { token: { $type: 'color', $value: '#ffffff' } },
  } as SourceDocument;
}

function createContext(): SourceDiscoveryContext {
  return {
    source: { id: 'tokens' },
  } as SourceDiscoveryContext;
}

describe('DtifSchemaValidationAdapter', () => {
  it('returns undefined when validation succeeds without schema errors', async () => {
    const adapter = new DtifSchemaValidationAdapter();
    const validate = vi.fn().mockReturnValue(true) as typeof vi.fn & {
      errors?: unknown;
    };
    validate.errors = undefined;
    (adapter as { validator: { validate: typeof validate } }).validator = { validate };

    await expect(adapter.validate(createDocument(), createContext())).resolves.toBeUndefined();
  });

  it('maps validation errors with optional metadata and pointer segments', async () => {
    const adapter = new DtifSchemaValidationAdapter();
    const validate = vi.fn().mockReturnValue(false) as typeof vi.fn & {
      errors?: unknown;
    };
    validate.errors = [
      {
        keyword: 'type',
        instancePath: '#/token/$value',
        schemaPath: '#/properties/token',
        message: 'must be string',
        params: { type: 'string' },
      },
      {
        keyword: 'required',
        instancePath: '',
      },
    ];
    (adapter as { validator: { validate: typeof validate } }).validator = { validate };

    const result = await adapter.validate(createDocument('/root'), createContext());

    expect(result).toEqual([
      {
        kind: 'validation',
        sourceId: 'tokens',
        uri: 'file:///workspace/tokens.json',
        pointerPrefix: '/root',
        pointer: '#/root/token/$value',
        instancePath: '#/token/$value',
        keyword: 'type',
        schemaPath: '#/properties/token',
        message: 'must be string',
        params: { type: 'string' },
        severity: 'error',
      },
      {
        kind: 'validation',
        sourceId: 'tokens',
        uri: 'file:///workspace/tokens.json',
        pointerPrefix: '/root',
        pointer: '/root',
        instancePath: '#',
        keyword: 'required',
        severity: 'error',
      },
    ]);
  });

  it('normalises unknown or malformed ajv error fields', async () => {
    const adapter = new DtifSchemaValidationAdapter();
    const validate = vi.fn().mockReturnValue(true) as typeof vi.fn & {
      errors?: unknown;
    };
    validate.errors = [
      {
        keyword: 123,
        instancePath: undefined,
        schemaPath: 42,
        message: { text: 'invalid' },
        params: 'bad-params',
      },
    ];
    (adapter as { validator: { validate: typeof validate } }).validator = { validate };

    const result = await adapter.validate(createDocument('/fallback'), createContext());

    expect(result).toEqual([
      {
        kind: 'validation',
        sourceId: 'tokens',
        uri: 'file:///workspace/tokens.json',
        pointerPrefix: '/fallback',
        pointer: '/fallback',
        instancePath: '#',
        keyword: 'unknown',
        severity: 'error',
      },
    ]);
  });
});

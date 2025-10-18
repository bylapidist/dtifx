import {
  createTokenSetFromParseResult,
  ensureNoFatalDiagnostics,
  forwardDiagnostics,
  parseTokenDocument,
  type TokenParserHooks,
} from '../adapters/dtif-parser/token-set-builder.js';
import type { TokenSet } from '../domain/tokens.js';

export interface TokenSetFactoryOptions extends TokenParserHooks {
  readonly label: string;
}

export class TokenSetFactory {
  async createFromInput(filePath: string, options: TokenSetFactoryOptions): Promise<TokenSet> {
    if (typeof filePath !== 'string') {
      throw new TypeError('TokenSetFactory only supports file path inputs.');
    }

    const { label } = options;
    const result = await parseTokenDocument(filePath);

    forwardDiagnostics(result.diagnostics, options);
    ensureNoFatalDiagnostics(result.diagnostics, label);

    const { document } = result;

    if (document === undefined) {
      throw new Error(`DTIF document did not decode correctly: ${label}`);
    }

    const documentData = document.data;

    if (!isPlainObject(documentData)) {
      throw new Error(`DTIF document did not decode to an object: ${label}`);
    }

    return createTokenSetFromParseResult(result, {
      source: label,
      ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
    });
  }
}

export const defaultTokenSetFactory = new TokenSetFactory();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

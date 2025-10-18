import path from 'node:path';

import type { TokenSet } from '../domain/tokens.js';
import type { TokenParserHooks } from '../adapters/dtif-parser/token-set-builder.js';
import type { DiagnosticsPort } from '../application/ports/diagnostics.js';
import { DiagnosticScopes } from '../application/ports/diagnostics.js';
import { createDiagnosticsAwareParserHooks } from '../adapters/token-source/diagnostics.js';
import { defaultTokenSetFactory } from './token-set-factory.js';

export interface LoadTokenFileOptions extends TokenParserHooks {
  readonly label?: string;
  readonly diagnostics?: DiagnosticsPort;
}

const { resolve: resolvePath } = path;

/**
 * Loads and parses a DTIF token document from the filesystem.
 *
 * @param filePath - The path of the token document to parse.
 * @param options - Optional parser hooks and diagnostics configuration.
 * @returns A token set resolved from the provided source.
 */
export async function loadTokenFile(
  filePath: string,
  options: LoadTokenFileOptions = {},
): Promise<TokenSet> {
  const absolutePath = resolvePath(filePath);
  const parseInput = absolutePath;
  const sourceLabel = absolutePath;
  const label = options.label ?? sourceLabel;

  const parserHooks = createDiagnosticsAwareParserHooks({
    ...(options.diagnostics === undefined ? {} : { diagnostics: options.diagnostics }),
    scope: DiagnosticScopes.tokenSourceFile,
    sourceLabel: label,
    hooks: {
      ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
      ...(options.warn === undefined ? {} : { warn: options.warn }),
    },
  });

  return defaultTokenSetFactory.createFromInput(parseInput, {
    ...parserHooks,
    label,
  });
}

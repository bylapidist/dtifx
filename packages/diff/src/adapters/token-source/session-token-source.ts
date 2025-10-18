import path from 'node:path';

import type { TokenSet } from '../../domain/tokens.js';
import type {
  TokenSourcePort,
  TokenSourceLabel,
  TokenSourceContext,
} from '../../application/ports/token-source.js';
import {
  DiagnosticCategories,
  formatTokenSourceScope,
} from '../../application/ports/diagnostics.js';
import type { LoadTokenFileOptions } from '../../sources/file-loader.js';
import { loadTokenFile } from '../../sources/file-loader.js';
import type { TokenParserHooks } from '../dtif-parser/token-set-builder.js';
import { createDiagnosticsAwareParserHooks, emitTokenSourceDiagnostic } from './diagnostics.js';
import { sanitizeDiagnosticMessage } from '../../utils/diagnostics.js';

export type SessionTokenSource = FileTokenSource;

export interface FileTokenSource {
  readonly kind: 'file';
  readonly target: string;
  readonly label?: string;
}

export interface SessionTokenSources {
  readonly previous: SessionTokenSource;
  readonly next: SessionTokenSource;
}

export type SessionTokenSourcePortOptions = TokenParserHooks;

/**
 * Creates a token source port backed by session configuration for previous and next snapshots.
 *
 * @param sources - The previous and next token sources for the session.
 * @param options - Additional loader options shared across sources.
 * @param options.cwd - Working directory used when resolving relative paths.
 * @returns A token source port used by the diff session pipeline.
 */
export function createSessionTokenSourcePort(
  sources: SessionTokenSources,
  options: SessionTokenSourcePortOptions = {},
): TokenSourcePort {
  return {
    load(label, context) {
      const source = selectSource(sources, label);
      return loadSnapshot(source, options, label, context);
    },
    describe(label) {
      const source = selectSource(sources, label);
      return describeTokenSource(source);
    },
  };
}

const { resolve: resolvePath, relative } = path;

/**
 * Describes a session token source in human-readable form for diagnostics.
 *
 * @param source - The session token source to describe.
 * @returns A descriptive label for the token source.
 */
export function describeTokenSource(source: SessionTokenSource): string {
  return simplifyPath(source.target);
}

/**
 * Formats a session token source label relative to the provided working directory.
 *
 * @param source - The session token source to label.
 * @param options - Formatting options including the current working directory.
 * @param options.cwd - Working directory used when resolving relative paths.
 * @returns The formatted token source label.
 */
export function formatTokenSourceLabel(
  source: SessionTokenSource,
  options: { readonly cwd?: string } = {},
): string {
  return simplifyPath(source.target, options.cwd);
}

function simplifyPath(target: string, cwd: string = process.cwd()): string {
  const absolute = resolvePath(target);
  const relativePath = relative(cwd, absolute);

  if (relativePath.length === 0) {
    return '.';
  }

  if (!relativePath.startsWith('..')) {
    return stripCurrentDirectoryPrefix(relativePath);
  }

  return absolute;
}

function selectSource(sources: SessionTokenSources, label: TokenSourceLabel): SessionTokenSource {
  return label === 'previous' ? sources.previous : sources.next;
}

async function loadSnapshot(
  source: SessionTokenSource,
  options: SessionTokenSourcePortOptions,
  label: TokenSourceLabel,
  context: TokenSourceContext | undefined,
): Promise<TokenSet> {
  const description = describeTokenSource(source);
  emitTokenSourceDiagnostic(
    context,
    {
      level: 'info',
      code: 'TOKEN_LOAD_START',
      message: `Loading ${label} snapshot from ${description}`,
      category: DiagnosticCategories.tokenSourceSession,
    },
    label,
  );

  const hooks = createParserHooks(description, options, context, label);

  try {
    const result = await loadSnapshotFromSource(source, hooks);

    emitTokenSourceDiagnostic(
      context,
      {
        level: 'info',
        code: 'TOKEN_LOAD_SUCCESS',
        message: `Loaded ${label} snapshot from ${description}`,
        category: DiagnosticCategories.tokenSourceSession,
      },
      label,
    );

    return result;
  } catch (error) {
    emitTokenSourceDiagnostic(
      context,
      {
        level: 'error',
        code: 'TOKEN_LOAD_ERROR',
        message: `Error loading ${label} snapshot from ${description}: ${describeError(error)}`,
        category: DiagnosticCategories.tokenSourceSession,
      },
      label,
    );

    throw error;
  }
}

function createParserHooks(
  description: string,
  options: SessionTokenSourcePortOptions,
  context: TokenSourceContext | undefined,
  label: TokenSourceLabel,
): TokenParserHooks {
  return createDiagnosticsAwareParserHooks({
    ...(context?.diagnostics === undefined ? {} : { diagnostics: context.diagnostics }),
    scope: formatTokenSourceScope(label),
    sourceLabel: description,
    includeSourceLabelInMessage: false,
    hooks: {
      onDiagnostic(diagnostic) {
        options.onDiagnostic?.(diagnostic);
      },
      warn(diagnostic) {
        options.warn?.(diagnostic);
      },
    },
  });
}

async function loadSnapshotFromSource(
  source: SessionTokenSource,
  hooks: TokenParserHooks,
): Promise<TokenSet> {
  const loadOptions: LoadTokenFileOptions = {
    ...hooks,
    ...(source.label === undefined ? {} : { label: source.label }),
  } satisfies LoadTokenFileOptions;

  return loadTokenFile(source.target, loadOptions);
}

function stripCurrentDirectoryPrefix(value: string): string {
  if (value.startsWith(`.${path.sep}`)) {
    return value.slice(2);
  }

  return value;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeDiagnosticMessage(error.message);
  }

  if (typeof error === 'string') {
    return sanitizeDiagnosticMessage(error);
  }

  return sanitizeDiagnosticMessage(String(error));
}

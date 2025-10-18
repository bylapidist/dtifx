import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type {
  DiffEngineOptions,
  TokenImpactStrategy,
  TokenRenameStrategy,
  TokenSummaryStrategy,
} from '@dtifx/diff';

export interface DiffStrategyModuleOptions {
  readonly renameStrategy?: string;
  readonly impactStrategy?: string;
  readonly summaryStrategy?: string;
}

type MutableDiffEngineOptions = {
  -readonly [K in keyof DiffEngineOptions]?: DiffEngineOptions[K];
};

export const loadDiffStrategies = async (
  options: DiffStrategyModuleOptions,
): Promise<DiffEngineOptions | undefined> => {
  const strategies: MutableDiffEngineOptions = {};

  if (options.renameStrategy) {
    strategies.renameStrategy = await loadRenameStrategy(options.renameStrategy);
  }

  if (options.impactStrategy) {
    strategies.impactStrategy = await loadImpactStrategy(options.impactStrategy);
  }

  if (options.summaryStrategy) {
    strategies.summaryStrategy = await loadSummaryStrategy(options.summaryStrategy);
  }

  return Object.keys(strategies).length > 0 ? (strategies as DiffEngineOptions) : undefined;
};

const { isAbsolute, resolve: resolvePath } = path;

const loadRenameStrategy = async (specifier: string): Promise<TokenRenameStrategy> => {
  const candidate = await importStrategyModule(specifier, 'rename strategy');
  const strategy = await coerceStrategy(candidate, isRenameStrategy);

  if (strategy) {
    return strategy;
  }

  throw new TypeError(
    `Module "${specifier}" does not export a valid rename strategy. ` +
      'Expected an object with a detectRenames method.',
  );
};

const loadImpactStrategy = async (specifier: string): Promise<TokenImpactStrategy> => {
  const candidate = await importStrategyModule(specifier, 'impact strategy');
  const strategy = await coerceStrategy(candidate, isImpactStrategy);

  if (strategy) {
    return strategy;
  }

  throw new TypeError(
    `Module "${specifier}" does not export a valid impact strategy. ` +
      'Expected classifyAddition/classifyRemoval/classifyRename/classifyModification methods.',
  );
};

const loadSummaryStrategy = async (specifier: string): Promise<TokenSummaryStrategy> => {
  const candidate = await importStrategyModule(specifier, 'summary strategy');
  const strategy = await coerceStrategy(candidate, isSummaryStrategy);

  if (strategy) {
    return strategy;
  }

  throw new TypeError(
    `Module "${specifier}" does not export a valid summary strategy. ` +
      'Expected an object with a createSummary method.',
  );
};

const importStrategyModule = async (specifier: string, description: string): Promise<unknown> => {
  const moduleSpecifier = toImportSpecifier(specifier);
  const imported = await import(moduleSpecifier);
  const candidate =
    (imported as Record<string, unknown>)['default'] ??
    (imported as Record<string, unknown>)['strategy'];

  if (candidate !== undefined) {
    return resolveMaybePromise(candidate);
  }

  throw new TypeError(
    `Module "${specifier}" does not define a default or "strategy" export for the ${description}.`,
  );
};

const toImportSpecifier = (specifier: string): string => {
  if (specifier.startsWith('file:')) {
    return specifier;
  }

  if (startsWithRelativeSegment(specifier)) {
    const resolved = isAbsolute(specifier) ? specifier : resolvePath(process.cwd(), specifier);
    return pathToFileURL(resolved).href;
  }

  if (isAbsolute(specifier) || path.win32.isAbsolute(specifier)) {
    return pathToFileURL(specifier).href;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(specifier)) {
    throw new TypeError(
      `Diff strategy module specifiers must be bare package names or filesystem paths. Received "${specifier}".`,
    );
  }

  return specifier;
};

const startsWithRelativeSegment = (value: string): boolean => {
  return value.startsWith('./') || value.startsWith('../');
};

const isRenameStrategy = (value: unknown): value is TokenRenameStrategy => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TokenRenameStrategy).detectRenames === 'function'
  );
};

const isImpactStrategy = (value: unknown): value is TokenImpactStrategy => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TokenImpactStrategy).classifyAddition === 'function' &&
    typeof (value as TokenImpactStrategy).classifyRemoval === 'function' &&
    typeof (value as TokenImpactStrategy).classifyRename === 'function' &&
    typeof (value as TokenImpactStrategy).classifyModification === 'function'
  );
};

const isSummaryStrategy = (value: unknown): value is TokenSummaryStrategy => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TokenSummaryStrategy).createSummary === 'function'
  );
};

const coerceStrategy = async <T>(
  candidate: unknown,
  guard: (value: unknown) => value is T,
): Promise<T | undefined> => {
  if (guard(candidate)) {
    return candidate;
  }

  if (typeof candidate === 'function') {
    const maybeConstructable = candidate as new () => unknown;

    if (hasPrototype(candidate)) {
      const constructed = new maybeConstructable();

      if (guard(constructed)) {
        return constructed;
      }
    }

    try {
      const invoked = await resolveMaybePromise((candidate as () => unknown)());

      if (guard(invoked)) {
        return invoked;
      }
    } catch (error) {
      if (!isClassInvocationError(error)) {
        throw error;
      }
    }
  }

  return undefined;
};

const hasPrototype = (value: unknown): value is { readonly prototype: object } => {
  return typeof value === 'function' && value.prototype !== undefined;
};

const isClassInvocationError = (error: unknown): boolean => {
  return (
    error instanceof TypeError &&
    typeof error.message === 'string' &&
    /class constructor/i.test(error.message) &&
    /without 'new'|is not a constructor/i.test(error.message)
  );
};

const resolveMaybePromise = async <T>(value: T | PromiseLike<T>): Promise<T> => {
  return isPromiseLike(value) ? await value : value;
};

const isPromiseLike = <T = unknown>(value: unknown): value is PromiseLike<T> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<T>).then === 'function'
  );
};

import type { TokenChangeImpact, TokenChangeKind, TokenDiffFilter } from '../domain/diff-types.js';

export interface DiffFilterOptions {
  readonly types?: readonly string[];
  readonly paths?: readonly string[];
  readonly groups?: readonly string[];
  readonly impacts?: readonly TokenChangeImpact[];
  readonly kinds?: readonly TokenChangeKind[];
}

export interface DiffFilterResolution {
  readonly filter?: TokenDiffFilter;
  readonly applied: boolean;
}

/**
 * Normalises diff filter options into a filter object and indicates whether it should be applied.
 *
 * @param options - The raw diff filter options supplied by the caller.
 * @returns The resolved filter and whether any criteria were applied.
 */
export function resolveDiffFilter(options: DiffFilterOptions | undefined): DiffFilterResolution {
  if (!options) {
    return { applied: false };
  }

  const types = sanitizeList(options.types);
  const paths = sanitizeList(options.paths);
  const groups = sanitizeList(options.groups);
  const impacts = sanitizeList(options.impacts);
  const kinds = sanitizeList(options.kinds);

  const filter: TokenDiffFilter = {
    ...(types.length > 0 ? { types } : {}),
    ...(paths.length > 0 ? { paths } : {}),
    ...(groups.length > 0 ? { groups } : {}),
    ...(impacts.length > 0 ? { impacts: impacts as readonly TokenChangeImpact[] } : {}),
    ...(kinds.length > 0 ? { kinds: kinds as readonly TokenChangeKind[] } : {}),
  };

  const applied =
    types.length > 0 ||
    paths.length > 0 ||
    groups.length > 0 ||
    impacts.length > 0 ||
    kinds.length > 0;

  if (!applied) {
    return { applied: false };
  }

  return { applied: true, filter };
}

function sanitizeList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  if (!values) {
    return [];
  }

  const result: T[] = [];

  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      result.push(value);
    }
  }

  return result;
}

import type { DiffFailureResult } from '@dtifx/diff';

const CLI_BRAND = 'DTIFx diff';

export const formatFailureMessage = (result: DiffFailureResult): string => {
  if (result.reason === 'breaking-changes') {
    const count = result.matchedCount ?? 0;
    const label = count === 1 ? 'breaking change' : 'breaking changes';
    return `${CLI_BRAND}: failing because ${String(count)} ${label} detected (--fail-on-breaking).`;
  }

  if (result.reason === 'token-changes') {
    const count = result.matchedCount ?? 0;
    const label = count === 1 ? 'token change' : 'token changes';
    return `${CLI_BRAND}: failing because ${String(count)} ${label} detected (--fail-on-changes).`;
  }

  return `${CLI_BRAND}: failing because a diff failure policy was triggered.`;
};

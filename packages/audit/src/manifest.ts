import type { PackageManifest } from '@dtifx/core';
import { createPlaceholderManifest } from '@dtifx/core';

const manifestDefinition = {
  name: '@dtifx/audit',
  summary:
    'Policy-driven governance engine with audit runners, evidence capture, and actionable compliance reports.',
} as const satisfies PackageManifest;

export const manifest = createPlaceholderManifest(manifestDefinition);

export const describe = (): PackageManifest => ({ ...manifest });

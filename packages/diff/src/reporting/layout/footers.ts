export interface ReportFooterSection {
  readonly title: string;
  readonly items: readonly string[];
}

const DEFAULT_FOOTER_SECTIONS: readonly ReportFooterSection[] = [
  {
    title: 'Hints',
    items: [
      'Use `--verbose` or `--mode detailed` for full token metadata and links.',
      'Show rationale with `--why` and adjust context via `--diff-context N`.',
      'Disable OSC-8 links with `--no-links`.',
      'Export machine output via `--format json|yaml|sarif --output ./reports/dtifx-diff.json`.',
    ],
  },
  {
    title: 'Exit codes',
    items: [
      '0 success',
      '1 failure triggered by `--fail-on-breaking` or `--fail-on-changes`.',
      '2 parser or IO error.',
    ],
  },
];

/**
 * Returns the default set of footer sections displayed in CLI reports.
 *
 * @returns The standard footer section descriptors.
 */
export function getStandardFooterSections(): readonly ReportFooterSection[] {
  return DEFAULT_FOOTER_SECTIONS;
}

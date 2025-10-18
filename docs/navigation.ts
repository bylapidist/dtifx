export interface JourneyLink {
  readonly text: string;
  readonly link: string;
  readonly description?: string;
}

const buildWorkflowDeepDive: JourneyLink = {
  text: 'Build workflow deep dive',
  link: '/api/build-workflows',
  description: 'Deep dive into validate, generate, inspect, and watch runs.',
};

export const apiJourney: readonly JourneyLink[] = [
  { text: 'CLI reference', link: '/reference/cli' },
  buildWorkflowDeepDive,
  { text: 'Build runtime reference', link: '/reference/build-runtime' },
];

export const integrationJourney: readonly JourneyLink[] = [
  { text: 'Build pipeline guide', link: '/guides/build-pipeline' },
  buildWorkflowDeepDive,
  { text: 'Platform presets', link: '/guides/build-presets' },
];

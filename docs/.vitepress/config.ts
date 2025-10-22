/* eslint-disable import/no-default-export */
import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'DTIFx Toolkit',
  description: 'Design Token Interchange Format automation suite.',
  srcDir: '.',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#1f6feb' }],
    ['meta', { property: 'og:title', content: 'DTIFx Toolkit' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Design Token Interchange Format automation for build, diff, and audit lifecycles.',
      },
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:image', content: 'https://dtifx.lapidist.net/logo.svg' }],
    ['meta', { property: 'og:image:alt', content: 'DTIFx geometric logomark' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    search: {
      provider: 'local',
    },
    nav: [
      {
        text: 'Packages',
        items: [
          { text: '@dtifx/core', link: '/core/' },
          { text: '@dtifx/build', link: '/build/' },
          { text: '@dtifx/diff', link: '/diff/' },
          { text: '@dtifx/cli', link: '/cli/' },
          { text: '@dtifx/audit', link: '/audit/' },
          { text: '@dtifx/extractors', link: '/extractors/' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Quickstart', link: '/guides/getting-started' },
          { text: 'Extractor setup', link: '/guides/extractor-setup' },
          { text: 'Build pipeline', link: '/guides/build-pipeline' },
          { text: 'Platform presets', link: '/guides/build-presets' },
          { text: 'Diff workflow', link: '/guides/diff-workflow' },
          { text: 'Audit governance', link: '/guides/audit-governance' },
        ],
      },
      {
        text: 'Support',
        items: [
          {
            text: 'Examples',
            items: [
              { text: 'Automation script', link: '/examples/automation' },
              { text: 'Build preset config', link: '/examples/build-presets' },
              { text: 'Minimal stack', link: '/examples/minimal-stack' },
            ],
          },
          { text: 'Troubleshooting', link: '/troubleshooting/' },
        ],
      },
    ],
    sidebar: {
      '/core/': [
        {
          text: '@dtifx/core',
          items: [
            { text: 'Overview', link: '/core/' },
            { text: 'Core runtime reference', link: '/reference/core-runtime' },
            { text: 'Telemetry overview', link: '/overview/telemetry' },
          ],
        },
      ],
      '/build/': [
        {
          text: '@dtifx/build',
          items: [
            { text: 'Overview', link: '/build/' },
            { text: 'Build pipeline guide', link: '/guides/build-pipeline' },
            { text: 'Platform presets', link: '/guides/build-presets' },
            { text: 'Formatter presets', link: '/config/formatter-presets' },
            { text: 'Transform presets', link: '/config/transform-presets' },
            { text: 'Build configuration', link: '/reference/build-config' },
            { text: 'Build runtime', link: '/reference/build-runtime' },
          ],
        },
      ],
      '/diff/': [
        {
          text: '@dtifx/diff',
          items: [
            { text: 'Overview', link: '/diff/' },
            { text: 'Diff workflow guide', link: '/guides/diff-workflow' },
            { text: 'Diff API reference', link: '/reference/diff-api' },
          ],
        },
      ],
      '/cli/': [
        {
          text: '@dtifx/cli',
          items: [
            { text: 'Overview', link: '/cli/' },
            { text: 'CLI reference', link: '/reference/cli' },
            { text: 'Extractor setup guide', link: '/guides/extractor-setup' },
            { text: 'Quickstart guide', link: '/guides/getting-started' },
            { text: 'Troubleshooting', link: '/troubleshooting/' },
          ],
        },
      ],
      '/extractors/': [
        {
          text: '@dtifx/extractors',
          items: [
            { text: 'Overview', link: '/extractors/' },
            { text: 'Extractor setup guide', link: '/guides/extractor-setup' },
          ],
        },
      ],
      '/audit/': [
        {
          text: '@dtifx/audit',
          items: [
            { text: 'Overview', link: '/audit/' },
            { text: 'Audit governance guide', link: '/guides/audit-governance' },
            { text: 'Audit configuration', link: '/reference/audit-config' },
            { text: 'Audit runtime', link: '/reference/audit-runtime' },
          ],
        },
      ],
      '/overview/': [
        {
          text: 'Essentials',
          items: [
            { text: 'Toolkit overview', link: '/overview/' },
            { text: 'Architecture', link: '/overview/architecture' },
            { text: 'Telemetry', link: '/overview/telemetry' },
          ],
        },
      ],
      '/guides/': [
        {
          text: 'Workflows',
          items: [
            { text: 'Quickstart', link: '/guides/getting-started' },
            { text: 'Extractor setup', link: '/guides/extractor-setup' },
            { text: 'Build pipeline', link: '/guides/build-pipeline' },
            { text: 'Platform presets', link: '/guides/build-presets' },
            { text: 'Diff workflow', link: '/guides/diff-workflow' },
            { text: 'Audit governance', link: '/guides/audit-governance' },
          ],
        },
      ],
      '/config/': [
        {
          text: 'Preset references',
          items: [
            { text: 'Formatter presets', link: '/config/formatter-presets' },
            { text: 'Transform presets', link: '/config/transform-presets' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'CLI', link: '/reference/cli' },
            { text: 'Build configuration', link: '/reference/build-config' },
            { text: 'Build runtime', link: '/reference/build-runtime' },
            { text: 'Audit configuration', link: '/reference/audit-config' },
            { text: 'Audit runtime', link: '/reference/audit-runtime' },
            { text: 'Diff API', link: '/reference/diff-api' },
            { text: 'Core runtime', link: '/reference/core-runtime' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Support',
          items: [
            { text: 'Automation script', link: '/examples/automation' },
            { text: 'Build preset config', link: '/examples/build-presets' },
            { text: 'Minimal stack', link: '/examples/minimal-stack' },
          ],
        },
      ],
      '/troubleshooting/': [
        {
          text: 'Support',
          items: [{ text: 'Common issues', link: '/troubleshooting/' }],
        },
      ],
    },
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/bylapidist/dtifx',
      },
    ],
  },
});

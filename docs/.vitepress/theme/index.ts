/* eslint-disable import/no-default-export */
import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import './styles/custom.css';

const theme: Theme = {
  ...DefaultTheme,
  Layout() {
    const year = new Date().getFullYear();

    return h(DefaultTheme.Layout, undefined, {
      'layout-bottom': () =>
        h('footer', { class: 'dtifx-site-footer' }, [
          h('div', [
            'DTIFx Toolkit is powered by the ',
            h(
              'a',
              {
                href: 'https://dtif.lapidist.net',
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              'Design Token Interchange Format',
            ),
          ]),
          h('div', `Copyright © ${year} Brett Dorrans and DTIFx Contributors`),
        ]),
    });
  },
};

export default theme;

// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';

/**
 * Adds the globe test page (/dev/globe) only under `npm run dev`, or when GLOBE_TEST_PAGE=1
 * is set (npm run globe:preview and npm run globe:stills). A normal build never includes it.
 * @type {import('astro').AstroIntegration}
 */
const globeTestPage = {
  name: 'globe-test-page',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      // Read through globalThis: this project doesn't include Node's type definitions.
      const env = /** @type {{ process?: { env: Record<string, string | undefined> } }} */ (globalThis).process?.env;
      if (command === 'dev' || env?.GLOBE_TEST_PAGE === '1') {
        injectRoute({ pattern: '/dev/globe', entrypoint: './src/dev/globe-test.astro' });
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({
  integrations: [mdx(), globeTestPage],
  build: {
    // Put each page's CSS straight into its HTML instead of separate files. The CSS is small
    // (a few KB per page), and as files it blocked rendering for one or two extra round trips
    // before the page, and its globe still, could appear on a slow phone connection.
    inlineStylesheets: 'always',
  },
});
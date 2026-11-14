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
});
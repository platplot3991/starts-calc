// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  integrations: [svelte()],
  output: 'static',
  site: 'https://platplot3991.github.io',
  base: '/starts-calc',
  vite: {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});
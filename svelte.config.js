import preprocess from 'svelte-preprocess';
import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      pages: 'dist',
      assets: 'dist',
      fallback: undefined,
      strict: false
    }),
    paths: {
      relative: true
    },
    prerender: {
      handleHttpError: 'warn'
    }
  },

  preprocess: [
    preprocess({
      postcss: true
    })
  ]
};

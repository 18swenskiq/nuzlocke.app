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
      handleHttpError: 'warn',
      entries: [
        '*',
        '/assets/pokemon.css',
        '/assets/pokemon-blazingem.css',
        '/assets/pokemon-radicalred.css',
        '/assets/badges.css'
      ]
    }
  },

  preprocess: [
    preprocess({
      postcss: true
    })
  ]
};

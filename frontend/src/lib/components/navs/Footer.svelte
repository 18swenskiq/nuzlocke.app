<script>
  import { Icon } from '$c/core'
  import { GitHub } from '$icons'
</script>

<footer class={$$restProps.class || ''}>
  <p>
    <a href="https://github.com/18swenskiq/nuzlocke.app"
       rel=noreferrer target=_blank>
      <button aria-label='View source on GitHub' title='View source on GitHub'>
        <Icon inline={true} class='fill-current' icon={GitHub} />
      </button>
    </a>
  </p>


  <div class="maintainers">
    <span>Originally by <strong>Domtronn</strong></span>
    <span>Updated by <strong>Squidski</strong></span>
  </div>
  All content & design © Pokémon Nuzlocke Tracker, 2021-{(new Date()).getFullYear()}. <a href='/privacy-policy'>Privacy Policy</a>. <a href='/credit'>Credits</a>.
  <br class='hidden md:block' />
  Pokémon images & names © 1995-2021 Nintendo/Creatures Inc./GAME FREAK inc. TM
</footer>

<!-- svelte-ignore css-unused-selector -->
<style lang="postcss">
  footer { @apply text-center w-full absolute bottom-4 md:bottom-2 sm:my-6 px-4 text-tiny md:text-xs text-gray-500 dark:text-gray-400 leading-3 z-20 h-max; }
  footer > p { @apply flex justify-center text-2xl; }
  .maintainers { @apply mb-2 flex flex-col items-center gap-y-1; }
  footer a,
  footer button { @apply transition-colors; }
  footer button:hover,
  footer a:hover { @apply text-black; }
  :global(.dark) footer button:hover,
  :global(.dark) footer a:hover { @apply text-white; }
  footer button { @apply p-3; }
</style>

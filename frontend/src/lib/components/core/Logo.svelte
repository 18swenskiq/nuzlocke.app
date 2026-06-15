<script>
  export let src, alt = '', aspect = '4x4', pixelated = false, role = '', loading = 'lazy', pictureClass = ''
  import { fade } from 'svelte/transition'

  const [width, height] = aspect.split('x')
</script>

<picture in:fade class={pictureClass || ''}>
  <source srcset='{src}@1.webp' type='image/webp' />

  <img class={$$restProps.class || ''}
       decoding='async'

       class:pixelated={pixelated}
       src='{src}@1.webp'
       {loading}
       {width}
       {height}
       {alt}
       {role}
       />
</picture>

<style lang="postcss">
  img.pixelated {
    image-rendering: pixelated;
  }
</style>

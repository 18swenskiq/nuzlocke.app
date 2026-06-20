<script>
  export let src,
    alt = '',
    className = '',
    aspect = '4x4',
    pixelated = false,
    role = '',
    fadeIn = true,
    loading = 'lazy',
    formats = ['webp', 'png']

  import { fade } from 'svelte/transition'

  const [width, height] = aspect.split('x')

  let failedSrc = ''

  $: imageFormats =
    Array.isArray(formats) && formats.length ? formats : ['png']
  $: fallbackFormat =
    imageFormats.find((format) => format !== 'webp') || imageFormats[0]
  $: imageSrc = src ? `${src}.${fallbackFormat}` : ''
  $: webpSrc =
    src && imageFormats.includes('webp') ? `${src}.webp` : ''
  $: if (imageSrc !== failedSrc) failedSrc = ''
</script>

{#if fadeIn}
<picture class={$$restProps.class || ''} in:fade>
  {#if webpSrc}
    <source srcset={webpSrc} type="image/webp" />
  {/if}
  {#if imageSrc && imageSrc !== failedSrc}
    <img
      class={className}
      class:pixelated={pixelated}
      src={imageSrc}
      {loading}
      {width}
      {height}
      {alt}
      {role}
      on:error={() => (failedSrc = imageSrc)}
    />
  {/if}
</picture>
{:else}
<picture class={$$restProps.class || ''}>
  {#if webpSrc}
    <source srcset={webpSrc} type="image/webp" />
  {/if}
  {#if imageSrc && imageSrc !== failedSrc}
    <img
      class={className}
      class:pixelated={pixelated}
      src={imageSrc}
      {loading}
      {width}
      {height}
      {alt}
      {role}
      on:error={() => (failedSrc = imageSrc)}
    />
  {/if}
</picture>
{/if}

<style lang="postcss">
  img.pixelated {
    image-rendering: pixelated;
  }
</style>

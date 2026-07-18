<script>
  export let src,
    alt = '',
    className = '',
    aspect = '4x4',
    pixelated = false,
    role = '',
    fadeIn = true,
    loading = 'lazy',
    formats = ['webp', 'png'],
    fallback = ''

  import { fade } from 'svelte/transition'

  const [width, height] = aspect.split('x')

  let failed = false
  let fallbackFailed = false
  let previousImageSrc = ''

  $: imageFormats =
    Array.isArray(formats) && formats.length ? formats : ['png']
  $: fallbackFormat =
    imageFormats.find((format) => format !== 'webp') || imageFormats[0]
  $: imageSrc = src ? `${src}.${fallbackFormat}` : ''
  $: webpSrc =
    src && imageFormats.includes('webp') ? `${src}.webp` : ''
  $: if (imageSrc !== previousImageSrc) {
    previousImageSrc = imageSrc
    failed = false
    fallbackFailed = false
  }
  $: displaySrc = failed && fallback ? fallback : imageSrc
  $: showImage = displaySrc && !(failed && (!fallback || fallbackFailed))

  const markImageFailed = (node) => {
    if (fallback && node?.getAttribute('src') === fallback) {
      fallbackFailed = true
    } else {
      failed = true
    }
  }

  const handleError = (event) => markImageFailed(event.currentTarget)

  const validateImage = (node) => {
    let validation = 0

    const checkImage = () => {
      const currentValidation = ++validation

      Promise.resolve().then(() => {
        if (currentValidation !== validation) return

        const expectedSrc = node.currentSrc || node.src
        const handleDecodeError = () => {
          if (currentValidation !== validation) return
          if ((node.currentSrc || node.src) !== expectedSrc) return

          markImageFailed(node)
        }

        if (node.complete) {
          if (node.naturalWidth === 0) handleDecodeError()
          return
        }

        const decoding = node.decode?.()
        decoding?.catch(handleDecodeError)
      })
    }

    checkImage()

    return {
      update: checkImage,
      destroy: () => validation++
    }
  }
</script>

{#if fadeIn}
<picture class={$$restProps.class || ''} in:fade>
  {#if webpSrc && !failed}
    <source srcset={webpSrc} type="image/webp" />
  {/if}
  {#if showImage}
    <img
      class={className}
      class:pixelated={pixelated}
      src={displaySrc}
      {loading}
      {width}
      {height}
      {alt}
      {role}
      on:error={handleError}
      use:validateImage={displaySrc}
    />
  {/if}
</picture>
{:else}
<picture class={$$restProps.class || ''}>
  {#if webpSrc && !failed}
    <source srcset={webpSrc} type="image/webp" />
  {/if}
  {#if showImage}
    <img
      class={className}
      class:pixelated={pixelated}
      src={displaySrc}
      {loading}
      {width}
      {height}
      {alt}
      {role}
      on:error={handleError}
      use:validateImage={displaySrc}
    />
  {/if}
</picture>
{/if}

<style lang="postcss">
  img.pixelated {
    image-rendering: pixelated;
  }
</style>

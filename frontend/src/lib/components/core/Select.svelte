<script>
  import { createEventDispatcher } from 'svelte'
  import Icon from '@iconify/svelte/dist/OfflineIcon.svelte'
  import { Chevron } from '$icons'

  export let name
  export let placeholder = ''
  export let value = ''
  export let options = []
  export let rounded = false
  export let disabled = false
  export let className = ''

  const dispatch = createEventDispatcher()

  name = name || placeholder

  const handleChange = (event) => {
    value = event.currentTarget.value
    dispatch('input', { value, originalEvent: event })
    dispatch('change', { value, originalEvent: event })
  }
</script>

<label for={name}>{name}</label>

<span class="select-wrap {className} {$$restProps.class || ''}">
  <select
    id={name}
    {disabled}
    bind:value
    on:change={handleChange}
    class:rounded-lg={rounded}
  >
    {#if placeholder}
      <option value="" disabled>{placeholder}</option>
    {/if}

    {#each options as option}
      <option value={option.value} disabled={option.disabled}>
        {option.label}
      </option>
    {/each}
  </select>

  <Icon
    inline={true}
    icon={Chevron}
    class="pointer-events-none absolute right-1 top-1/2 z-10 w-6 -translate-y-1/2 rotate-180 transform border-r fill-current text-gray-200 dark:border-gray-500 dark:text-gray-500"
  />
</span>

<style lang="postcss">
  .select-wrap {
    @apply relative inline-flex w-full;
  }

  select {
    @apply h-10 w-full appearance-none border-2 bg-transparent px-3 pr-9 text-xxs text-gray-800 placeholder-gray-400 shadow-sm ring-2 ring-transparent transition-colors focus:outline-none disabled:cursor-default disabled:opacity-40 sm:text-xs;
    background-color: var(--input-bg);
    border-color: theme('colors.gray.200');
  }

  :global(.dark) select {
    @apply text-gray-100 placeholder-gray-500;
    border-color: theme('colors.gray.600');
  }

  @media (hover: hover) {
    select:hover {
      border-color: var(--inp-focus-2, theme('colors.gray.500'));
    }

    :global(.dark) select:hover {
      border-color: var(--inp-focus-2, theme('colors.gray.200'));
    }
  }

  select:focus {
    border-color: var(--inp-focus, theme('colors.black'));
    --tw-ring-color: var(--inp-focus-2, theme('colors.gray.500'));
  }

  :global(.dark) select:focus {
    border-color: var(--inp-focus, theme('colors.white'));
    --tw-ring-color: var(--inp-focus-2, theme('colors.gray.200'));
  }

  label {
    border: 0;
    clip: rect(1px 1px 1px 1px);
    clip: rect(1px, 1px, 1px, 1px);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    width: 1px;
  }
</style>

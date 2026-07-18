<script>
  import Icon from '@iconify/svelte/dist/OfflineIcon.svelte'

  import { authSession } from '$lib/services/auth'
  import { cloudSyncStatus } from '$lib/services/cloud-saves'
  import { Check, CloudUpload, Error, Spinner } from '$icons'

  $: signedIn = $authSession.status === 'authenticated'
  $: status = $cloudSyncStatus.state
  $: title = $cloudSyncStatus.message
</script>

{#if signedIn}
  <span
    class="relative hidden h-12 w-8 flex-shrink-0 items-center justify-center transition sm:inline-flex
      {status === 'error'
      ? 'text-red-600 dark:text-red-300'
      : status === 'synced'
        ? 'text-green-600 dark:text-green-300'
        : 'text-gray-500 dark:text-gray-300'}"
    {title}
    aria-label={title}
  >
    <Icon inline={true} icon={CloudUpload} class="fill-current" />

    {#if status === 'saving' || status === 'loading'}
      <Icon
        inline={true}
        icon={Spinner}
        class="absolute right-0.5 bottom-2 animate-spin rounded-full bg-white text-[10px] fill-current dark:bg-gray-800"
      />
    {:else if status === 'synced'}
      <Icon
        inline={true}
        icon={Check}
        class="absolute right-0.5 bottom-2 rounded-full bg-white text-[10px] fill-current dark:bg-gray-800"
      />
    {:else if status === 'error'}
      <Icon
        inline={true}
        icon={Error}
        class="absolute right-0.5 bottom-2 rounded-full bg-white text-[10px] fill-current dark:bg-gray-800"
      />
    {/if}
  </span>
{/if}

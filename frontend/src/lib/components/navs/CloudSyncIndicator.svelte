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
    class:error={status === 'error'}
    class:synced={status === 'synced'}
    class="cloud-sync-indicator"
    {title}
    aria-label={title}
  >
    <Icon inline={true} icon={CloudUpload} class="fill-current" />

    {#if status === 'saving' || status === 'loading'}
      <Icon inline={true} icon={Spinner} class="animate-spin fill-current" />
    {:else if status === 'synced'}
      <Icon inline={true} icon={Check} class="fill-current" />
    {:else if status === 'error'}
      <Icon inline={true} icon={Error} class="fill-current" />
    {/if}
  </span>
{/if}

<style lang="postcss">
  .cloud-sync-indicator {
    @apply inline-flex h-8 items-center gap-x-1 rounded-lg border border-gray-300 px-2 text-gray-500 transition dark:border-gray-600 dark:text-gray-300;
  }

  .cloud-sync-indicator.synced {
    @apply border-green-200 text-green-600 dark:border-green-700 dark:text-green-300;
  }

  .cloud-sync-indicator.error {
    @apply border-red-200 text-red-600 dark:border-red-700 dark:text-red-300;
  }
</style>

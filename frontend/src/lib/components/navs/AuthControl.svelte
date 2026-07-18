<script>
  import Icon from '@iconify/svelte/dist/OfflineIcon.svelte'

  import { authSession, signIn, signOut } from '$lib/services/auth'
  import { Google, Logout } from '$icons'

  export let compact = false

  $: signedIn = $authSession.status === 'authenticated'
  $: disabled = ['loading', 'exchanging', 'unconfigured'].includes($authSession.status)
  $: userLabel = $authSession.user?.email || $authSession.user?.name || 'Signed in'

  const login = () => signIn(window.location.pathname)
  const logout = () => signOut()
</script>

{#if signedIn}
  {#if compact}
    <button
      class="auth-control compact"
      title="Sign out {userLabel}"
      aria-label="Sign out {userLabel}"
      on:click={logout}
    >
      <Icon inline={true} icon={Logout} class="fill-current" />
    </button>
  {:else}
    <span class="auth-group">
      <span class="auth-control signed-in" title="Signed in as {userLabel}">
        <Icon inline={true} icon={Google} class="fill-current" />
        <span>{userLabel}</span>
      </span>

      <button class="auth-control logout" title="Sign out {userLabel}" on:click={logout}>
        Sign out
      </button>
    </span>
  {/if}
{:else}
  <button
    class:compact
    class="auth-control"
    {disabled}
    title={$authSession.status === 'unconfigured' ? 'Cloud sign-in is not configured' : 'Sign in with Google'}
    on:click={login}
  >
    <Icon inline={true} icon={Google} class="fill-current" />
    <span class:sr-only={compact}>Sign in</span>
  </button>
{/if}

<style lang="postcss">
  .auth-group {
    @apply inline-flex max-w-[18rem] items-center gap-x-1;
  }

  .auth-control {
    @apply inline-flex h-8 max-w-[12rem] items-center gap-x-2 overflow-hidden rounded-lg border border-gray-300 px-2 text-xs text-gray-600 transition hover:border-blue-500 hover:text-blue-600 disabled:cursor-default disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:border-blue-400 dark:hover:text-blue-300;
  }

  .auth-control span:not(.sr-only) {
    @apply truncate;
  }

  .signed-in {
    @apply max-w-[10rem] cursor-default hover:border-gray-300 hover:text-gray-600 dark:hover:border-gray-600 dark:hover:text-gray-300;
  }

  .logout {
    @apply max-w-none;
  }

  .auth-control.compact,
  .auth-group.compact {
    @apply max-w-none;
  }

  .auth-control.compact {
    @apply h-12 w-10 justify-center rounded-none border-0 border-b-2 border-b-transparent px-0 text-base hover:border-b-current;
  }
</style>

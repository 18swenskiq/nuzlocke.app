<script>
  import { onMount } from 'svelte'

  import { completeSignIn } from '$lib/services/auth'
  import { Loader } from '$lib/components/core'

  let error = null

  onMount(async () => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')

    if (!code) {
      error = params.get('error_description') || params.get('error') || 'Missing OAuth code'
      return
    }

    try {
      const target = await completeSignIn(code, state)
      window.location.replace(target)
    } catch (err) {
      console.error('[auth] Sign-in callback failed', err)
      error = err.message || 'Unable to sign in'
    }
  })
</script>

<svelte:head>
  <title>Nuzlocke Tracker | Signing in</title>
</svelte:head>

<main class="container mx-auto flex min-h-screen items-center justify-center px-4 text-center">
  {#if error}
    <section class="max-w-sm rounded-lg bg-white p-6 text-gray-800 shadow-lg dark:bg-gray-900 dark:text-gray-100">
      <h1 class="mb-2 text-xl font-bold">Unable to sign in</h1>
      <p class="mb-4 text-sm opacity-70">{error}</p>
      <a class="underline" href="/saves">Back to saves</a>
    </section>
  {:else}
    <Loader />
  {/if}
</main>

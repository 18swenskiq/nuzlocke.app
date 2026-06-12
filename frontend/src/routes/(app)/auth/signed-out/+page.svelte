<script>
  import { onMount } from 'svelte'

  import { signedOutRedirectTarget } from '$lib/services/auth'

  onMount(() => {
    window.location.replace(signedOutRedirectTarget())
  })
</script>

<svelte:head>
  <title>Nuzlocke Tracker | Signed out</title>
</svelte:head>

<main class="container mx-auto flex min-h-screen items-center justify-center px-4 text-center">
  <p class="text-sm opacity-70">Signed out</p>
</main>

import { dev } from '$app/environment'

const CHUNK_RELOAD_KEY = 'nuzlocke:chunk-reload'
const CHUNK_RELOAD_WINDOW = 30_000

if (!dev) {
  window.addEventListener('vite:preloadError', (event) => {
    const now = Date.now()
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)

    if (now - lastReload < CHUNK_RELOAD_WINDOW) return

    event.preventDefault()
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now))
    window.location.reload()
  })
}

/** @type {import('@sveltejs/kit').HandleClientError} */
export function handleError({ error, event, status, message }) {
  const err = /** @type {Error} */ (error)

  console.error(`[SvelteKit Error] ${status} at ${event?.url?.pathname ?? 'unknown'}:`, err)

  return {
    message: err?.message || message || 'An unexpected error occurred',
    ...(dev && err?.stack ? { stack: err.stack } : {})
  }
}

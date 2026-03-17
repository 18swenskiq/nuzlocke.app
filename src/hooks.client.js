import { dev } from '$app/environment'

/** @type {import('@sveltejs/kit').HandleClientError} */
export function handleError({ error, event, status, message }) {
  const err = /** @type {Error} */ (error)

  console.error(`[SvelteKit Error] ${status} at ${event?.url?.pathname ?? 'unknown'}:`, err)

  return {
    message: err?.message || message || 'An unexpected error occurred',
    ...(dev && err?.stack ? { stack: err.stack } : {})
  }
}

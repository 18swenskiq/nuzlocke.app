import { browser } from '$app/environment'
import { get, writable } from 'svelte/store'

const AUTH_CONFIG_URL = '/auth-config.json'
const TOKEN_STORAGE_KEY = 'nuzlocke.auth.tokens'
const CODE_VERIFIER_KEY = 'nuzlocke.auth.codeVerifier'
const OAUTH_STATE_KEY = 'nuzlocke.auth.state'
const RETURN_TO_KEY = 'nuzlocke.auth.returnTo'
const TOKEN_REFRESH_SKEW_MS = 60 * 1000

let configPromise
let initPromise
let authConfigValue = null

export const authConfig = writable(null)
export const authSession = writable({
  status: browser ? 'loading' : 'signed-out',
  user: null,
  tokens: null,
  error: null
})

export const initAuth = () => {
  if (!browser) return Promise.resolve(null)
  if (!initPromise) {
    initPromise = loadAuthConfig().then(async (config) => {
      if (!config) {
        authSession.set({
          status: 'unconfigured',
          user: null,
          tokens: null,
          error: null
        })
        return null
      }

      const tokens = readTokens()
      if (!tokens) {
        setSignedOut()
        return config
      }

      try {
        const freshTokens = await refreshIfNeeded(tokens)
        setAuthenticated(freshTokens)
      } catch (error) {
        console.error('[auth] Unable to restore session', error)
        clearTokens()
        setSignedOut()
      }

      return config
    })
  }

  return initPromise
}

export const loadAuthConfig = () => {
  if (!browser) return Promise.resolve(null)
  if (!configPromise) {
    configPromise = fetch(AUTH_CONFIG_URL, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((config) => {
        authConfigValue = config
        authConfig.set(config)
        return config
      })
      .catch((error) => {
        console.warn('[auth] Auth config unavailable', error)
        authConfigValue = null
        authConfig.set(null)
        return null
      })
  }

  return configPromise
}

export const signIn = async (returnTo = window.location.pathname) => {
  const config = await loadAuthConfig()
  if (!config) return

  const state = randomString()
  const codeVerifier = randomString()
  const codeChallenge = await createCodeChallenge(codeVerifier)

  window.localStorage.setItem(OAUTH_STATE_KEY, state)
  window.localStorage.setItem(CODE_VERIFIER_KEY, codeVerifier)
  window.localStorage.setItem(RETURN_TO_KEY, returnTo)

  const params = new URLSearchParams({
    client_id: config.clientId,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    identity_provider: 'Google',
    redirect_uri: callbackUri(),
    response_type: 'code',
    scope: (config.scopes || ['openid', 'email', 'profile']).join(' '),
    state
  })

  window.location.assign(`${config.cognitoDomain}/oauth2/authorize?${params}`)
}

export const completeSignIn = async (code, state) => {
  const config = await loadAuthConfig()
  if (!config) throw new Error('Authentication is not configured')

  const expectedState = window.localStorage.getItem(OAUTH_STATE_KEY)
  const codeVerifier = window.localStorage.getItem(CODE_VERIFIER_KEY)

  if (!state || state !== expectedState || !codeVerifier) {
    throw new Error('OAuth state could not be verified')
  }

  authSession.set({
    status: 'exchanging',
    user: null,
    tokens: null,
    error: null
  })

  const params = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: callbackUri()
  })

  const tokens = await requestTokens(params)
  storeTokens(tokens)
  window.localStorage.removeItem(OAUTH_STATE_KEY)
  window.localStorage.removeItem(CODE_VERIFIER_KEY)
  setAuthenticated(tokens)

  return window.localStorage.getItem(RETURN_TO_KEY) || '/saves'
}

export const signedOutRedirectTarget = () => {
  if (!browser) return '/'
  window.localStorage.removeItem(RETURN_TO_KEY)
  return '/saves'
}

export const signOut = async () => {
  const config = await loadAuthConfig()
  clearTokens()
  setSignedOut()

  if (!config) return

  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: `${window.location.origin}/auth/signed-out`
  })

  window.location.assign(`${config.cognitoDomain}/logout?${params}`)
}

export const getAuthToken = async () => {
  await initAuth()

  const session = get(authSession)
  if (session.status !== 'authenticated' || !session.tokens) {
    throw new Error('Not signed in')
  }

  const tokens = await refreshIfNeeded(session.tokens)
  if (tokens !== session.tokens) {
    setAuthenticated(tokens)
  }

  return tokens.id_token
}

export const getApiBaseUrl = () => authConfigValue?.apiBaseUrl || '/api'

const requestTokens = async (params) => {
  const config = await loadAuthConfig()
  const res = await fetch(`${config.cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  })

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status}`)
  }

  const tokens = await res.json()
  return {
    ...tokens,
    expires_at: Date.now() + tokens.expires_in * 1000
  }
}

const refreshIfNeeded = async (tokens) => {
  if (!tokens?.refresh_token || Date.now() < tokens.expires_at - TOKEN_REFRESH_SKEW_MS) {
    return tokens
  }

  const config = await loadAuthConfig()
  const refreshed = await requestTokens(
    new URLSearchParams({
      client_id: config.clientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token
    })
  )

  const nextTokens = {
    ...refreshed,
    refresh_token: refreshed.refresh_token || tokens.refresh_token
  }
  storeTokens(nextTokens)
  return nextTokens
}

const setAuthenticated = (tokens) => {
  authSession.set({
    status: 'authenticated',
    user: userFromIdToken(tokens.id_token),
    tokens,
    error: null
  })
}

const setSignedOut = () => {
  authSession.set({
    status: 'signed-out',
    user: null,
    tokens: null,
    error: null
  })
}

const callbackUri = () => `${window.location.origin}/auth/callback`

const readTokens = () => {
  try {
    return JSON.parse(window.localStorage.getItem(TOKEN_STORAGE_KEY))
  } catch (_) {
    return null
  }
}

const storeTokens = (tokens) => {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens))
}

const clearTokens = () => {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(CODE_VERIFIER_KEY)
  window.localStorage.removeItem(OAUTH_STATE_KEY)
}

const userFromIdToken = (token) => {
  const claims = decodeJwt(token)
  return {
    sub: claims.sub,
    email: claims.email,
    name: claims.name || claims.given_name || claims.email,
    picture: claims.picture
  }
}

const decodeJwt = (token) => {
  const payload = token.split('.')[1]
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
  return JSON.parse(
    decodeURIComponent(
      json
        .split('')
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    )
  )
}

const createCodeChallenge = async (codeVerifier) => {
  const data = new TextEncoder().encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64Url(digest)
}

const randomString = () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

const base64Url = (data) => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

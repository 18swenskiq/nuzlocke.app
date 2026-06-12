import { browser } from '$app/environment'
import { get, writable } from 'svelte/store'

import {
  IDS,
  activeGame,
  format,
  getGameStore,
  parseSavedGames,
  savedGames
} from '$lib/store'
import { getApiBaseUrl, getAuthToken, initAuth, authSession } from './auth'
import { toSaveFile } from './save-file'

const SAVE_DEBOUNCE_MS = 800

let initPromise
let activeUserId = null
let paused = false
let pendingWrites = 0
let savedGamesUnsub = null
let gameUnsubs = new Map()
let timers = new Map()
let knownSaves = {}
let knownIds = new Set()

export const cloudSyncStatus = writable({
  state: browser ? 'signed-out' : 'unavailable',
  message: 'Cloud saves are off'
})

export const initCloudSync = () => {
  if (!browser) return Promise.resolve()
  if (!initPromise) {
    initPromise = initAuth().then(() => {
      authSession.subscribe((session) => {
        if (session.status === 'authenticated') {
          startForUser(session.user?.sub).catch((error) => {
            console.error('[cloud-sync] Unable to start cloud sync', error)
            setError('Unable to sync cloud saves')
          })
          return
        }

        if (['signed-out', 'unconfigured'].includes(session.status)) {
          stopWatchers()
          activeUserId = null
          cloudSyncStatus.set({
            state: session.status,
            message:
              session.status === 'unconfigured'
                ? 'Cloud saves are not configured'
                : 'Cloud saves are off'
          })
        }
      })
    })
  }

  return initPromise
}

export const syncSaveNow = (saveId) => {
  const save = knownSaves[saveId]
  if (!save) return Promise.resolve()
  const payload = window.localStorage.getItem(IDS.game(saveId)) || '{}'
  return uploadSave(save, payload)
}

const startForUser = async (userId) => {
  if (!userId || activeUserId === userId) return

  stopWatchers()
  activeUserId = userId
  cloudSyncStatus.set({ state: 'loading', message: 'Loading cloud saves' })

  const localSaves = readLocalSaves()
  const remoteSaves = await fetchRemoteSaves()

  if (remoteSaves.length) {
    hydrateLocalSaves(remoteSaves)
  } else if (localSaves.length) {
    await Promise.all(
      localSaves.map(({ save, data }) => uploadSave(save, JSON.stringify(data)))
    )
  }

  startWatchers()
  setSynced()
}

const startWatchers = () => {
  let firstSavedGamesEmission = true

  savedGamesUnsub = savedGames.subscribe((raw) => {
    if (paused) return

    const saves = parseSavedGames(raw)
    const ids = new Set(Object.keys(saves))
    knownSaves = saves

    if (firstSavedGamesEmission) {
      firstSavedGamesEmission = false
      knownIds = ids
      for (const id of ids) watchGame(id)
      return
    }

    for (const id of knownIds) {
      if (!ids.has(id)) {
        unwatchGame(id)
        deleteRemoteSave(id).catch((error) => {
          console.error('[cloud-sync] Unable to delete remote save', id, error)
          setError('Unable to delete cloud save')
        })
      }
    }

    for (const id of ids) {
      watchGame(id)
      scheduleUpload(id)
    }

    knownIds = ids
  })
}

const watchGame = (id) => {
  if (gameUnsubs.has(id)) return

  let firstGameEmission = true
  const unsubscribe = getGameStore(id).subscribe((payload) => {
    if (paused) return
    if (firstGameEmission) {
      firstGameEmission = false
      return
    }

    scheduleUpload(id, payload)
  })

  gameUnsubs.set(id, unsubscribe)
}

const unwatchGame = (id) => {
  clearTimeout(timers.get(id))
  timers.delete(id)
  gameUnsubs.get(id)?.()
  gameUnsubs.delete(id)
}

const stopWatchers = () => {
  savedGamesUnsub?.()
  savedGamesUnsub = null

  for (const id of gameUnsubs.keys()) unwatchGame(id)
  gameUnsubs = new Map()
  knownSaves = {}
  knownIds = new Set()
}

const scheduleUpload = (id, payload = null) => {
  const save = knownSaves[id]
  if (!save) return

  clearTimeout(timers.get(id))
  timers.set(
    id,
    setTimeout(() => {
      const nextPayload =
        payload ?? window.localStorage.getItem(IDS.game(id)) ?? '{}'
      uploadSave(save, nextPayload).catch((error) => {
        console.error('[cloud-sync] Unable to upload save', id, error)
        setError('Unable to save to cloud')
      })
    }, SAVE_DEBOUNCE_MS)
  )
}

const fetchRemoteSaves = async () => {
  const res = await apiFetch('/saves')
  const { saves = [] } = await res.json()
  return saves.filter((item) => item.save?.id)
}

const hydrateLocalSaves = (remoteSaves) => {
  paused = true

  const saves = remoteSaves.map(({ save }) => save)
  const firstSave = saves[0]

  for (const { save, data } of remoteSaves) {
    const payload = JSON.stringify(data || {})
    window.localStorage.setItem(IDS.game(save.id), payload)
    getGameStore(save.id).set(payload)
  }

  savedGames.set(saves.map(format).join(','))

  const currentActive = window.localStorage.getItem(IDS.active)
  if (!currentActive || !saves.some((save) => save.id === currentActive)) {
    activeGame.set(firstSave?.id || '')
  }

  paused = false
}

const readLocalSaves = () => {
  const saves = Object.values(parseSavedGames(window.localStorage.getItem(IDS.saves)))
  return saves.map((save) => {
    let data = {}
    try {
      data = JSON.parse(window.localStorage.getItem(IDS.game(save.id)) || '{}')
    } catch (_) {
      data = {}
    }

    return { save, data }
  })
}

const uploadSave = async (save, payload) => {
  if (!get(authSession).user) return

  beginSave()
  try {
    await apiFetch(`/saves/${encodeURIComponent(save.id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: toSaveFile(save, payload)
    })
    endSave()
  } catch (error) {
    endSave(error)
    throw error
  }
}

const deleteRemoteSave = async (id) => {
  if (!get(authSession).user) return

  beginSave()
  try {
    await apiFetch(`/saves/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
    endSave()
  } catch (error) {
    endSave(error)
    throw error
  }
}

const apiFetch = async (path, options = {}) => {
  const token = await getAuthToken()
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  })

  if (!res.ok) {
    throw new Error(`Cloud save request failed: ${res.status}`)
  }

  return res
}

const beginSave = () => {
  pendingWrites += 1
  cloudSyncStatus.set({ state: 'saving', message: 'Saving to cloud' })
}

const endSave = (error = null) => {
  pendingWrites = Math.max(0, pendingWrites - 1)
  if (error) {
    setError('Cloud save failed')
    return
  }

  if (pendingWrites === 0) setSynced()
}

const setSynced = () => {
  cloudSyncStatus.set({ state: 'synced', message: 'Cloud save synced' })
}

const setError = (message) => {
  cloudSyncStatus.set({ state: 'error', message })
}

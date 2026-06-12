import { detectRandomizerCapabilities } from './capabilities'

export const createRandomizerClient = () => {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Workers are not available in this browser')
  }

  const worker = new Worker(new URL('./worker.js', import.meta.url), {
    type: 'module'
  })
  const pending = new Map()
  let nextId = 1

  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    if (data.ok) request.resolve(data.payload)
    else request.reject(Object.assign(new Error(data.error?.message || 'Randomizer worker failed'), data.error))
  }

  worker.onerror = (event) => {
    for (const request of pending.values()) {
      request.reject(new Error(event.message || 'Randomizer worker crashed'))
    }
    pending.clear()
  }

  const call = (type, payload, transfer) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, type, payload }, transfer || [])
    })

  return {
    capabilities: detectRandomizerCapabilities(),
    inspectRom: (payload) => call('inspectRom', payload),
    getSettingsSchema: (payload) => call('getSettingsSchema', payload),
    randomize: (payload) => call('randomize', payload),
    cancel: (jobId) => call('cancel', { jobId }),
    destroy: () => {
      worker.terminate()
      pending.clear()
    }
  }
}

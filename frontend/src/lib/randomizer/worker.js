import { randomizerDefaults, randomizerOptionGroups, UPRZX_PROJECT } from './options'

const jobs = new Map()

self.onmessage = async ({ data }) => {
  const { id, type, payload } = data
  try {
    const result = await handleMessage(type, payload || {})
    self.postMessage({ id, ok: true, payload: result })
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: serializeError(error)
    })
  }
}

const handleMessage = async (type, payload) => {
  switch (type) {
    case 'inspectRom':
      return inspectRom(payload)
    case 'getSettingsSchema':
      return getSettingsSchema(payload)
    case 'randomize':
      return randomize(payload)
    case 'cancel':
      return cancel(payload.jobId)
    default:
      throw workerError('UNKNOWN_MESSAGE', `Unknown randomizer worker message: ${type}`)
  }
}

const inspectRom = async ({ rom, update }) => {
  if (!rom) throw workerError('ROM_REQUIRED', 'A ROM file is required')
  const extension = extensionFor(rom.name)
  const supportedExtensions = ['gb', 'gbc', 'gba', 'nds', '3ds', 'cia', 'cxi', 'cci']
  if (!supportedExtensions.includes(extension)) {
    throw workerError('UNSUPPORTED_EXTENSION', 'Unsupported ROM file extension', { extension })
  }

  const [sha256, header] = await Promise.all([hashFile(rom), readHeader(rom)])
  const updateSha256 = update ? await hashFile(update) : null

  return {
    name: rom.name,
    size: rom.size,
    sizeLabel: formatBytes(rom.size),
    extension,
    lastModified: rom.lastModified,
    sha256,
    container: detectContainer(extension, header),
    likelyGeneration: generationForExtension(extension),
    requiresLayeredFs: !!update && ['3ds', 'cia', 'cxi', 'cci'].includes(extension),
    update: update
      ? {
          name: update.name,
          size: update.size,
          sizeLabel: formatBytes(update.size),
          extension: extensionFor(update.name),
          sha256: updateSha256
        }
      : null
  }
}

const getSettingsSchema = async ({ romInfo } = {}) => ({
  engine: {
    ...UPRZX_PROJECT,
    adapter: 'web-adapter-0.1.0'
  },
  defaults: randomizerDefaults,
  groups: randomizerOptionGroups.map((group) => ({
    ...group,
    options: group.options.map((option) => ({
      ...option,
      disabled: isUnsupportedOption(option.id, romInfo)
    }))
  })),
  validation: validationFor(romInfo)
})

const randomize = async ({ jobId = crypto.randomUUID?.() || String(Date.now()), rom, settings, seed, outputMode }) => {
  if (!rom) throw workerError('ROM_REQUIRED', 'A ROM file is required')
  const controller = new AbortController()
  jobs.set(jobId, controller)

  try {
    await assertRuntimeAvailable()
    if (controller.signal.aborted) throw workerError('CANCELLED', 'Randomization was cancelled')

    throw workerError(
      'UPRZX_WASM_NOT_BOUND',
      'The UPR-ZX WebAssembly runtime exists check passed, but the JS binding has not been wired yet.',
      {
        settings,
        seed,
        outputMode
      }
    )
  } finally {
    jobs.delete(jobId)
  }
}

const cancel = async (jobId) => {
  const job = jobs.get(jobId)
  if (job) {
    job.abort()
    jobs.delete(jobId)
  }
  return { cancelled: !!job }
}

const assertRuntimeAvailable = async () => {
  const runtimeUrl = new URL('/randomizer/generated/uprzx.wasm', self.location.origin)
  const response = await fetch(runtimeUrl, { method: 'HEAD' })
  if (!response.ok) {
    throw workerError(
      'UPRZX_WASM_UNAVAILABLE',
      'The UPR-ZX WebAssembly runtime has not been built yet.',
      {
        runtimeUrl: runtimeUrl.toString()
      }
    )
  }
}

const hashFile = async (file) => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const readHeader = async (file) => new Uint8Array(await file.slice(0, 16).arrayBuffer())

const detectContainer = (extension, header) => {
  if (header[0] === 0x50 && header[1] === 0x4b) return 'archive'
  if (extension === 'nds') return 'nds'
  if (extension === '3ds' || extension === 'cia' || extension === 'cxi' || extension === 'cci') return 'ctr'
  if (extension === 'gba') return 'gba'
  if (extension === 'gb' || extension === 'gbc') return 'gb'
  return 'unknown'
}

const generationForExtension = (extension) => {
  if (extension === 'gb' || extension === 'gbc') return [1, 2]
  if (extension === 'gba') return [3]
  if (extension === 'nds') return [4, 5]
  if (extension === '3ds' || extension === 'cia' || extension === 'cxi' || extension === 'cci') return [6, 7]
  return []
}

const validationFor = (romInfo) => {
  const warnings = []
  if (romInfo?.requiresLayeredFs) {
    warnings.push({
      code: 'UPDATE_REQUIRES_LAYEREDFS',
      message: '3DS game updates require LayeredFS output.'
    })
  }
  return { warnings }
}

const isUnsupportedOption = (id, romInfo) => {
  if (!romInfo) return false
  const extension = romInfo.extension
  if (id === 'totems' && !['3ds', 'cia', 'cxi', 'cci'].includes(extension)) return true
  return false
}

const extensionFor = (name = '') => name.split('.').pop()?.toLowerCase() || ''

const formatBytes = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

const workerError = (code, message, details = {}) => Object.assign(new Error(message), { code, details })

const serializeError = (error) => ({
  code: error.code || 'RANDOMIZER_WORKER_ERROR',
  message: error.message || String(error),
  details: error.details || {}
})

import { randomizerDefaults, randomizerOptionGroups, UPRZX_PROJECT } from './options'

const jobs = new Map()
const randomizerBaseUrl = '/randomizer/generated/'
const randomizerWasmUrl = `${randomizerBaseUrl}uprzx.wasm`
const randomizerRuntimeUrl = `${randomizerBaseUrl}uprzx.wasm-runtime.js`
let runtimePromise = null

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

const randomize = async ({
  jobId = crypto.randomUUID?.() || String(Date.now()),
  rom,
  update,
  settings,
  seed,
  outputMode = 'single-file'
}) => {
  if (!rom) throw workerError('ROM_REQUIRED', 'A ROM file is required')
  const controller = new AbortController()
  jobs.set(jobId, controller)

  try {
    const runtime = await getRuntime()
    if (controller.signal.aborted) throw workerError('CANCELLED', 'Randomization was cancelled')

    const vfs = createVirtualFileSystem()
    globalThis.__uprzxVfs = vfs

    const sourceRomPath = vfsPath('/input', rom.name)
    await vfs.writeBlob(sourceRomPath, rom)

    const updatePath = update ? vfsPath('/input', `update-${update.name}`) : ''
    if (update) {
      await vfs.writeBlob(updatePath, update)
    }

    const inspection = parseBridgeJson(
      callBridge('inspect ROM', () => runtime.bridge.inspectRom(sourceRomPath)),
      'inspect ROM'
    )
    if (!inspection.ok || !inspection.supported) {
      throw workerError('UPRZX_UNSUPPORTED_ROM', 'UPR-ZX could not identify this ROM.', {
        inspection
      })
    }

    const saveAsDirectory =
      outputMode === 'layeredfs-directory' ||
      outputMode === 'layeredfs-archive' ||
      (inspection.nintendo3ds && !!update)
    const outputPath = saveAsDirectory
      ? vfsPath('/output', `${baseName(rom.name)}-layeredfs`)
      : vfsPath('/output', `${baseName(rom.name)}.randomized.${inspection.defaultExtension || extensionFor(rom.name) || 'rom'}`)
    const resolvedSettings = resolveSettingsString(settings, runtime.bridge)
    const seedLong = seedToLong(seed || settings?.seed)

    const response = parseBridgeJson(
      callBridge('randomize ROM', () =>
        runtime.bridge.randomize(
          sourceRomPath,
          updatePath,
          outputPath,
          resolvedSettings.value,
          seedLong,
          saveAsDirectory
        )
      ),
      'randomize ROM'
    )

    if (!response.ok) {
      throw workerError('UPRZX_RANDOMIZE_FAILED', response.error || 'UPR-ZX randomization failed.', {
        log: response.log || null
      })
    }

    if (controller.signal.aborted) throw workerError('CANCELLED', 'Randomization was cancelled')

    return {
      engineVersion: response.engineVersion || UPRZX_PROJECT.version,
      settingsString: response.settingsString || resolvedSettings.value,
      settingsSource: resolvedSettings.source,
      checkValue: response.checkValue,
      log: response.log || '',
      changedStarter: response.changedStarter,
      removedCodeTweaks: response.removedCodeTweaks,
      output: saveAsDirectory
        ? directoryOutput(vfs, response.outputPath || outputPath, rom.name, outputMode)
        : fileOutput(vfs, response.outputPath || outputPath, rom.name),
      extractedData: response.extractedData || null,
      warnings: [
        ...(resolvedSettings.source === 'upr-zx-default'
          ? [
              {
                code: 'UPRZX_DEFAULT_SETTINGS_USED',
                message:
                  'The browser runtime used upstream UPR-ZX default settings because no canonical settings string was supplied.'
              }
            ]
          : []),
        ...((Array.isArray(response.extractedData?.warnings) && response.extractedData.warnings) || [])
      ]
    }
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

const getRuntime = async () => {
  runtimePromise ||= loadRuntime().catch((error) => {
    runtimePromise = null
    throw error
  })
  return runtimePromise
}

const loadRuntime = async () => {
  await assertRuntimeAvailable()
  const runtimeModule = await runtimeStage('import runtime loader', () =>
    import(/* @vite-ignore */ absoluteRuntimeUrl(randomizerRuntimeUrl))
  )
  const load = runtimeModule.load || runtimeModule.default?.load || runtimeModule.default
  if (typeof load !== 'function') {
    throw workerError('UPRZX_RUNTIME_LOADER_UNAVAILABLE', 'The UPR-ZX TeaVM loader did not expose a load function.', {
      runtimeUrl: absoluteRuntimeUrl(randomizerRuntimeUrl),
      exports: Object.keys(runtimeModule)
    })
  }

  const teavm = await runtimeStage('instantiate WebAssembly module', () =>
    load(absoluteRuntimeUrl(randomizerWasmUrl), {
      stackDeobfuscator: { enabled: false }
    })
  )
  if (typeof teavm?.exports?.main !== 'function') {
    throw workerError('UPRZX_RUNTIME_MAIN_UNAVAILABLE', 'The UPR-ZX WebAssembly runtime did not expose main().', {
      runtimeUrl: absoluteRuntimeUrl(randomizerRuntimeUrl),
      exports: Object.keys(teavm?.exports || {})
    })
  }

  await runtimeStage('initialize Java exports', () => teavm.exports.main([]))
  const bridge = createExportBridge(teavm.exports) || globalThis.__uprzxBridge
  if (!bridge?.inspectRom || !bridge?.randomize || !bridge?.settingsStringFromUi || !bridge?.defaultSettingsString) {
    throw workerError('UPRZX_BRIDGE_UNAVAILABLE', 'The UPR-ZX WebAssembly runtime did not expose the browser bridge.', {
      exports: Object.keys(teavm?.exports || {}),
      hasLegacyBridge: !!globalThis.__uprzxBridge
    })
  }

  return { teavm, bridge }
}

const runtimeStage = async (stage, task) => {
  try {
    return await task()
  } catch (error) {
    if (error?.code?.startsWith?.('UPRZX_')) throw error
    throw workerError('UPRZX_RUNTIME_LOAD_FAILED', `UPR-ZX runtime failed during ${stage}: ${error.message || String(error)}`, {
      stage,
      cause: serializeNativeError(error),
      runtimeUrl: absoluteRuntimeUrl(randomizerRuntimeUrl),
      wasmUrl: absoluteRuntimeUrl(randomizerWasmUrl)
    })
  }
}

const createExportBridge = (runtimeExports = {}) => {
  const bridge = {
    defaultSettingsString: runtimeExports.defaultSettingsString,
    inspectRom: runtimeExports.inspectRom,
    settingsStringFromUi: runtimeExports.settingsStringFromUi,
    randomize: runtimeExports.randomize
  }
  return Object.values(bridge).every((value) => typeof value === 'function') ? bridge : null
}

const assertRuntimeAvailable = async () => {
  await Promise.all([
    assertRuntimeFile(randomizerWasmUrl, 'UPRZX_WASM_UNAVAILABLE', 'The UPR-ZX WebAssembly runtime has not been built yet.'),
    assertRuntimeFile(
      randomizerRuntimeUrl,
      'UPRZX_WASM_RUNTIME_UNAVAILABLE',
      'The UPR-ZX WebAssembly runtime loader has not been built yet.'
    )
  ])
}

const assertRuntimeFile = async (path, code, message) => {
  const runtimeUrl = new URL(path, self.location.origin)
  const response = await fetch(runtimeUrl, { method: 'HEAD' })
  if (!response.ok) {
    throw workerError(
      code,
      message,
      {
        runtimeUrl: runtimeUrl.toString()
      }
    )
  }
}

const absoluteRuntimeUrl = (path) => new URL(path, self.location.origin).toString()

const createVirtualFileSystem = () => {
  const entries = new Map([['/', { type: 'directory' }]])

  const normalize = (path = '/') => {
    const value = String(path || '/').replace(/\\/g, '/')
    const parts = []
    for (const part of value.split('/')) {
      if (!part || part === '.') continue
      if (part === '..') parts.pop()
      else parts.push(part)
    }
    return `/${parts.join('/')}` || '/'
  }

  const parentPath = (path) => {
    const normalized = normalize(path)
    const slash = normalized.lastIndexOf('/')
    return slash <= 0 ? '/' : normalized.slice(0, slash)
  }

  const ensureDirectory = (path) => {
    const normalized = normalize(path)
    if (entries.get(normalized)?.type === 'file') {
      throw new Error(`VFS path is a file: ${normalized}`)
    }
    const parts = normalized.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += `/${part}`
      if (!entries.has(current)) entries.set(current, { type: 'directory' })
      if (entries.get(current)?.type !== 'directory') {
        throw new Error(`VFS path is a file: ${current}`)
      }
    }
  }

  const ensureFile = (path) => {
    const normalized = normalize(path)
    ensureDirectory(parentPath(normalized))
    const existing = entries.get(normalized)
    if (!existing) entries.set(normalized, { type: 'file', bytes: new Uint8Array(0) })
    else if (existing.type !== 'file') throw new Error(`VFS path is a directory: ${normalized}`)
  }

  const bytesFrom = (value) => {
    if (value instanceof Uint8Array) return new Uint8Array(value)
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
    }
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0))
    return new Uint8Array(value || [])
  }

  const fileEntry = (path) => {
    const normalized = normalize(path)
    const entry = entries.get(normalized)
    if (!entry || entry.type !== 'file') throw new Error(`VFS file not found: ${normalized}`)
    return entry
  }

  const api = {
    exists: (path) => entries.has(normalize(path)),
    isFile: (path) => entries.get(normalize(path))?.type === 'file',
    isDirectory: (path) => entries.get(normalize(path))?.type === 'directory',
    length: (path) => {
      const entry = entries.get(normalize(path))
      return entry?.type === 'file' ? entry.bytes.length : 0
    },
    read: (path, position, length) => {
      const entry = fileEntry(path)
      const start = Math.max(0, Number(position) || 0)
      const end = Math.min(entry.bytes.length, start + Math.max(0, Number(length) || 0))
      return entry.bytes.slice(start, end)
    },
    write: (path, position, data) => {
      const normalized = normalize(path)
      ensureFile(normalized)
      const entry = fileEntry(normalized)
      const start = Math.max(0, Number(position) || 0)
      const bytes = bytesFrom(data)
      const nextLength = Math.max(entry.bytes.length, start + bytes.length)
      const next = new Uint8Array(nextLength)
      next.set(entry.bytes)
      next.set(bytes, start)
      entry.bytes = next
    },
    writeAll: (path, data) => {
      const normalized = normalize(path)
      ensureDirectory(parentPath(normalized))
      entries.set(normalized, { type: 'file', bytes: bytesFrom(data) })
    },
    writeBlob: async (path, blob) => {
      api.writeAll(path, new Uint8Array(await blob.arrayBuffer()))
    },
    delete: (path) => {
      const normalized = normalize(path)
      for (const key of [...entries.keys()]) {
        if (key === normalized || key.startsWith(`${normalized}/`)) entries.delete(key)
      }
    },
    mkdirs: ensureDirectory,
    list: (path) => {
      const normalized = normalize(path)
      const prefix = normalized === '/' ? '/' : `${normalized}/`
      return [...entries.keys()].filter((key) => key !== normalized && key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
    },
    ensureFile,
    setLength: (path, length) => {
      const normalized = normalize(path)
      ensureFile(normalized)
      const entry = fileEntry(normalized)
      const next = new Uint8Array(Math.max(0, Number(length) || 0))
      next.set(entry.bytes.slice(0, next.length))
      entry.bytes = next
    },
    readAll: (path) => fileEntry(path).bytes.slice(),
    filesUnder: (path) => {
      const normalized = normalize(path)
      const prefix = normalized === '/' ? '/' : `${normalized}/`
      return [...entries.entries()]
        .filter(([key, entry]) => entry.type === 'file' && (key === normalized || key.startsWith(prefix)))
        .map(([key, entry]) => ({
          path: key,
          name: key === normalized ? fileName(key) : key.slice(prefix.length),
          blob: new Blob([entry.bytes], { type: 'application/octet-stream' }),
          size: entry.bytes.length
        }))
    },
    normalize
  }

  return api
}

const fileOutput = (vfs, outputPath, originalName) => {
  const normalizedOutputPath = vfs.normalize(outputPath)
  const bytes = vfs.readAll(normalizedOutputPath)
  return {
    mode: 'single-file',
    path: normalizedOutputPath,
    filename: fileName(normalizedOutputPath) || defaultOutputName(originalName),
    type: 'application/octet-stream',
    blob: new Blob([bytes], { type: 'application/octet-stream' }),
    size: bytes.length
  }
}

const directoryOutput = (vfs, outputPath, originalName, outputMode) => {
  const normalizedOutputPath = vfs.normalize(outputPath)
  let entries = vfs.filesUnder(normalizedOutputPath)
  if (!entries.length) entries = vfs.filesUnder('/output')
  if (!entries.length) {
    throw workerError('UPRZX_OUTPUT_MISSING', 'UPR-ZX finished but did not create any output files.', {
      outputPath: normalizedOutputPath
    })
  }

  return {
    mode: outputMode,
    path: normalizedOutputPath,
    filename: `${baseName(originalName)}-layeredfs.tar`,
    archiveFormat: 'tar',
    entries,
    size: entries.reduce((total, entry) => total + (entry.size || 0), 0)
  }
}

const parseBridgeJson = (value, action) => {
  try {
    return JSON.parse(value)
  } catch (error) {
    throw workerError('UPRZX_BRIDGE_JSON_ERROR', `Could not parse UPR-ZX ${action} response.`, {
      response: value,
      cause: error.message
    })
  }
}

const callBridge = (action, task) => {
  try {
    return task()
  } catch (error) {
    if (error?.code?.startsWith?.('UPRZX_')) throw error
    throw workerError('UPRZX_BRIDGE_CALL_FAILED', `UPR-ZX failed while trying to ${action}.`, {
      action,
      cause: serializeNativeError(error)
    })
  }
}

const resolveSettingsString = (settings, bridge) => {
  const value =
    (typeof settings === 'string' && settings) ||
    settings?.settingsString ||
    settings?.uprzxSettings ||
    settings?.string ||
    settings?.canonical

  if (value) return { value, source: 'provided' }
  if (settings && typeof settings === 'object') {
    const response = parseBridgeJson(
      callBridge('encode settings', () => bridge.settingsStringFromUi(JSON.stringify(settings))),
      'encode settings'
    )
    if (!response.ok) {
      throw workerError('UPRZX_SETTINGS_ENCODE_FAILED', response.error || 'Could not encode randomizer settings.', {
        settings
      })
    }
    return { value: response.settingsString, source: 'ui-json' }
  }
  return { value: callBridge('load default settings', () => bridge.defaultSettingsString()), source: 'upr-zx-default' }
}

const seedToLong = (seed) => {
  const value = String(seed ?? '').trim()
  if (/^-?\d+$/.test(value)) return clampSignedLong(BigInt(value))
  if (value) return hashStringToLong(value)

  const random = new Uint32Array(2)
  crypto.getRandomValues(random)
  return clampSignedLong((BigInt(random[0]) << 32n) | BigInt(random[1]))
}

const hashStringToLong = (value) => {
  let hash = 0xcbf29ce484222325n
  for (const char of value) {
    hash ^= BigInt(char.codePointAt(0))
    hash *= 0x100000001b3n
  }
  return clampSignedLong(hash)
}

const clampSignedLong = (value) => value & ((1n << 63n) - 1n)

const vfsPath = (directory, name) => `/${[directory, safeVfsName(name)].join('/').replace(/\/+/g, '/')}`

const safeVfsName = (name = 'rom') => String(name).replace(/[^a-zA-Z0-9._-]+/g, '_') || 'rom'

const baseName = (name = 'randomized') => {
  const cleanName = safeVfsName(name)
  const dot = cleanName.lastIndexOf('.')
  return dot > 0 ? cleanName.slice(0, dot) : cleanName
}

const fileName = (path = '') => String(path).replace(/\\/g, '/').split('/').filter(Boolean).pop() || ''

const defaultOutputName = (filename = 'randomized.rom') => {
  const dot = filename.lastIndexOf('.')
  if (dot < 1) return `${filename}.randomized`
  return `${filename.slice(0, dot)}.randomized${filename.slice(dot)}`
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

const serializeNativeError = (error) => {
  if (!error || typeof error !== 'object') {
    return {
      name: 'Error',
      message: String(error),
      stack: null
    }
  }

  return {
    code: error.code || null,
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: error.stack || null,
    details: error.details || null,
    cause: error.cause ? serializeNativeError(error.cause) : null
  }
}

const serializeError = (error) => ({
  code: error.code || 'RANDOMIZER_WORKER_ERROR',
  name: error.name || 'Error',
  message: error.message || String(error),
  stack: error.stack || null,
  details: error.details || {}
})

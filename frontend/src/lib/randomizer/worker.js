import { UPRZX_PROJECT } from './options'

const jobs = new Map()
const randomizerBaseUrl = '/randomizer/generated/'
const randomizerWasmUrl = `${randomizerBaseUrl}uprzx.wasm`
const randomizerRuntimeUrl = `${randomizerBaseUrl}uprzx.wasm-runtime.js`
const randomizerResourceManifestUrl = '/randomizer/resources/uprzx-resources.json'
const appVersionUrl = '/_app/version.json'
let runtimePromise = null
let resourcesPromise = null

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

  const [runtime, sha256, localHeader] = await Promise.all([
    getRuntime(),
    hashFile(rom),
    readRomDebugHeader(rom)
  ])
  const updateSha256 = update ? await hashFile(update) : null
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
    const details = {
      inspection,
      localHeader,
      vfs: vfsDebug(vfs, sourceRomPath)
    }
    const summary = summarizeUnsupportedInspection(details)
    console.warn('[randomizer:inspect:unsupported:summary]', summary)
    console.warn('[randomizer:inspect:unsupported]', details)
    console.warn('[randomizer:inspect:unsupported:json]', JSON.stringify(details, null, 2))
    throw workerError('UPRZX_UNSUPPORTED_ROM', 'UPR-ZX could not identify this ROM.', details)
  }

  if (!inspection.clean) {
    throw workerError(
      'UPRZX_UNCLEAN_ROM',
      'UPR-ZX recognized this ROM, but it does not appear to be a clean official ROM.',
      { inspection, localHeader, vfs: vfsDebug(vfs, sourceRomPath) }
    )
  }

  return {
    name: rom.name,
    size: rom.size,
    sizeLabel: formatBytes(rom.size),
    extension,
    lastModified: rom.lastModified,
    sha256,
    localHeader,
    sourceRomPath: inspection.sourceRomPath || sourceRomPath,
    supported: !!inspection.supported,
    clean: !!inspection.clean,
    romName: inspection.name,
    romCode: inspection.code,
    code: inspection.code,
    generation: inspection.generation || null,
    supportLevel: inspection.supportLevel,
    defaultExtension: inspection.defaultExtension,
    nintendo3ds: !!inspection.nintendo3ds,
    nintendoDs: !!inspection.nintendoDs,
    container: containerForInspection(inspection, extension),
    likelyGeneration: inspection.generation ? [inspection.generation] : [],
    requiresLayeredFs: !!update && !!inspection.nintendo3ds,
    settingsSchema: normalizeSettingsSchema(inspection.settingsSchema, {
      requiresLayeredFs: !!update && !!inspection.nintendo3ds
    }),
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

const getSettingsSchema = async ({ romInfo } = {}) =>
  normalizeSettingsSchema(romInfo?.settingsSchema, {
    requiresLayeredFs: !!romInfo?.requiresLayeredFs
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
  const runtimeCacheKey = await getRuntimeCacheKey()
  const runtimeUrl = absoluteRuntimeUrl(randomizerRuntimeUrl, runtimeCacheKey)
  const wasmUrl = absoluteRuntimeUrl(randomizerWasmUrl, runtimeCacheKey)
  await assertRuntimeAvailable(runtimeCacheKey)
  await ensureRandomizerResources(runtimeCacheKey)
  const runtimeModule = await runtimeStage('import runtime loader', () =>
    import(/* @vite-ignore */ runtimeUrl),
    { runtimeUrl, wasmUrl, runtimeCacheKey }
  )
  const load = runtimeModule.load || runtimeModule.default?.load || runtimeModule.default
  if (typeof load !== 'function') {
    throw workerError('UPRZX_RUNTIME_LOADER_UNAVAILABLE', 'The UPR-ZX TeaVM loader did not expose a load function.', {
      runtimeUrl,
      wasmUrl,
      runtimeCacheKey,
      exports: Object.keys(runtimeModule)
    })
  }

  let teavm
  try {
    teavm = await load(wasmUrl, {
      stackDeobfuscator: { enabled: false }
    })
  } catch (error) {
    throw workerError(
      'UPRZX_RUNTIME_LOAD_FAILED',
      `UPR-ZX runtime failed during instantiate WebAssembly module: ${error.message || String(error)}`,
      {
        stage: 'instantiate WebAssembly module',
        cause: serializeNativeError(error),
        runtimeUrl,
        wasmUrl,
        runtimeCacheKey,
        loaderAsset: await inspectRuntimeAsset(randomizerRuntimeUrl, { cacheKey: runtimeCacheKey }),
        wasmAsset: await inspectRuntimeAsset(randomizerWasmUrl, { cacheKey: runtimeCacheKey, validate: true })
      }
    )
  }
  if (typeof teavm?.exports?.main !== 'function') {
    throw workerError('UPRZX_RUNTIME_MAIN_UNAVAILABLE', 'The UPR-ZX WebAssembly runtime did not expose main().', {
      runtimeUrl,
      wasmUrl,
      runtimeCacheKey,
      exports: exportNames(teavm?.exports || {})
    })
  }

  await runtimeStage('initialize Java exports', () => teavm.exports.main([]), { runtimeUrl, wasmUrl, runtimeCacheKey })
  const bridge = createExportBridge(teavm.exports) || globalThis.__uprzxBridge
  if (
    !bridge?.inspectRom ||
    !bridge?.settingsSchema ||
    !bridge?.randomize ||
    !bridge?.settingsStringFromUi ||
    !bridge?.defaultSettingsString
  ) {
    throw workerError('UPRZX_BRIDGE_UNAVAILABLE', 'The UPR-ZX WebAssembly runtime did not expose the browser bridge.', {
      runtimeUrl,
      wasmUrl,
      runtimeCacheKey,
      exports: exportNames(teavm?.exports || {}),
      hasLegacyBridge: !!globalThis.__uprzxBridge
    })
  }

  return { teavm, bridge }
}

const runtimeStage = async (stage, task, details = {}) => {
  try {
    return await task()
  } catch (error) {
    if (error?.code?.startsWith?.('UPRZX_')) throw error
    throw workerError('UPRZX_RUNTIME_LOAD_FAILED', `UPR-ZX runtime failed during ${stage}: ${error.message || String(error)}`, {
      stage,
      cause: serializeNativeError(error),
      runtimeUrl: details.runtimeUrl || absoluteRuntimeUrl(randomizerRuntimeUrl),
      wasmUrl: details.wasmUrl || absoluteRuntimeUrl(randomizerWasmUrl),
      runtimeCacheKey: details.runtimeCacheKey || null
    })
  }
}

const createExportBridge = (runtimeExports = {}) => {
  const directBridge = validBridge({
    defaultSettingsString: runtimeExports.defaultSettingsString,
    inspectRom: runtimeExports.inspectRom,
    settingsSchema: runtimeExports.settingsSchema,
    settingsStringFromUi: runtimeExports.settingsStringFromUi,
    randomize: runtimeExports.randomize
  })
  if (directBridge) return directBridge

  const exportedClass = runtimeExports.BrowserRandomizerExports
  return validBridge({
    defaultSettingsString: exportedClass?.defaultSettingsString?.bind(exportedClass),
    inspectRom: exportedClass?.inspectRom?.bind(exportedClass),
    settingsSchema: exportedClass?.settingsSchema?.bind(exportedClass),
    settingsStringFromUi: exportedClass?.settingsStringFromUi?.bind(exportedClass),
    randomize: exportedClass?.randomize?.bind(exportedClass)
  })
}

const validBridge = (bridge) => (Object.values(bridge).every((value) => typeof value === 'function') ? bridge : null)

const exportNames = (runtimeExports = {}) => Object.getOwnPropertyNames(runtimeExports)

const ensureRandomizerResources = async (cacheKey) => {
  resourcesPromise ||= loadRandomizerResources(cacheKey).catch((error) => {
    resourcesPromise = null
    throw error
  })
  return resourcesPromise
}

const loadRandomizerResources = async (cacheKey) => {
  const url = absoluteRuntimeUrl(randomizerResourceManifestUrl, cacheKey)
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw workerError('UPRZX_RESOURCES_UNAVAILABLE', 'The UPR-ZX browser resources have not been built yet.', {
      url,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    })
  }

  let manifest
  try {
    manifest = await response.json()
  } catch (error) {
    throw workerError('UPRZX_RESOURCES_INVALID', 'The UPR-ZX browser resource manifest is not valid JSON.', {
      url,
      cause: serializeNativeError(error)
    })
  }

  if (!manifest?.resources || typeof manifest.resources !== 'object') {
    throw workerError('UPRZX_RESOURCES_INVALID', 'The UPR-ZX browser resource manifest is missing its resources map.', {
      url,
      version: manifest?.version || null
    })
  }

  const resources = new Map()
  for (const [path, encoded] of Object.entries(manifest.resources)) {
    resources.set(path, base64ToBytes(encoded))
  }
  globalThis.__uprzxResources = resources
  globalThis.__uprzxResourceManifest = {
    url,
    version: manifest.version || null,
    count: resources.size
  }
  return globalThis.__uprzxResourceManifest
}

const assertRuntimeAvailable = async (cacheKey) => {
  await Promise.all([
    assertRuntimeFile(randomizerWasmUrl, 'UPRZX_WASM_UNAVAILABLE', 'The UPR-ZX WebAssembly runtime has not been built yet.', cacheKey),
    assertRuntimeFile(
      randomizerRuntimeUrl,
      'UPRZX_WASM_RUNTIME_UNAVAILABLE',
      'The UPR-ZX WebAssembly runtime loader has not been built yet.',
      cacheKey
    )
  ])
}

const assertRuntimeFile = async (path, code, message, cacheKey) => {
  const runtimeUrl = new URL(absoluteRuntimeUrl(path, cacheKey))
  const response = await fetch(runtimeUrl, { method: 'HEAD', cache: 'no-store' })
  if (!response.ok) {
    throw workerError(
      code,
      message,
      {
        runtimeUrl: runtimeUrl.toString(),
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length')
      }
    )
  }
}

const getRuntimeCacheKey = async () => {
  try {
    const response = await fetch(new URL(appVersionUrl, self.location.origin), { cache: 'no-store' })
    if (response.ok) {
      const version = await response.json()
      if (version?.version) return `app-${version.version}`
    }
  } catch (error) {
    // Fall back to a per-worker key below.
  }
  return `worker-${Date.now()}`
}

const absoluteRuntimeUrl = (path, cacheKey = '') => {
  const url = new URL(path, self.location.origin)
  if (cacheKey) url.searchParams.set('v', cacheKey)
  return url.toString()
}

const base64ToBytes = (encoded) => {
  const binary = atob(String(encoded || ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const inspectRuntimeAsset = async (path, { cacheKey = '', validate = false } = {}) => {
  const url = absoluteRuntimeUrl(path, cacheKey)
  try {
    const response = await fetch(url, { cache: 'no-store' })
    const details = {
      url,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      redirected: response.redirected,
      responseUrl: response.url,
      type: response.type,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
      cacheControl: response.headers.get('cache-control'),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      acceptRanges: response.headers.get('accept-ranges'),
      contentEncoding: response.headers.get('content-encoding')
    }
    if (validate && response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer())
      details.byteLength = bytes.byteLength
      details.first8 = hexBytes(bytes.slice(0, 8))
      details.hasWasmMagic = bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d
      details.webAssemblyValidate = typeof WebAssembly !== 'undefined' && typeof WebAssembly.validate === 'function'
        ? WebAssembly.validate(bytes)
        : null
    }
    return details
  } catch (error) {
    return {
      url,
      error: serializeNativeError(error)
    }
  }
}

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
    readByte: (path, position) => {
      const entry = fileEntry(path)
      const index = Math.max(0, Number(position) || 0)
      return index < entry.bytes.length ? entry.bytes[index] : -1
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

const vfsPath = (directory, name) =>
  `/${[directory, safeVfsName(name)]
    .join('/')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/')}`

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

const readRomDebugHeader = async (file) => {
  const bytes = new Uint8Array(await file.slice(0, Math.min(file.size, 0x150)).arrayBuffer())
  return {
    size: file.size,
    extension: extensionFor(file.name),
    gbTitle: ascii(bytes, 0x134, 16),
    gbCode: ascii(bytes, 0x13f, 4),
    gbDestinationCode: byteAt(bytes, 0x14a),
    gbVersion: byteAt(bytes, 0x14c),
    gbHeaderChecksum: hexByte(byteAt(bytes, 0x14d)),
    gbGlobalChecksum: `${hexByte(byteAt(bytes, 0x14e))}${hexByte(byteAt(bytes, 0x14f))}`,
    gbaTitle: ascii(bytes, 0xa0, 12),
    gbaCode: ascii(bytes, 0xac, 4),
    gbaMaker: ascii(bytes, 0xb0, 2),
    gbaVersion: byteAt(bytes, 0xbc),
    first16: hexBytes(bytes.slice(0, 16))
  }
}

const ascii = (bytes, offset, length) => {
  if (offset + length > bytes.length) return ''
  return [...bytes.slice(offset, offset + length)]
    .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ''))
    .join('')
    .replace(/\0/g, '')
    .trim()
}

const byteAt = (bytes, offset) => (offset < bytes.length ? bytes[offset] : null)

const hexByte = (value) => (typeof value === 'number' ? value.toString(16).padStart(2, '0').toUpperCase() : null)

const hexBytes = (bytes) => [...bytes].map(hexByte).join(' ')

const vfsDebug = (vfs, path) => ({
  path,
  normalizedPath: vfs.normalize(path),
  exists: vfs.exists(path),
  isFile: vfs.isFile(path),
  length: vfs.length(path),
  first16: hexBytes(vfs.read(path, 0, 16))
})

const summarizeUnsupportedInspection = ({ inspection, localHeader, vfs }) => {
  const diagnostics = inspection?.diagnostics || {}
  const javaFile = diagnostics.file || {}
  const resources = diagnostics.resources || {}
  const handlers = Array.isArray(diagnostics.handlers)
    ? diagnostics.handlers.map((handler) => ({
        handler: handler.handler,
        stage: handler.stage,
        loadable: handler.loadable ?? null,
        exception: handler.exception ?? null,
        message: handler.message ?? null
      }))
    : []

  return {
    local: {
      size: localHeader?.size,
      gbTitle: localHeader?.gbTitle,
      gbDestinationCode: localHeader?.gbDestinationCode,
      gbVersion: localHeader?.gbVersion,
      gbHeaderChecksum: localHeader?.gbHeaderChecksum,
      gbGlobalChecksum: localHeader?.gbGlobalChecksum,
      gbaTitle: localHeader?.gbaTitle,
      gbaCode: localHeader?.gbaCode,
      gbaVersion: localHeader?.gbaVersion,
      first16: localHeader?.first16
    },
    javascriptVfs: {
      path: vfs?.path,
      exists: vfs?.exists,
      isFile: vfs?.isFile,
      length: vfs?.length,
      first16: vfs?.first16
    },
    javaVfs: {
      path: javaFile.path,
      exists: javaFile.exists,
      isFile: javaFile.isFile,
      canRead: javaFile.canRead,
      length: javaFile.length,
      read336Length: javaFile.read336Length,
      read4096Length: javaFile.read4096Length,
      read1MiBLength: javaFile.read1MiBLength,
      gbTitle: javaFile.gbTitle,
      gbDestinationCode: javaFile.gbDestinationCode,
      gbVersion: javaFile.gbVersion,
      gbHeaderChecksum: javaFile.gbHeaderChecksum,
      gbGlobalChecksum: javaFile.gbGlobalChecksum,
      gbaTitle: javaFile.gbaTitle,
      gbaCode: javaFile.gbaCode,
      gbaVersion: javaFile.gbaVersion,
      first16: javaFile.first16,
      exception: javaFile.exception ?? null,
      message: javaFile.message ?? null
    },
    resources,
    handlers
  }
}

const normalizeSettingsSchema = (schema, { requiresLayeredFs = false } = {}) => {
  const groups = Array.isArray(schema?.groups)
    ? schema.groups.map((group) => ({
        id: group.id,
        name: group.name,
        options: Array.isArray(group.options)
          ? group.options.map((option) => ({
              ...option,
              choices: Array.isArray(option.choices)
                ? option.choices.map(normalizeChoice)
                : []
            }))
          : []
      })).filter((group) => group.options.length)
    : []

  return {
    engine: {
      ...UPRZX_PROJECT,
      adapter: 'web-adapter-0.1.0'
    },
    defaults: {
      seed: '',
      ...(schema?.defaults || {})
    },
    groups,
    validation: {
      warnings: requiresLayeredFs
        ? [
            {
              code: 'UPDATE_REQUIRES_LAYEREDFS',
              message: '3DS game updates require LayeredFS output.'
            }
          ]
        : []
    }
  }
}

const normalizeChoice = (choice) => {
  if (Array.isArray(choice)) {
    return {
      value: String(choice[0] ?? ''),
      label: String(choice[1] ?? choice[0] ?? ''),
      disabled: !!choice[2]
    }
  }

  return {
    value: String(choice?.value ?? ''),
    label: String(choice?.label ?? choice?.value ?? ''),
    disabled: !!choice?.disabled
  }
}

const containerForInspection = (inspection, extension) => {
  if (inspection?.nintendo3ds) return 'ctr'
  if (inspection?.nintendoDs) return 'nds'
  if (extension === 'gba') return 'gba'
  if (extension === 'gb' || extension === 'gbc') return 'gb'
  return 'unknown'
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

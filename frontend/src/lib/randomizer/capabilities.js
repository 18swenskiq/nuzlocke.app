export const randomizerOutputModes = [
  {
    id: 'single-file',
    label: 'Single ROM file',
    extensions: ['gb', 'gbc', 'gba', 'nds', 'cxi']
  },
  {
    id: 'layeredfs-directory',
    label: 'LayeredFS directory',
    chromiumOnly: true,
    extensions: ['3ds', 'cia', 'cxi', 'cci']
  },
  {
    id: 'layeredfs-archive',
    label: 'LayeredFS archive',
    extensions: ['3ds', 'cia', 'cxi', 'cci']
  }
]

export const detectRandomizerCapabilities = () => {
  const hasWindow = typeof window !== 'undefined'
  const hasNavigator = typeof navigator !== 'undefined'
  const fileSystemAccess =
    hasWindow &&
    'showOpenFilePicker' in window &&
    'showSaveFilePicker' in window &&
    'showDirectoryPicker' in window
  const opfs = hasNavigator && !!navigator.storage?.getDirectory
  const blobDownload = hasWindow && !!window.URL?.createObjectURL
  const webWorker = typeof Worker !== 'undefined'
  const wasm = typeof WebAssembly !== 'undefined'
  const streams = typeof ReadableStream !== 'undefined' && typeof WritableStream !== 'undefined'

  return {
    wasm,
    webWorker,
    opfs,
    blobDownload,
    streams,
    fileSystemAccess,
    directDirectoryOutput: fileSystemAccess,
    directSavePicker: fileSystemAccess,
    persistedFileHandles: fileSystemAccess && hasWindow && !!window.indexedDB,
    browserPath: fileSystemAccess ? 'chromium-file-system-access' : opfs ? 'opfs-blob' : 'memory-blob',
    outputModes: randomizerOutputModes.filter((mode) => !mode.chromiumOnly || fileSystemAccess)
  }
}

export const getDefaultOutputMode = (romInfo, capabilities = detectRandomizerCapabilities()) => {
  const extension = romInfo?.extension?.toLowerCase()
  if (extension === '3ds' || extension === 'cia') {
    return capabilities.directDirectoryOutput ? 'layeredfs-directory' : 'layeredfs-archive'
  }
  return 'single-file'
}

export const summarizeCapabilities = (capabilities) => {
  if (!capabilities) return 'Detecting browser capabilities'
  if (capabilities.fileSystemAccess) return 'Direct filesystem output available'
  if (capabilities.opfs) return 'OPFS staging with browser downloads'
  return 'Memory staging with browser downloads'
}

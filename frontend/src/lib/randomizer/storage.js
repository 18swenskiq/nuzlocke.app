const encoder = new TextEncoder()

export class MemoryStorage {
  constructor() {
    this.files = new Map()
  }

  async write(path, value) {
    const blob = value instanceof Blob ? value : new Blob([value])
    this.files.set(path, blob)
    return { path, size: blob.size }
  }

  async read(path) {
    const blob = this.files.get(path)
    if (!blob) throw new Error(`No memory file exists at ${path}`)
    return blob
  }

  async delete(path) {
    this.files.delete(path)
  }

  async clear() {
    this.files.clear()
  }
}

export class OpfsStorage {
  constructor(rootName = 'upr-zx') {
    this.rootName = rootName
  }

  static supported() {
    return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory
  }

  async root() {
    if (!OpfsStorage.supported()) {
      throw new Error('Origin private filesystem is not available in this browser')
    }
    const storageRoot = await navigator.storage.getDirectory()
    return storageRoot.getDirectoryHandle(this.rootName, { create: true })
  }

  async fileHandle(path, create = true) {
    const root = await this.root()
    return root.getFileHandle(path, { create })
  }

  async write(path, value) {
    const blob = value instanceof Blob ? value : new Blob([value])
    const handle = await this.fileHandle(path)
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return { path, size: blob.size }
  }

  async stageFile(file, path = file.name) {
    await this.write(path, file)
    return {
      path,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified
    }
  }

  async read(path) {
    const handle = await this.fileHandle(path, false)
    return handle.getFile()
  }

  async delete(path) {
    const root = await this.root()
    await root.removeEntry(path)
  }
}

export class BlobDownloadSink {
  async write({ filename, blob }) {
    downloadBlob(blob, filename)
    return {
      filename,
      size: blob.size,
      mode: 'blob-download'
    }
  }
}

export class ArchiveDownloadSink {
  constructor({ format = 'tar' } = {}) {
    if (format !== 'tar') throw new Error('Only tar archives are currently supported without extra dependencies')
    this.format = format
  }

  async write({ filename, entries }) {
    const blob = await createTarBlob(entries)
    downloadBlob(blob, filename.endsWith('.tar') ? filename : `${filename}.tar`)
    return {
      filename,
      size: blob.size,
      mode: 'archive-download',
      format: this.format
    }
  }
}

export class FileSystemAccessSink {
  static supported() {
    return typeof window !== 'undefined' && 'showSaveFilePicker' in window
  }

  async writeFile({ suggestedName, blob, types }) {
    if (!FileSystemAccessSink.supported()) {
      throw new Error('File System Access API is not available in this browser')
    }
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return {
      filename: suggestedName,
      size: blob.size,
      mode: 'file-system-access'
    }
  }
}

export class FileSystemAccessDirectorySink {
  static supported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window
  }

  async write({ entries }) {
    if (!FileSystemAccessDirectorySink.supported()) {
      throw new Error('Directory output is not available in this browser')
    }
    if (!entries?.length) {
      throw new Error('Directory output requires at least one generated file')
    }

    const root = await window.showDirectoryPicker({ mode: 'readwrite' })
    let size = 0

    for (const entry of entries) {
      const blob =
        entry.blob instanceof Blob
          ? entry.blob
          : new Blob([entry.blob ?? entry.bytes ?? ''])
      await writeDirectoryEntry(root, entry.name || entry.path, blob)
      size += blob.size
    }

    return {
      entries: entries.length,
      size,
      mode: 'file-system-access-directory'
    }
  }
}

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const createTarBlob = async (entries) => {
  const chunks = []

  for (const entry of entries) {
    const name = normalizeTarName(entry.name)
    const blob = entry.blob instanceof Blob ? entry.blob : new Blob([entry.blob ?? entry.bytes ?? ''])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    chunks.push(createTarHeader(name, bytes.length))
    chunks.push(bytes)
    chunks.push(new Uint8Array(paddingFor(bytes.length)))
  }

  chunks.push(new Uint8Array(1024))
  return new Blob(chunks, { type: 'application/x-tar' })
}

const writeDirectoryEntry = async (root, path, blob) => {
  const parts = normalizeTarName(path).split('/')
  const filename = parts.pop()
  let directory = root

  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create: true })
  }

  const handle = await directory.getFileHandle(filename, { create: true })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

const normalizeTarName = (name) => {
  const normalized = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized) throw new Error('Archive entry name is required')
  if (encoder.encode(normalized).length > 100) {
    throw new Error(`Archive entry name is too long for tar: ${name}`)
  }
  return normalized
}

const createTarHeader = (name, size) => {
  const header = new Uint8Array(512)
  writeString(header, 0, 100, name)
  writeString(header, 100, 8, '0000644')
  writeString(header, 108, 8, '0000000')
  writeString(header, 116, 8, '0000000')
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, Math.floor(Date.now() / 1000))
  header.fill(0x20, 148, 156)
  header[156] = '0'.charCodeAt(0)
  writeString(header, 257, 6, 'ustar')
  writeString(header, 263, 2, '00')
  writeOctal(header, 148, 8, checksum(header))
  return header
}

const writeString = (header, offset, length, value) => {
  const bytes = encoder.encode(value)
  header.set(bytes.slice(0, length), offset)
}

const writeOctal = (header, offset, length, value) => {
  const octal = value.toString(8).padStart(length - 1, '0')
  writeString(header, offset, length, octal)
}

const checksum = (header) => header.reduce((total, byte) => total + byte, 0)

const paddingFor = (size) => {
  const remainder = size % 512
  return remainder === 0 ? 0 : 512 - remainder
}

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const randomizerDir = resolve(root, 'randomizer-zx')
const wrapper = resolve(
  randomizerDir,
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'
)
const wasmRuntime = resolve(root, 'frontend', 'static', 'randomizer', 'generated', 'uprzx.wasm')
const jsRuntime = resolve(root, 'frontend', 'static', 'randomizer', 'generated', 'uprzx.wasm-runtime.js')

if (process.env.SKIP_RANDOMIZER_BUILD === '1') {
  console.warn('Skipping UPR-ZX WebAssembly build because SKIP_RANDOMIZER_BUILD=1.')
  process.exit(0)
}

if (!existsSync(wrapper)) {
  console.error(`Gradle wrapper is missing at ${wrapper}.`)
  process.exit(1)
}

const javaVersion = spawnSync('java', ['-version'], {
  encoding: 'utf8',
  shell: process.platform === 'win32'
})
const javaOutput = `${javaVersion.stderr || ''}${javaVersion.stdout || ''}`
const javaMajor = parseJavaMajor(javaOutput)

if (javaVersion.error || !javaMajor) {
  console.error('A Java 17 runtime is required to build the UPR-ZX WebAssembly runtime.')
  console.error('Install JDK 17+ and make sure java is available on PATH or via JAVA_HOME.')
  process.exit(1)
}

if (javaMajor < 17) {
  console.error(`Java ${javaMajor} is active, but the UPR-ZX WebAssembly build requires Java 17+.`)
  console.error('Install JDK 17+ and make sure it is first on PATH or selected by JAVA_HOME.')
  process.exit(1)
}

const command = process.platform === 'win32' ? wrapper : 'sh'
const args = process.platform === 'win32' ? [':web:buildWasmGC'] : [wrapper, ':web:buildWasmGC']

const child = spawn(command, args, {
  cwd: randomizerDir,
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit'
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`UPR-ZX WebAssembly build stopped by ${signal}.`)
    process.exit(1)
  }

  if (code !== 0) {
    console.error('UPR-ZX WebAssembly build failed.')
    process.exit(code || 1)
  }

  if (!existsSync(wasmRuntime)) {
    console.error(`UPR-ZX WebAssembly build completed, but ${wasmRuntime} was not created.`)
    process.exit(1)
  }

  if (!existsSync(jsRuntime)) {
    console.error(`UPR-ZX WebAssembly build completed, but ${jsRuntime} was not created.`)
    process.exit(1)
  }
})

function parseJavaMajor(output) {
  const match = output.match(/version "(?<version>[^"]+)"/)
  if (!match?.groups?.version) return null

  const [first, second] = match.groups.version.split('.')
  if (first === '1') return Number(second)
  return Number(first)
}

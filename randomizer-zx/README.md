# Browser-Local UPR-ZX Integration

This package owns the browser-local Universal Pokemon Randomizer ZX integration
for nuzlocke.app.

The goal is to keep UPR-ZX's Java randomization core intact, compile the
non-desktop path with TeaVM, and expose it to the Svelte app through
`frontend/src/lib/randomizer/worker.js`.

## Commands

From `randomizer-zx`:

```sh
./gradlew :web:test
./gradlew :web:buildWasmGC
```

The Gradle/TeaVM path requires Java 17 or newer on `PATH` or via `JAVA_HOME`.

The TeaVM task writes generated browser artifacts to
`frontend/static/randomizer/generated/`.

From `frontend`, production builds run the randomizer build first:

```sh
npm run build
```

For frontend-only work, `npm run build:site` skips the Java/WASM step. The
`SKIP_RANDOMIZER_BUILD=1` escape hatch exists for emergency local diagnostics,
but release builds should not use it.

## Architecture

- The Java adapter accepts abstract paths and settings strings, matching the
  upstream CLI behavior without exposing Swing or desktop file pickers.
- The frontend worker owns browser storage and download behavior.
- ROM bytes and generated ROM artifacts never leave the browser.
- Server APIs store manifests and extracted tracker data only.

## Port Status

The JVM adapter entrypoint is present. The TeaVM build is scaffolded and will
need the documented browser shims before the full upstream core can compile to
WebAssembly GC.

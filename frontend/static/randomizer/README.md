# Randomizer Runtime

TeaVM-generated UPR-ZX browser artifacts are written to
`frontend/static/randomizer/generated/`.

The runtime is intentionally not committed until the Java browser shims compile
cleanly. The Svelte worker checks for these files at runtime and reports a
structured capability error when the engine has not been built.

# UPR-ZX Browser Port Patch Log

The upstream source in `randomizer-zx/upstream` should stay reviewable against
the pinned UPR-ZX release. Prefer adapter classes, source-set exclusions, or
small documented patches over broad rewrites.

## Current Local Changes

- No vendored upstream source files have been edited.
- `randomizer-zx/web` adds a library-style adapter around the upstream
  `Settings`, `RomHandler.Factory`, and `Randomizer` APIs.
- `randomizer-zx/web` provides browser-safe replacements for upstream classes
  that reference APIs unavailable in TeaVM/WASM. Current replacements:
  `Utils` and `CustomNamesSet`.

## Known Browser/WASM Port Items

- Replace desktop `java.io.File` and `RandomAccessFile` usage in ROM handlers
  with a virtual filesystem that can map to OPFS, memory, or file handles.
- Remove or shim `java.awt` and `java.awt.image.BufferedImage` dependencies used
  by icon/sprite extraction paths. Tracker data extraction should not require
  desktop image types.
- Replace `Utils.getExecutionLocation()` and any GUI-class references with a
  browser-safe implementation.
- Keep `CustomNamesSet` free of `java.util.Scanner`; TeaVM WASM GC does not
  provide `Scanner`, but UPR-ZX custom-name resources still need to load.
- Keep Swing/AWT GUI packages, launcher code, and local test utilities excluded
  from TeaVM output.
- Preserve 3DS update behavior: if a game update is supplied, output must be
  LayeredFS/directory-style data, archived on browsers without directory sinks.

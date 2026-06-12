# Universal Pokemon Randomizer ZX Upstream

This directory vendors Universal Pokemon Randomizer ZX so the browser-local
randomizer can reuse the original Java implementation instead of reimplementing
the randomization logic in JavaScript.

## Pin

- Source: https://github.com/Ajarmar/universal-pokemon-randomizer-zx
- Release: v4.6.1
- Commit: 7f00eb8
- License: GPL-3.0-or-later
- Vendored path: `randomizer-zx/upstream`

The release was checked against GitHub's latest release page before vendoring.

## Local Layout

- `upstream/`: unmodified UPR-ZX source/resources from the pinned release.
- `web/`: nuzlocke.app adapter, browser build, and web-specific shims.
- `PATCHES.md`: running list of any local changes required for browser/WASM
  compatibility.

## Update Flow

1. Download the new upstream release archive.
2. Replace `randomizer-zx/upstream` with the release contents.
3. Update the release, commit, and date in this file.
4. Reapply or remove entries from `PATCHES.md`.
5. Run the JVM adapter tests, TeaVM build, frontend build, and parity fixtures.
6. Confirm `NOTICE` still preserves all required attribution.

ROM files, generated ROMs, local saves, logs, and parity fixtures must stay out
of git.

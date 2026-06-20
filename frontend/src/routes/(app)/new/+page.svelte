<script>
  import { onDestroy, onMount } from 'svelte'
  import { savedGames, createGame } from '$lib/store'
  import { ScreenContainer } from '$lib/components/containers'

  import {
    Radio,
    Button,
    Tabs,
    Input,
    Logo,
    Select
  } from '$lib/components/core'
  import AutoComplete from '$c/core/AutoCompleteV2.svelte'

  import Icon from '@iconify/svelte/dist/OfflineIcon.svelte'
  import { File, Dice, CloudUpload } from '$icons'

  import Games from '$lib/data/games.json'
  import { IMG } from '$lib/utils/rewrites'

  import { filterObj } from '$lib/utils/arr'
  import { shortuuid } from '$lib/utils/uuid'
  import { settingsDefault } from '$lib/components/Settings/_data'
  import {
    detectRandomizerCapabilities,
    getDefaultOutputMode,
    randomizerOutputModes
  } from '$lib/randomizer/capabilities'
  import { createRandomizerClient } from '$lib/randomizer/client'
  import {
    ArchiveDownloadSink,
    BlobDownloadSink,
    FileSystemAccessDirectorySink,
    FileSystemAccessSink
  } from '$lib/randomizer/storage'
  import {
    buildRandomizerManifest,
    randomizerSettingsDefault
  } from '$lib/randomizer/options'
  import { normalizeRandomizerResults } from '$lib/randomizer/locations'
  import {
    describeRomIdentity,
    resolveTrackerGameFromRom
  } from '$lib/randomizer/rom-map'

  let validGames = filterObj(Games, (g) => g.supported)

  let createMode = null
  let gameName = ''
  const handleNewGame = async () => {
    if (randomizingRun) return
    if (!selectedGame?.supported)
      return alert(`Sorry, ${selectedGame?.title} is currently not supported`)

    const createid = createGameKey()

    if (!randomizeRun) return saveNewGame(createid)

    randomizingRun = true
    romError = ''

    try {
      const randomizer = await createRandomizedRun(createid)
      saveNewGame(createid, randomizer)
    } catch (error) {
      console.error('[randomizer]', error)
      romError = formatRandomizerError(error)
    } finally {
      randomizingRun = false
    }
  }

  let hoverActive = false
  const togglehover = () => (hoverActive = !hoverActive)

  let selected
  const handleSelect = (id) => () =>
    selected === id ? (selected = null) : (selected = id)

  const emptyRandomizerSchema = () => ({
    defaults: { seed: '' },
    groups: [],
    validation: { warnings: [] }
  })

  const resetRunState = () => {
    gameName = ''
    customName = null
    selected = null
    difficulty = 0
  }

  const resetRandomizerState = () => {
    romFile = null
    romInfo = null
    updateFile = null
    updateInfo = null
    inspectingRom = false
    randomizingRun = false
    outputMode = 'single-file'
    randomizerSchema = emptyRandomizerSchema()
    randomizerOptions = { seed: '' }
    useRandomSeed = true
    activeRandomizerGroup = 0
  }

  const selectCreateMode = (mode) => () => {
    resetRunState()
    resetRandomizerState()
    createMode = mode
    romError = ''
  }

  const handleBackToCreateMode = () => {
    resetRunState()
    resetRandomizerState()
    createMode = null
    romError = ''
  }

  let randomizeRun = false
  let romFile = null
  let romInfo = null
  let romError = ''
  let updateFile = null
  let updateInfo = null
  let inspectingRom = false
  let randomizingRun = false
  let outputMode = 'single-file'
  let randomizerCapabilities = null
  let randomizerClient = null
  let randomizerSchema = emptyRandomizerSchema()
  let randomizerOptions = { seed: '' }
  let useRandomSeed = true
  let activeRandomizerGroup = 0

  onMount(() => {
    randomizerCapabilities = detectRandomizerCapabilities()
    try {
      randomizerClient = createRandomizerClient()
    } catch (error) {
      romError = error.message
    }
  })

  onDestroy(() => {
    randomizerClient?.destroy()
  })

  const validRomExtensions = ['gb', 'gbc', 'gba', 'nds', '3ds', 'cia', 'cxi', 'cci']
  const romAccept = validRomExtensions.map((ext) => `.${ext}`).join(',')

  const handleRomUpload = async (event) => {
    const file = event.currentTarget.files?.[0]
    romFile = null
    romInfo = null
    selected = null
    randomizerSchema = emptyRandomizerSchema()
    randomizerOptions = { seed: randomizerOptions.seed || '' }
    activeRandomizerGroup = 0
    romError = ''

    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!validRomExtensions.includes(ext)) {
      romError = 'Unsupported ROM file'
      return
    }

    inspectingRom = true
    try {
      if (!randomizerClient) {
        throw Object.assign(new Error('The randomizer worker is not available'), {
          code: 'RANDOMIZER_CLIENT_UNAVAILABLE'
        })
      }

      romInfo = await randomizerClient.inspectRom({ rom: file, update: updateFile })
      const trackerGameKey = resolveTrackerGameFromRom(romInfo)
      if (!trackerGameKey) {
        throw Object.assign(
          new Error(
            `UPR-ZX recognized ${describeRomIdentity(romInfo)}, but this tracker does not have a matching supported game.`
          ),
          { code: 'UPRZX_TRACKER_GAME_UNMAPPED' }
        )
      }

      selected = trackerGameKey
      romFile = file
      if (updateInfo && !romInfo.update) romInfo.update = updateInfo
      outputMode = getDefaultOutputMode(romInfo, randomizerCapabilities)
      randomizerSchema = await randomizerClient.getSettingsSchema({ romInfo })
      randomizerOptions = {
        ...randomizerSchema.defaults,
        seed: randomizerOptions.seed || randomizerSchema.defaults.seed || ''
      }
      activeRandomizerGroup = 0
    } catch (error) {
      console.warn('[randomizer:inspect]', {
        code: error?.code,
        name: error?.name,
        message: error?.message,
        details: error?.details,
        stack: error?.stack
      })
      romError = formatRandomizerError(error) || 'Could not inspect ROM'
      romInfo = null
      romFile = null
      selected = null
    } finally {
      inspectingRom = false
    }
  }

  const handleUpdateUpload = async (event) => {
    const file = event.currentTarget.files?.[0]
    updateFile = file
    updateInfo = null

    if (!file) return

    updateInfo = {
      name: file.name,
      size: file.size,
      sizeLabel: formatBytes(file.size),
      extension: file.name.split('.').pop()?.toLowerCase(),
      lastModified: file.lastModified,
      sha256: await sha256(file)
    }

    if (romInfo) {
      romInfo = {
        ...romInfo,
        update: updateInfo,
        requiresLayeredFs: true
      }
      outputMode = getDefaultOutputMode(romInfo, randomizerCapabilities)
    }
  }

  const sha256 = async (file) => {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1
    )
    return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
  }

  const setRandomizerOption = (id, type = 'select') => (event) => {
    let value =
      event.detail?.value ??
      (type === 'checkbox'
        ? event.currentTarget.checked
        : event.currentTarget.value)
    if (type === 'number') value = Number(value)
    randomizerOptions = {
      ...randomizerOptions,
      [id]: value
    }
  }

  const choicesFor = (option) =>
    (option.choices || []).map((choice) =>
      Array.isArray(choice)
        ? { value: choice[0], label: choice[1], disabled: !!choice[2] }
        : choice
    )

  const createGameKey = () => {
    let createid = selected
    if (!randomizeRun && selectedGame?.difficulty)
      createid += difficultyOptions?.[difficulty]?.id || ''
    return createid
  }

  const saveNewGame = (gameKey, randomizer = null) => {
    savedGames.update(
      createGame(
        gameName,
        gameKey,
        JSON.stringify(randomizer ? { __randomizer: randomizer } : {}),
        randomizer
          ? {
              randomizer: compactRandomizerMetadata(randomizer),
              settings: randomizerSettingsDefault(settingsDefault)
            }
          : {}
      )
    )
    window.location = '/game'
  }

  const createRandomizedRun = async (gameKey) => {
    if (!romFile) {
      throw Object.assign(new Error('Select a ROM before creating a randomized run'), {
        code: 'ROM_REQUIRED'
      })
    }
    if (!randomizerClient) {
      throw Object.assign(new Error('The randomizer worker is not available'), {
        code: 'RANDOMIZER_CLIENT_UNAVAILABLE'
      })
    }

    const manifest = createRandomizerManifest(gameKey)
    const settings = effectiveRandomizerOptions()
    const result = await randomizerClient.randomize({
      rom: romFile,
      update: updateFile,
      settings,
      seed: settings.seed,
      outputMode
    })
    const savedOutput = await persistRandomizerOutput(result)

    return completeRandomizerManifest(manifest, result, savedOutput)
  }

  const createRandomizerManifest = (gameKey) =>
    buildRandomizerManifest({
      runId: shortuuid(),
      game: selectedGame,
      gameKey,
      capabilities: randomizerCapabilities,
      options: effectiveRandomizerOptions(),
      outputMode,
      rom: romInfo
    })

  const effectiveRandomizerOptions = () => ({
    ...randomizerOptions,
    seed: useRandomSeed ? '' : String(randomizerOptions.seed || '').trim()
  })

  const completeRandomizerManifest = (manifest, result, savedOutput) => {
    const rawResults = result?.extractedData || result?.results || null
    const results = normalizeRandomizerResults(rawResults, manifest.game?.key)

    return {
      ...manifest,
      status: 'randomized',
      settings: {
        ...manifest.settings,
        string:
          result?.settingsString ||
          result?.settings?.string ||
          manifest.settings.string
      },
      results,
      output: {
        ...manifest.output,
        ...compactOutputMetadata(result?.output),
        saved: savedOutput
      },
      log: result?.log || null,
      checkValue: result?.checkValue ?? result?.check_value ?? null,
      randomized: +new Date()
    }
  }

  const compactOutputMetadata = (output = {}) => {
    const metadata = { ...(output || {}) }
    delete metadata.blob
    delete metadata.bytes
    delete metadata.entries
    delete metadata.files
    delete metadata.file
    delete metadata.directoryHandle
    return metadata
  }

  const compactRandomizerMetadata = (randomizer) => ({
    ...randomizer,
    results: randomizer.results
      ? {
          extracted: true,
          routeCount: randomizer.results.route?.length || randomizer.results.routes?.length || null,
          trainerCount:
            Object.keys(randomizer.results.league || randomizer.results.trainers || {}).length || null
        }
      : null,
    log: randomizer.log ? { present: true } : null
  })

  const persistRandomizerOutput = async (result) => {
    const output = result?.output
    if (!output) return null

    const entries = output.entries || output.files
    if (entries?.length) {
      if (
        outputMode === 'layeredfs-directory' &&
        FileSystemAccessDirectorySink.supported()
      ) {
        return new FileSystemAccessDirectorySink().write({ entries })
      }

      return new ArchiveDownloadSink({
        format: output.archiveFormat || output.format || 'tar'
      }).write({
        filename: output.filename || output.suggestedName || `${gameName || 'randomized-run'}-layeredfs`,
        entries
      })
    }

    const blob =
      output.blob instanceof Blob
        ? output.blob
        : output.bytes
          ? new Blob([output.bytes], { type: output.type || 'application/octet-stream' })
          : null

    if (!blob) return compactOutputMetadata(output)

    const filename =
      output.filename ||
      output.suggestedName ||
      defaultRandomizerOutputName(romInfo?.name)

    if (randomizerCapabilities?.directSavePicker && FileSystemAccessSink.supported()) {
      return new FileSystemAccessSink().writeFile({
        suggestedName: filename,
        blob,
        types: [
          {
            description: 'Randomized Pokemon ROM',
            accept: {
              'application/octet-stream': ['.' + (romInfo?.extension || 'rom')]
            }
          }
        ]
      })
    }

    return new BlobDownloadSink().write({ filename, blob })
  }

  const defaultRandomizerOutputName = (filename = 'randomized.rom') => {
    const dot = filename.lastIndexOf('.')
    if (dot < 1) return `${filename}.randomized`
    return `${filename.slice(0, dot)}.randomized${filename.slice(dot)}`
  }

  const formatRandomizerError = (error) => {
    if (error?.code === 'UPRZX_WASM_UNAVAILABLE') {
      return 'The UPR-ZX browser runtime is not built into this site yet, so the run was not created.'
    }
    if (error?.code === 'UPRZX_WASM_NOT_BOUND') {
      return 'The UPR-ZX browser runtime is present, but the JavaScript binding is not wired yet, so the run was not created.'
    }
    if (error?.code === 'ROM_REQUIRED') {
      return 'Select a ROM before creating a randomized run.'
    }
    if (error?.code === 'UPRZX_UNSUPPORTED_ROM') {
      return 'UPR-ZX could not identify this ROM.'
    }
    if (error?.code === 'UPRZX_UNCLEAN_ROM') {
      return 'UPR-ZX recognized this ROM, but it does not appear to be a clean official ROM.'
    }
    if (error?.code === 'UPRZX_TRACKER_GAME_UNMAPPED') {
      return error.message
    }
    if (error?.code === 'RANDOMIZER_CLIENT_UNAVAILABLE') {
      return 'The randomizer worker is not available.'
    }
    return error?.message || 'Randomization failed, so the run was not created.'
  }

  let difficulty = 0,
    difficultyOptions = []

  let gen = 'All'
  const gens = [
    { label: 'All', val: 'All' },
    { label: 'Rom Hacks', val: 'romhack' }
  ].concat(
    ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'].map((l) => ({
      label: `Gen ${l}`,
      val: l
    }))
  )

  let customName
  $: {
    if ((selectedGame && !gameName) || customName === gameName) {
      customName = gameName = selectedGame
        ? `${selectedGame?.title} ${randomizeRun ? 'Randomized Nuzlocke' : 'Nuzlocke'}`
        : ''
    }
  }

  $: difficultyOptions = selectedGame?.difficulty?.map((d) => ({
    id: d.split(':')[1],
    name: d.split(':')[0] || 'Normal'
  }))
  $: selectedGame = validGames[selected]
  $: randomizeRun = createMode === 'randomized'
  $: randomizerGroups = randomizerSchema.groups || []
  $: if (activeRandomizerGroup >= randomizerGroups.length) {
    activeRandomizerGroup = 0
  }
  $: activeRandomizerOptionGroup = randomizerGroups[activeRandomizerGroup]
  $: randomizerGroupTabs = randomizerGroups.map((group, index) => ({
    label: group.name,
    val: index
  }))
  $: is3dsRom = ['3ds', 'cia', 'cxi', 'cci'].includes(romInfo?.extension)
  $: availableOutputModes = (
    randomizerCapabilities?.outputModes || randomizerOutputModes
  ).filter((mode) => !romInfo?.extension || mode.extensions.includes(romInfo.extension))
  $: if (romInfo?.requiresLayeredFs && outputMode === 'single-file') {
    outputMode = randomizerCapabilities?.directDirectoryOutput
      ? 'layeredfs-directory'
      : 'layeredfs-archive'
  }
  $: disabled =
    !gameName.length ||
    randomizingRun ||
    (randomizeRun
      ? !selected ||
        !romInfo ||
        inspectingRom ||
        (!useRandomSeed && !String(randomizerOptions.seed || '').trim())
      : !selected)
</script>

<svelte:head>
  <title>Nuzlocke Tracker | Create new game</title>
</svelte:head>

<ScreenContainer
  title={createMode === 'randomized'
    ? 'Create Randomized Run'
    : createMode === 'default'
      ? 'Select a New Nuzlocke'
      : 'Create New Run'}
  icon={File}
  className="mb-20 relative"
>
  {#if !createMode}
    <div class="grid gap-4 sm:grid-cols-2">
      <button
        type="button"
        on:click={selectCreateMode('default')}
        class="group grid aspect-square min-h-[16rem] place-items-center gap-4 rounded-lg border-2 border-gray-700 bg-gray-100 p-6 text-center text-gray-700 transition hover:border-orange-500 hover:text-orange-500 dark:border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-orange-400 dark:hover:text-orange-400"
      >
        <Icon icon={File} class="h-12 w-12 fill-current" />
        <strong class="max-w-[16ch] text-xl leading-6">
          Create Run with Default Settings
        </strong>
        <span class="max-w-[28ch] text-sm leading-5 opacity-75">
          Create a run which uses the default encounter and trainer data for the
          selected game.
        </span>
      </button>

      <button
        type="button"
        on:click={selectCreateMode('randomized')}
        class="group grid aspect-square min-h-[16rem] place-items-center gap-4 rounded-lg border-2 border-gray-700 bg-gray-100 p-6 text-center text-gray-700 transition hover:border-orange-500 hover:text-orange-500 dark:border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-orange-400 dark:hover:text-orange-400"
      >
        <Icon icon={Dice} class="h-12 w-12 fill-current" />
        <strong class="max-w-[16ch] text-xl leading-6">
          Create Randomized Run
        </strong>
        <span class="max-w-[28ch] text-sm leading-5 opacity-75">
          Create a run which randomizes an uploaded ROM and populates the
          encounter and trainer data with the randomized settings.
        </span>
      </button>
    </div>
  {:else if createMode === 'default'}
  <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-y-4">
    <Button rounded className="w-full sm:w-auto" on:click={handleBackToCreateMode}>
      Back
    </Button>

    <Input
      rounded
      placeholder="Name"
      className="sm:flex-1"
      maxlength={26}
      bind:value={gameName}
    />

    <AutoComplete
      max={Object.keys(validGames).length}
      itemF={(_) => Object.keys(validGames)}
      labelF={(i) => i && Games[i].title}
      placeholder="Game"
      class="block sm:hidden"
      bind:selected
    >
      <div
        class="flex inline-flex h-auto max-h-8 w-full items-center px-2 py-6"
        slot="option"
        let:option={i}
        let:label
      >
        {#if Games[i].logo}
          <Logo
            src="{IMG}{Games[i].logo}"
            alt={Games[i].title + ' logo'}
            class="mr-2 w-12"
            role="presentation"
            aspect="192x96"
          />
        {/if}
        {@html label}
      </div>
    </AutoComplete>

    {#if selectedGame?.difficulty}
      <div
        class="my-3 -mr-32 flex flex-auto basis-full flex-col gap-2 md:order-2 md:my-2 md:inline-flex md:flex-row"
      >
        <span
          ><b>Difficulty</b><br /><small class="sm:hidden"
            >This game offers multiple difficulty choices</small
          ></span
        >
        <Radio
          name="difficulty"
          options={difficultyOptions.map((d) => d.name)}
          className="!flex-row gap-x-1"
          bind:selected={difficulty}
        />
      </div>
    {/if}

    <Button rounded {disabled} on:click={handleNewGame}>
      Create game
    </Button>
  </div>

  <Tabs
    name="gens"
    className="hidden sm:flex"
    tabs={gens}
    bind:selected={gen}
  />

  <ul
    role="radiogroup"
    aria-labelledby="sc_title"
    class="grid hidden grid-cols-3 items-center justify-center gap-x-4 gap-y-6 sm:grid sm:grid-cols-4"
  >
    {#each Object.entries(validGames) as [id, game]}
      {#if game.logo && (gen === 'All' || game.gen === gen)}
        <button
          role="radio"
          aria-checked={selected === id}
          title="Pokemon {game.title}"
          on:click={handleSelect(id)}
          on:mouseenter={togglehover}
          on:mouseleave={togglehover}
          class="text-wrap group w-full cursor-pointer text-center text-xs font-medium transition-colors hover:text-yellow-500 dark:hover:text-yellow-300"
          class:dark:text-yellow-300={selected === id}
          class:text-yellow-500={selected === id}
        >
          <Logo
            src="{IMG}{game.logo}"
            aspect="192x96"
            role="presentation"
            alt={'Pokémon ' + game.title + ' logo'}
            class="mx-auto mb-2 w-24 transition group-hover:grayscale-0 {(selected &&
              selected !== id) ||
            hoverActive
              ? 'grayscale'
              : ''} {selected === id
              ? 'drop-shadow-highlight grayscale-0'
              : ''} cursor-pointer"
          />
          <strong class="mx-auto max-w-[16ch] line-clamp-2">{game.title}</strong
          >
        </button>
      {/if}
    {/each}
  </ul>
  {:else}
    <div class="grid gap-5">
      <div class="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-start">
        <Button rounded className="w-full md:w-auto" on:click={handleBackToCreateMode}>
          Back
        </Button>

        <Input
          rounded
          placeholder="Name"
          maxlength={26}
          bind:value={gameName}
        />

        <Button
          rounded
          {disabled}
          className="w-full md:w-auto"
          on:click={handleNewGame}
        >
          {randomizingRun ? 'Randomizing ROM' : 'Create randomized run'}
        </Button>
      </div>

      <section
        class="grid gap-5 rounded-lg border-2 border-gray-200 bg-gray-50 p-4 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
      >
        <div class="flex flex-col gap-4 md:flex-row md:items-start">
          <div class="grid gap-2 md:max-w-xs">
            <label
              class="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-gray-700 bg-gray-100 px-4 font-bold transition hover:border-orange-500 hover:text-orange-500 dark:border-gray-200 dark:bg-gray-900 dark:hover:border-orange-400 dark:hover:text-orange-400"
            >
              <Icon inline={true} icon={File} class="fill-current" />
              Select ROM
              <input
                class="sr-only"
                type="file"
                accept={romAccept}
                on:change={handleRomUpload}
              />
            </label>

            <p class="text-xs leading-4 opacity-70">
              ROM is never uploaded to the internet. Randomization happens
              entirely in-browser.
            </p>
          </div>

          {#if romInfo}
            <span class="text-sm leading-5">
              <b>{selectedGame?.title || romInfo.romName}</b>
              <span class="opacity-70">
                from {describeRomIdentity(romInfo)}
              </span>
              <span class="opacity-60">({romInfo.sizeLabel})</span>
            </span>
          {/if}

          {#if inspectingRom}
            <span class="text-sm font-bold text-orange-500">Inspecting ROM</span>
          {/if}

          {#if randomizingRun}
            <span class="text-sm font-bold text-orange-500">Randomizing ROM</span>
          {/if}

          {#if romError}
            <span class="text-sm font-bold text-red-500">{romError}</span>
          {/if}
        </div>

        {#if !romInfo}
          <p class="text-sm leading-5 opacity-70">
            Select a clean ROM recognized by UPR-ZX to load the supported
            randomizer options for that game.
          </p>
        {:else}
          <div class="grid gap-3">
            <label
              class="inline-flex h-10 w-fit items-center gap-2 rounded-lg border-2 border-gray-200 bg-[var(--input-bg)] px-3 text-xs font-bold uppercase text-gray-800 transition dark:border-gray-600 dark:text-gray-100"
            >
              <input
                type="checkbox"
                class="h-4 w-4 accent-orange-500"
                bind:checked={useRandomSeed}
              />
              <span>Use Random Seed</span>
            </label>

            {#if !useRandomSeed}
              <div class="grid gap-1 md:max-w-sm">
                <Input
                  rounded
                  placeholder="Seed"
                  maxlength={32}
                  bind:value={randomizerOptions.seed}
                />
                {#if !String(randomizerOptions.seed || '').trim()}
                  <span class="text-xs font-bold text-red-500">
                    Enter a seed or use a random seed.
                  </span>
                {/if}
              </div>
            {/if}
          </div>

          {#if is3dsRom}
            <div class="grid gap-4 md:grid-cols-[14rem_1fr]">
              <label
                class="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-gray-700 bg-gray-100 px-4 text-sm font-bold transition hover:border-orange-500 hover:text-orange-500 dark:border-gray-200 dark:bg-gray-900 dark:hover:border-orange-400 dark:hover:text-orange-400"
              >
                <Icon inline={true} icon={CloudUpload} class="fill-current" />
                Game update
                <input
                  class="sr-only"
                  type="file"
                  accept=".cia,.3ds,.cxi,.cci"
                  on:change={handleUpdateUpload}
                />
              </label>

              <div class="grid gap-2 md:grid-cols-2">
                <div class="grid gap-1 text-xs font-bold uppercase">
                  <span>Output</span>
                  <Select
                    rounded
                    name="Output"
                    options={availableOutputModes.map((mode) => ({
                      value: mode.id,
                      label: mode.label,
                      disabled: romInfo?.requiresLayeredFs && mode.id === 'single-file'
                    }))}
                    bind:value={outputMode}
                  />
                </div>

                {#if updateInfo}
                  <p class="self-end text-sm">
                    <b>{updateInfo.name}</b>
                    <span class="opacity-60">({updateInfo.sizeLabel})</span>
                  </p>
                {/if}
              </div>
            </div>
          {/if}

          {#if randomizerGroups.length}
            <div class="grid gap-4">
              <Tabs
                name="randomizer-options"
                className="!w-full border-b-2 border-gray-200 pb-1 dark:border-gray-700"
                labelClassName="text-xs font-bold uppercase"
                tabs={randomizerGroupTabs}
                bind:active={activeRandomizerGroup}
              />

              {#if activeRandomizerOptionGroup}
                <fieldset class="grid gap-3">
                  <legend class="sr-only">
                    {activeRandomizerOptionGroup.name}
                  </legend>

                  <div class="grid gap-4 md:grid-cols-2">
                    {#each activeRandomizerOptionGroup.options as option}
                      {#if option.type === 'checkbox'}
                        <label
                          class="inline-flex h-10 items-center gap-2 rounded-lg border-2 border-gray-200 bg-[var(--input-bg)] px-3 text-xs font-bold uppercase text-gray-800 transition dark:border-gray-600 dark:text-gray-100"
                          class:opacity-40={option.disabled}
                        >
                          <input
                            type="checkbox"
                            class="h-4 w-4 accent-orange-500"
                            checked={!!randomizerOptions[option.id]}
                            disabled={option.disabled}
                            on:change={setRandomizerOption(option.id, option.type)}
                          />
                          <span>{option.label}</span>
                        </label>
                      {:else if option.type === 'number'}
                        <label class="grid gap-1 text-xs font-bold uppercase">
                          {option.label}
                          <input
                            type="number"
                            class="h-10 rounded-lg border-2 border-gray-200 bg-[var(--input-bg)] px-3 text-xs normal-case tracking-normal text-gray-800 shadow-sm ring-2 ring-transparent transition-colors focus:border-gray-700 focus:outline-none disabled:cursor-default disabled:opacity-40 dark:border-gray-600 dark:text-gray-100 dark:focus:border-gray-200"
                            min={option.min}
                            max={option.max}
                            step={option.step || 1}
                            value={randomizerOptions[option.id] ?? option.default ?? 0}
                            disabled={option.disabled}
                            on:input={setRandomizerOption(option.id, option.type)}
                          />
                        </label>
                      {:else}
                        <div class="grid gap-1 text-xs font-bold uppercase">
                          <span>{option.label}</span>
                          <Select
                            rounded
                            name={option.id}
                            value={String(randomizerOptions[option.id] ?? option.default ?? '')}
                            options={choicesFor(option)}
                            disabled={option.disabled}
                            on:change={setRandomizerOption(option.id, option.type)}
                          />
                        </div>
                      {/if}
                    {/each}
                  </div>
                </fieldset>
              {/if}
            </div>
          {/if}
        {/if}
      </section>
    </div>
  {/if}
</ScreenContainer>

<div class="h-28 w-8" />

<script>
  import { savedGames, createGame } from '$lib/store'
  import { ScreenContainer } from '$lib/components/containers'

  import {
    Radio,
    Button,
    Tabs,
    Input,
    Logo,
    Tooltip
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
    buildRandomizerManifest,
    randomizerDefaults,
    randomizerOptionGroups,
    randomizerSettingsDefault
  } from '$lib/randomizer/options'

  let validGames = filterObj(Games, (g) => g.supported)

  let gameName = ''
  const handleNewGame = () => {
    if (!selectedGame?.supported)
      return alert(`Sorry, ${selectedGame?.title} is currently not supported`)

    let createid = selected
    if (selectedGame?.difficulty)
      createid += difficultyOptions?.[difficulty]?.id || ''

    const randomizer = randomizeRun ? createRandomizerManifest(createid) : null

    savedGames.update(
      createGame(
        gameName,
        createid,
        JSON.stringify(randomizer ? { __randomizer: randomizer } : {}),
        randomizer
          ? {
              randomizer,
              settings: randomizerSettingsDefault(settingsDefault)
            }
          : {}
      )
    )
    window.location = '/game'
  }

  import { generateRoute } from '$lib/services/routeGenerator'

  const handleGenGame = () => {
    if (!selectedGame?.supported)
      return alert(`Sorry, ${selectedGame?.title} is currently not supported`)

    const result = generateRoute(selectedGame?.pid)
    if (result) {
      let createid = selected
      if (selectedGame?.difficulty)
        createid += difficultyOptions?.[difficulty]?.id || ''

      savedGames.update(createGame(gameName, createid, JSON.stringify(result)))
      window.location = '/game'
    }
  }

  let hoverActive = false
  const togglehover = () => (hoverActive = !hoverActive)

  let selected
  const handleSelect = (id) => () =>
    selected === id ? (selected = null) : (selected = id)

  let randomizeRun = false
  let romInfo = null
  let romError = ''
  let randomizerOptions = { ...randomizerDefaults }

  const validRomExtensions = ['gb', 'gbc', 'gba', 'nds', '3ds', 'cia']
  const romAccept = validRomExtensions.map((ext) => `.${ext}`).join(',')

  const handleRomUpload = async (event) => {
    const file = event.currentTarget.files?.[0]
    romInfo = null
    romError = ''

    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!validRomExtensions.includes(ext)) {
      romError = 'Unsupported ROM file'
      return
    }

    romInfo = {
      name: file.name,
      size: file.size,
      sizeLabel: formatBytes(file.size),
      extension: ext,
      lastModified: file.lastModified,
      sha256: await sha256(file)
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

  const setRandomizerOption = (id) => (event) => {
    randomizerOptions = {
      ...randomizerOptions,
      [id]: event.currentTarget.value
    }
  }

  const createRandomizerManifest = (gameKey) =>
    buildRandomizerManifest({
      runId: shortuuid(),
      game: selectedGame,
      gameKey,
      options: randomizerOptions,
      rom: romInfo
    })

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
        ? `${selectedGame?.title} Nuzlocke`
        : ''
    }
  }

  $: difficultyOptions = selectedGame?.difficulty?.map((d) => ({
    id: d.split(':')[1],
    name: d.split(':')[0] || 'Normal'
  }))
  $: selectedGame = validGames[selected]
  $: disabled = !gameName.length || !selected || (randomizeRun && !romInfo)
</script>

<svelte:head>
  <title>Nuzlocke Tracker | Create new game</title>
</svelte:head>

<ScreenContainer
  title="Select a New Nuzlocke"
  icon={File}
  className="mb-20 relative"
>
  <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-y-4">
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

    <label
      class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border-2 border-gray-700 bg-gray-100 px-4 text-sm text-gray-700 transition hover:border-orange-500 hover:text-orange-500 dark:border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-orange-400 dark:hover:text-orange-400"
    >
      <input
        type="checkbox"
        class="h-4 w-4 accent-orange-500"
        bind:checked={randomizeRun}
      />
      Custom randomized run
    </label>

    <Button rounded {disabled} on:click={handleNewGame}>
      {randomizeRun ? 'Create randomized run' : 'Create game'}
    </Button>
    <div>
      <Tooltip
        >Generate a game with pre-randomized encounters, designed for games like
        Scarlet & Violet with overworld only encounters</Tooltip
      >
      <Button
        className="w-full md:w-auto"
        rounded
        {disabled}
        on:click={handleGenGame}
      >
        Randomize
        <Icon inline="true" icon={Dice} class="inline" />
      </Button>
    </div>
  </div>

  {#if randomizeRun}
    <section
      class="mt-6 grid gap-5 rounded-lg border-2 border-gray-200 bg-gray-50 p-4 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center">
        <label
          class="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-gray-700 bg-gray-100 px-4 font-bold transition hover:border-orange-500 hover:text-orange-500 dark:border-gray-200 dark:bg-gray-900 dark:hover:border-orange-400 dark:hover:text-orange-400"
        >
          <Icon inline={true} icon={CloudUpload} class="fill-current" />
          Upload ROM
          <input
            class="sr-only"
            type="file"
            accept={romAccept}
            on:change={handleRomUpload}
          />
        </label>

        {#if romInfo}
          <span class="text-sm">
            <b>{romInfo.name}</b>
            <span class="opacity-60">({romInfo.sizeLabel})</span>
          </span>
        {/if}

        {#if romError}
          <span class="text-sm font-bold text-red-500">{romError}</span>
        {/if}
      </div>

      <div class="grid gap-4 md:grid-cols-[14rem_1fr]">
        <Input
          rounded
          placeholder="Seed"
          maxlength={32}
          bind:value={randomizerOptions.seed}
        />

        <p class="self-center text-xs leading-5 opacity-70">
          ROM bytes stay local in this browser. The tracker stores the selected
          options and ROM fingerprint with the run.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        {#each randomizerOptionGroups as group}
          <fieldset class="grid gap-3 border-t-2 border-gray-200 pt-3 dark:border-gray-700">
            <legend class="pr-3 font-bold">{group.name}</legend>

            {#each group.options as option}
              <label class="grid gap-1 text-xs font-bold uppercase">
                {option.label}
                <select
                  class="h-10 rounded-lg border-2 border-gray-200 bg-white px-3 text-sm normal-case tracking-normal text-gray-800 transition focus:border-gray-700 focus:outline-none dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-200"
                  value={randomizerOptions[option.id]}
                  on:change={setRandomizerOption(option.id)}
                >
                  {#each option.choices as [value, label]}
                    <option {value}>{label}</option>
                  {/each}
                </select>
              </label>
            {/each}
          </fieldset>
        {/each}
      </div>
    </section>
  {/if}

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
</ScreenContainer>

<div class="h-28 w-8" />

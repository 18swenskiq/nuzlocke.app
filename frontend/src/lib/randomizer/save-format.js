const COMPACT_RESULTS_FORMAT = 'nuzlocke-randomizer-results-v1'

export const compactRandomizerManifest = (randomizer) => {
  if (!isPlainObject(randomizer)) return randomizer

  return cleanObject({
    ...randomizer,
    options: undefined,
    rom: compactRomInfo(randomizer.rom),
    results: compactRandomizerResults(randomizer.results),
    extractedData: compactRandomizerResults(randomizer.extractedData)
  })
}

export const compactGameData = (gameData) => {
  const data = parseGameData(gameData)
  if (!isPlainObject(data) || !data.__randomizer) return data

  return {
    ...data,
    __randomizer: compactRandomizerManifest(data.__randomizer)
  }
}

export const compactGameDataString = (gameData) => {
  if (typeof gameData === 'string' && !gameData.includes('__randomizer')) {
    return gameData
  }
  return JSON.stringify(compactGameData(gameData) || {})
}

export const hydrateRandomizerResults = (results) => {
  if (!isPlainObject(results) || results.format !== COMPACT_RESULTS_FORMAT) {
    return results
  }

  const dictionaries = results.dictionaries || {}
  const route = Array.isArray(results.route)
    ? results.route.map(hydrateRoute)
    : undefined
  const important = Array.isArray(results.trainers?.important)
    ? results.trainers.important.map((pair) => hydrateTrainerPair(pair, dictionaries))
    : undefined
  const league = hydrateLeague(results.league, important, dictionaries)
  const trainers = cleanObject({
    ...results.trainers,
    important,
    pairs: important,
    league
  })

  return cleanObject({
    ...results,
    format: undefined,
    dictionaries: undefined,
    route,
    routes: route,
    trainers,
    league
  })
}

const compactRandomizerResults = (results) => {
  if (!isPlainObject(results) || results.format === COMPACT_RESULTS_FORMAT) {
    return results
  }

  const dictionaries = {
    moves: {},
    pokemon: {},
    abilities: {}
  }
  const routeSource = Array.isArray(results.route)
    ? results.route
    : Array.isArray(results.routes)
      ? results.routes
      : undefined
  const importantSource = Array.isArray(results.trainers?.important)
    ? results.trainers.important
    : Array.isArray(results.trainers?.pairs)
      ? results.trainers.pairs
      : undefined
  const compactImportant = importantSource?.map((pair) =>
    compactTrainerPair(pair, dictionaries)
  )

  return cleanObject({
    format: COMPACT_RESULTS_FORMAT,
    dictionaries: cleanDictionaries(dictionaries),
    warnings: results.warnings,
    route: routeSource?.map(compactRoute),
    trainers: cleanObject({
      important: compactImportant,
      importantCount: results.trainers?.importantCount ?? compactImportant?.length
    }),
    league: compactImportant
      ? undefined
      : compactTrainerMap(results.league || results.trainers?.league, dictionaries)
  })
}

const compactRomInfo = (rom) => {
  if (!isPlainObject(rom)) return rom

  return cleanObject({
    name: rom.name,
    romName: rom.romName,
    code: rom.code,
    romCode: rom.romCode,
    sha256: rom.sha256,
    size: rom.size,
    extension: rom.extension,
    defaultExtension: rom.defaultExtension,
    generation: rom.generation,
    supportLevel: rom.supportLevel,
    clean: rom.clean,
    supported: rom.supported,
    nintendoDs: rom.nintendoDs,
    nintendo3ds: rom.nintendo3ds,
    requiresLayeredFs: rom.requiresLayeredFs,
    update: compactRomUpdate(rom.update)
  })
}

const compactRomUpdate = (update) => {
  if (!isPlainObject(update)) return update
  return cleanObject({
    name: update.name,
    sha256: update.sha256,
    size: update.size,
    extension: update.extension
  })
}

const compactRoute = (route) => {
  if (!isPlainObject(route)) return route

  const encounterGroups = Array.isArray(route.randomizerTables)
    ? route.randomizerTables.map(compactEncounterGroup).filter(Boolean)
    : undefined

  return cleanObject({
    type: route.type,
    name: route.name,
    source: route.source,
    encounters: encounterGroups?.length ? undefined : route.encounters,
    encounterGroups
  })
}

const compactEncounterGroup = (group) => {
  if (!isPlainObject(group)) return null
  return cleanObject({
    method: normalizeEncounterMethod(group.method || group.name),
    rate: group.rate,
    pokemon: unique(group.encounters || group.pokemon || [])
  })
}

const compactTrainerPair = (pair, dictionaries) => {
  if (!isPlainObject(pair)) return pair

  return cleanObject({
    id: pair.id,
    index: pair.index,
    tag: pair.tag,
    name: pair.name,
    group: pair.group,
    important: pair.important,
    boss: pair.boss,
    original: compactTrainer(pair.original, dictionaries),
    randomized: compactTrainer(pair.randomized || pair.after || pair.trainer, dictionaries)
  })
}

const compactTrainerMap = (trainers, dictionaries) => {
  if (!isPlainObject(trainers)) return undefined

  return Object.fromEntries(
    Object.entries(trainers)
      .map(([id, trainer]) => [id, compactTrainer(trainer, dictionaries)])
      .filter(([, trainer]) => trainer)
  )
}

const compactTrainer = (trainer, dictionaries) => {
  if (!isPlainObject(trainer)) return trainer

  return cleanObject({
    ...trainer,
    pokemon: Array.isArray(trainer.pokemon)
      ? trainer.pokemon.map((pokemon) => compactPokemon(pokemon, dictionaries))
      : trainer.pokemon
  })
}

const compactPokemon = (pokemon, dictionaries) => {
  if (!isPlainObject(pokemon)) return pokemon

  const {
    name,
    number,
    sprite,
    icon,
    imgUrl,
    types,
    stats,
    moves,
    ability,
    abilities,
    ...rest
  } = pokemon
  const speciesKey = pokemonSpeciesKey(pokemon)

  dictionaries.pokemon[speciesKey] = mergeDefined(dictionaries.pokemon[speciesKey], {
    name,
    number,
    sprite,
    icon,
    imgUrl,
    types,
    stats
  })

  return cleanObject({
    ...rest,
    species: speciesKey,
    moves: Array.isArray(moves)
      ? moves.map((move) => compactMove(move, dictionaries)).filter(Boolean)
      : moves,
    ability: compactAbility(ability, dictionaries),
    abilities: Array.isArray(abilities)
      ? abilities.map((item) => compactAbility(item, dictionaries)).filter(Boolean)
      : abilities
  })
}

const compactMove = (move, dictionaries) => {
  if (!move) return null
  if (typeof move === 'string') return move

  const key = move.name || move.id
  if (!key) return null
  dictionaries.moves[key] = mergeDefined(dictionaries.moves[key], move)
  return key
}

const compactAbility = (ability, dictionaries) => {
  if (!ability) return ability
  if (typeof ability === 'string') return ability

  const key = ability.name || ability.id || ability.sprite
  if (!key) return null
  dictionaries.abilities[key] = mergeDefined(dictionaries.abilities[key], ability)
  return key
}

const hydrateRoute = (route) => {
  if (!isPlainObject(route)) return route

  const encounterGroups = Array.isArray(route.encounterGroups)
    ? route.encounterGroups
    : null
  if (!encounterGroups) return route

  const encounters = unique(encounterGroups.flatMap((group) => group.pokemon || []))
  return cleanObject({
    ...route,
    encounterGroups: undefined,
    encounters,
    randomizerNormalized: true,
    randomizerOriginalNames: encounterGroups.map(
      (group) => `${group.method || 'Encounter'} on ${route.name}`
    ),
    randomizerTables: encounterGroups.map((group) => ({
      name: `${group.method || 'Encounter'} on ${route.name}`,
      method: group.method,
      rate: group.rate ?? null,
      encounters: group.pokemon || []
    }))
  })
}

const hydrateTrainerPair = (pair, dictionaries) => {
  if (!isPlainObject(pair)) return pair

  return cleanObject({
    ...pair,
    original: hydrateTrainer(pair.original, dictionaries),
    randomized: hydrateTrainer(pair.randomized, dictionaries)
  })
}

const hydrateLeague = (league, important, dictionaries) => {
  if (isPlainObject(league)) {
    return Object.fromEntries(
      Object.entries(league).map(([id, trainer]) => [
        id,
        hydrateTrainer(trainer, dictionaries)
      ])
    )
  }

  if (!Array.isArray(important)) return undefined

  return Object.fromEntries(
    important
      .map((pair) => {
        const trainer = pair?.randomized
        const id = pair?.id || trainer?.id
        return id && trainer ? [id, trainer] : null
      })
      .filter(Boolean)
  )
}

const hydrateTrainer = (trainer, dictionaries) => {
  if (!isPlainObject(trainer)) return trainer

  return cleanObject({
    ...trainer,
    pokemon: Array.isArray(trainer.pokemon)
      ? trainer.pokemon.map((pokemon) => hydratePokemon(pokemon, dictionaries))
      : trainer.pokemon
  })
}

const hydratePokemon = (pokemon, dictionaries) => {
  if (!isPlainObject(pokemon)) return pokemon

  const species = dictionaries.pokemon?.[pokemon.species] || {}
  return cleanObject({
    ...species,
    ...pokemon,
    species: undefined,
    moves: Array.isArray(pokemon.moves)
      ? pokemon.moves.map((move) => dictionaries.moves?.[move] || { name: move })
      : pokemon.moves,
    ability:
      typeof pokemon.ability === 'string'
        ? dictionaries.abilities?.[pokemon.ability] || { name: pokemon.ability }
        : pokemon.ability,
    abilities: Array.isArray(pokemon.abilities)
      ? pokemon.abilities.map(
          (ability) => dictionaries.abilities?.[ability] || { name: ability }
        )
      : pokemon.abilities
  })
}

const cleanDictionaries = (dictionaries) =>
  cleanObject({
    moves: hasKeys(dictionaries.moves) ? dictionaries.moves : undefined,
    pokemon: hasKeys(dictionaries.pokemon) ? dictionaries.pokemon : undefined,
    abilities: hasKeys(dictionaries.abilities) ? dictionaries.abilities : undefined
  })

const pokemonSpeciesKey = (pokemon) =>
  [pokemon.name, pokemon.number, pokemon.sprite].filter(Boolean).join('|') ||
  pokemon.alias ||
  'unknown'

const normalizeEncounterMethod = (method) => {
  const value = String(method || '').trim()
  if (!value) return null
  return value
    .replace(/\s+on\s+.+$/i, '')
    .replace(/^[^:]+:\s*/, '')
    .trim()
}

const parseGameData = (gameData) => {
  if (typeof gameData !== 'string') return gameData
  try {
    return JSON.parse(gameData || '{}')
  } catch (error) {
    console.error('[randomizer-save-format] Unable to parse game data', error)
    return {}
  }
}

const cleanObject = (value) => {
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  )
}

const mergeDefined = (left = {}, right = {}) =>
  cleanObject({
    ...left,
    ...cleanObject(right)
  })

const unique = (values = []) => {
  const seen = new Set()
  const result = []
  for (const value of values) {
    if (value == null || value === '' || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

const hasKeys = (value) => isPlainObject(value) && Object.keys(value).length > 0

const isPlainObject = (value) =>
  !!value && !Array.isArray(value) && typeof value === 'object'

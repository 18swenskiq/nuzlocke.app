const POKEAPI_BASE = 'https://pokeapi.co/api/v2/pokemon'

export const POKEAPI_UNOWN_SPRITE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/201.png'

const pokemonCache = new Map()
const resolvedSpriteCache = new Map()

const VERSION_SCAN_ORDER = [
  ['generation-i', 'red-blue'],
  ['generation-i', 'yellow'],
  ['generation-ii', 'gold'],
  ['generation-ii', 'silver'],
  ['generation-ii', 'crystal'],
  ['generation-iii', 'ruby-sapphire'],
  ['generation-iii', 'emerald'],
  ['generation-iii', 'firered-leafgreen'],
  ['generation-iv', 'diamond-pearl'],
  ['generation-iv', 'platinum'],
  ['generation-iv', 'heartgold-soulsilver'],
  ['generation-v', 'black-white'],
  ['generation-vi', 'x-y'],
  ['generation-vi', 'omegaruby-alphasapphire'],
  ['generation-vii', 'sun-moon'],
  ['generation-vii', 'ultra-sun-ultra-moon'],
  ['generation-viii', 'icons']
]

const GAME_VERSION_PREFERENCES = {
  red: [['generation-i', 'red-blue']],
  blue: [['generation-i', 'red-blue']],
  yel: [['generation-i', 'yellow'], ['generation-i', 'red-blue']],
  yellow: [['generation-i', 'yellow'], ['generation-i', 'red-blue']],

  gold: [['generation-ii', 'gold'], ['generation-ii', 'silver']],
  silv: [['generation-ii', 'silver'], ['generation-ii', 'gold']],
  silver: [['generation-ii', 'silver'], ['generation-ii', 'gold']],
  crys: [['generation-ii', 'crystal'], ['generation-ii', 'gold'], ['generation-ii', 'silver']],
  crystal: [['generation-ii', 'crystal'], ['generation-ii', 'gold'], ['generation-ii', 'silver']],

  ruby: [['generation-iii', 'ruby-sapphire'], ['generation-iii', 'emerald']],
  saph: [['generation-iii', 'ruby-sapphire'], ['generation-iii', 'emerald']],
  sapphire: [['generation-iii', 'ruby-sapphire'], ['generation-iii', 'emerald']],
  em: [['generation-iii', 'emerald'], ['generation-iii', 'ruby-sapphire']],
  emerald: [['generation-iii', 'emerald'], ['generation-iii', 'ruby-sapphire']],
  blazingem: [['generation-iii', 'emerald'], ['generation-iii', 'ruby-sapphire']],
  emrunbun: [['generation-iii', 'emerald'], ['generation-iii', 'ruby-sapphire']],
  emkaizo: [['generation-iii', 'emerald'], ['generation-iii', 'ruby-sapphire']],
  incem: [['generation-iii', 'emerald'], ['generation-iii', 'ruby-sapphire']],
  fr: [['generation-iii', 'firered-leafgreen'], ['generation-i', 'red-blue']],
  lg: [['generation-iii', 'firered-leafgreen'], ['generation-i', 'red-blue']],
  leaf: [['generation-iii', 'firered-leafgreen'], ['generation-i', 'red-blue']],
  radred: [['generation-iii', 'firered-leafgreen'], ['generation-i', 'red-blue']],

  d: [['generation-iv', 'diamond-pearl'], ['generation-iv', 'platinum']],
  p: [['generation-iv', 'diamond-pearl'], ['generation-iv', 'platinum']],
  pl: [['generation-iv', 'platinum'], ['generation-iv', 'diamond-pearl']],
  bd: [['generation-iv', 'diamond-pearl'], ['generation-iv', 'platinum']],
  sp: [['generation-iv', 'diamond-pearl'], ['generation-iv', 'platinum']],
  hg: [['generation-iv', 'heartgold-soulsilver'], ['generation-iv', 'diamond-pearl']],
  ss: [['generation-iv', 'heartgold-soulsilver'], ['generation-iv', 'diamond-pearl']],
  sacredgold: [['generation-iv', 'heartgold-soulsilver'], ['generation-iv', 'diamond-pearl']],
  stormsilv: [['generation-iv', 'heartgold-soulsilver'], ['generation-iv', 'diamond-pearl']],

  bl: [['generation-v', 'black-white']],
  wh: [['generation-v', 'black-white']],
  bl2: [['generation-v', 'black-white']],
  wh2: [['generation-v', 'black-white']],
  bl2c: [['generation-v', 'black-white']],
  wh2c: [['generation-v', 'black-white']],
  blaze: [['generation-v', 'black-white']],
  blazevolt2: [['generation-v', 'black-white']],

  x: [['generation-vi', 'x-y']],
  y: [['generation-vi', 'x-y']],
  or: [['generation-vi', 'omegaruby-alphasapphire'], ['generation-iii', 'ruby-sapphire']],
  as: [['generation-vi', 'omegaruby-alphasapphire'], ['generation-iii', 'ruby-sapphire']],
  rrss: [['generation-vi', 'omegaruby-alphasapphire'], ['generation-iii', 'ruby-sapphire']],
  ssaph: [['generation-vi', 'omegaruby-alphasapphire'], ['generation-iii', 'ruby-sapphire']],

  sun: [['generation-vii', 'sun-moon']],
  moon: [['generation-vii', 'sun-moon']],
  usun: [['generation-vii', 'ultra-sun-ultra-moon'], ['generation-vii', 'sun-moon']],
  umoon: [['generation-vii', 'ultra-sun-ultra-moon'], ['generation-vii', 'sun-moon']],

  sw: [['generation-viii', 'icons']],
  sh: [['generation-viii', 'icons']]
}

const GENERATION_VERSION_FALLBACKS = {
  'generation-i': [
    ['generation-i', 'red-blue'],
    ['generation-i', 'yellow']
  ],
  'generation-ii': [
    ['generation-ii', 'gold'],
    ['generation-ii', 'silver'],
    ['generation-ii', 'crystal']
  ],
  'generation-iii': [
    ['generation-iii', 'emerald'],
    ['generation-iii', 'ruby-sapphire'],
    ['generation-iii', 'firered-leafgreen']
  ],
  'generation-iv': [
    ['generation-iv', 'platinum'],
    ['generation-iv', 'diamond-pearl'],
    ['generation-iv', 'heartgold-soulsilver']
  ],
  'generation-v': [['generation-v', 'black-white']],
  'generation-vi': [
    ['generation-vi', 'x-y'],
    ['generation-vi', 'omegaruby-alphasapphire']
  ],
  'generation-vii': [
    ['generation-vii', 'ultra-sun-ultra-moon'],
    ['generation-vii', 'sun-moon']
  ],
  'generation-viii': [['generation-viii', 'icons']]
}

export const pokemonSpriteKey = (pokemon = {}, index = 0) =>
  [
    pokemon.name,
    pokemon.number,
    pokemon.num,
    pokemon.sprite,
    pokemon.imgId,
    pokemon.imgUrl,
    pokemon.level,
    index
  ]
    .filter((value) => value != null && value !== '')
    .join(':')

export const resolvePokeApiSprite = async (pokemon, game, options = {}) => {
  const cacheKey = `${gameKey(game)}:${options.shiny ? 'shiny' : 'default'}:${pokemonSpriteKey(pokemon)}`
  if (resolvedSpriteCache.has(cacheKey)) return resolvedSpriteCache.get(cacheKey)

  const spritePromise = fetchPokemon(pokemon)
    .then((data) => selectVersionedSprite(data?.sprites, game, options))
    .then((sprite) => sprite || POKEAPI_UNOWN_SPRITE)
    .catch((error) => {
      console.error('[pokeapi:sprite]', pokemon?.name || pokemon?.number || pokemon, error)
      return POKEAPI_UNOWN_SPRITE
    })

  resolvedSpriteCache.set(cacheKey, spritePromise)
  return spritePromise
}

export const selectVersionedSprite = (sprites, game, { shiny = false } = {}) => {
  if (!sprites) return null

  const spriteKey = shiny ? 'front_shiny' : 'front_default'
  const preferred = preferredVersionPaths(game)
  for (const [generation, version] of preferred) {
    const sprite = readSprite(sprites, generation, version, spriteKey)
    if (sprite) return sprite
  }

  for (const [generation, version] of VERSION_SCAN_ORDER) {
    const sprite = readSprite(sprites, generation, version, spriteKey)
    if (sprite) return sprite
  }

  return sprites[spriteKey] || sprites.other?.['official-artwork']?.[spriteKey] || null
}

const fetchPokemon = async (pokemon) => {
  const identifiers = pokemonIdentifiers(pokemon)
  let lastError

  for (const identifier of identifiers) {
    try {
      return await fetchPokemonByIdentifier(identifier)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Missing Pokemon identifier')
}

const fetchPokemonByIdentifier = async (identifier) => {
  const key = String(identifier).toLowerCase()
  if (pokemonCache.has(key)) return pokemonCache.get(key)

  const promise = fetch(`${POKEAPI_BASE}/${encodeURIComponent(key)}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`PokeAPI sprite lookup failed for "${key}": ${response.status}`)
      }
      return response.json()
    })

  pokemonCache.set(key, promise)
  return promise
}

const pokemonIdentifiers = (pokemon = {}) =>
  unique([
    normalizePokemonName(pokemon.pokeApiName),
    normalizePokemonName(pokemon.name),
    normalizePokemonName(pokemon.alias),
    normalizePokemonName(pokemon.species),
    numericIdentifier(pokemon.number),
    numericIdentifier(pokemon.num),
    numericIdentifier(pokemon.imgId),
    numericIdentifier(pokemon.sprite),
    normalizePokemonName(pokemon.imgId),
    normalizePokemonName(pokemon.sprite)
  ]).filter(Boolean)

const preferredVersionPaths = (game) => {
  const key = gameKey(game)
  const direct = GAME_VERSION_PREFERENCES[key] || []
  const generation = pokeApiGeneration(game, direct)

  if (!generation) {
    return uniquePairs(direct)
  }

  const sameGeneration = direct.filter(([candidate]) => candidate === generation)
  const crossGeneration = direct.filter(([candidate]) => candidate !== generation)

  return uniquePairs([
    ...sameGeneration,
    ...(GENERATION_VERSION_FALLBACKS[generation] || []),
    ...crossGeneration
  ])
}

const pokeApiGeneration = (game, direct = []) => {
  const gen = gameGen(game)
  if (gen === 'i') return 'generation-i'
  if (gen === 'ii') return 'generation-ii'
  if (gen === 'iii') return 'generation-iii'
  if (gen === 'iv') return 'generation-iv'
  if (gen === 'v') return 'generation-v'
  if (gen === 'vi') return 'generation-vi'
  if (gen === 'vii') return 'generation-vii'
  if (gen === 'viii') return 'generation-viii'
  return direct[0]?.[0] || null
}

const readSprite = (sprites, generation, version, spriteKey) =>
  sprites.versions?.[generation]?.[version]?.[spriteKey] || null

const gameKey = (game) =>
  String(typeof game === 'object' ? game?.pid || game?.id || game?.key || '' : game || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')

const gameGen = (game) =>
  String(typeof game === 'object' ? game?.gen || '' : '')
    .toLowerCase()
    .replace(/^generation-/, '')

const normalizePokemonName = (value) => {
  const text = String(value || '').trim().toLowerCase()
  if (!text || /^\d+$/.test(text)) return ''

  return text
    .replace(/\u2640/g, '-f')
    .replace(/\u2642/g, '-m')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const numericIdentifier = (value) => {
  const text = String(value || '').replace(/\.(png|webp)$/i, '')
  return /^\d+$/.test(text) ? text : ''
}

const unique = (values = []) => [...new Set(values.filter(Boolean))]

const uniquePairs = (pairs = []) => {
  const seen = new Set()
  const result = []
  for (const pair of pairs) {
    if (!pair?.[0] || !pair?.[1]) continue
    const key = pair.join(':')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(pair)
  }
  return result
}

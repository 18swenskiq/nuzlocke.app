const POKE_API = 'https://pokeapi.co/api/v2/pokemon'
const SPRITE_CACHE_KEY = 'nuzlocke:pokemon-home-sprites:v1'

let spriteCache
const pendingSprites = new Map()

const pokemonId = (pokemon) => {
  const value =
    typeof pokemon === 'object'
      ? pokemon?.imgId || pokemon?.num || pokemon?.sprite
      : pokemon

  return String(value || '')
    .replace('.png', '')
    .replace('.webp', '')
}

export const pokemonSpriteKey = (pokemon, { shiny = false } = {}) => {
  const id = pokemonId(pokemon)
  return id ? `${id}:${shiny ? 'shiny' : 'default'}` : ''
}

const readSpriteCache = () => {
  if (spriteCache) return spriteCache
  spriteCache = {}

  if (typeof localStorage === 'undefined') return spriteCache

  try {
    const storedSprites = JSON.parse(
      localStorage.getItem(SPRITE_CACHE_KEY) || '{}'
    )
    spriteCache =
      storedSprites && typeof storedSprites === 'object' ? storedSprites : {}
  } catch {
    // Storage can be unavailable or contain stale data.
  }

  return spriteCache
}

const writeSpriteCache = () => {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(SPRITE_CACHE_KEY, JSON.stringify(spriteCache))
  } catch {
    // The in-memory cache still helps when persistent storage is unavailable.
  }
}

const preloadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => resolve(src)
    img.onerror = reject
    img.src = src
  })

export const loadPokemonSprite = async (
  pokemon,
  { shiny = false, preload = true } = {}
) => {
  const id = pokemonId(pokemon)
  if (!id) throw new Error('A Pokemon id is required')

  const key = pokemonSpriteKey(id, { shiny })
  const cache = readSpriteCache()
  const cachedSprite = cache[key] || (!shiny && cache[id])

  if (cachedSprite) {
    return preload ? preloadImage(cachedSprite) : cachedSprite
  }

  if (!pendingSprites.has(key)) {
    pendingSprites.set(
      key,
      fetch(`${POKE_API}/${id}/`)
        .then((response) => {
          if (!response.ok)
            throw new Error(`PokeAPI returned ${response.status}`)
          return response.json()
        })
        .then((data) => {
          const home = data?.sprites?.other?.home
          const src = shiny
            ? home?.front_shiny || data?.sprites?.front_shiny
            : home?.front_default || data?.sprites?.front_default

          if (!src) throw new Error(`No sprite found for Pokemon #${id}`)

          cache[key] = src
          writeSpriteCache()
          return src
        })
        .finally(() => pendingSprites.delete(key))
    )
  }

  const src = await pendingSprites.get(key)
  return preload ? preloadImage(src) : src
}

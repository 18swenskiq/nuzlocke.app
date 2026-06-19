const METHOD_SUFFIXES = [
  'Rippling Water Fishing',
  'Night Fishing Replacement',
  'Fishing Swarm',
  'Hoenn/Sinnoh Radio',
  'Swarm/Radar/GBA',
  'Rough Terrain/Tall Grass',
  'DexNav Foreign Encounter',
  'Common Horde',
  'Uncommon Horde',
  'Rare Horde',
  'Yellow Flowers',
  'Purple Flowers',
  'Red Flowers',
  'Doubles Grass',
  'Double Grass',
  'Shaking Spots',
  'Grass/Cave',
  'Long Grass',
  'Rock Smash',
  'Old Rod',
  'Good Rod',
  'Super Rod',
  'Surfing',
  'Surf',
  'Fishing',
  'Swarms',
  'Swarm',
  'Headbutt',
  'Radio',
  'Ceiling Encounter',
  'Sky Encounter',
  'Encounter'
]

const TIME_SUFFIXES = [
  'Morning',
  'Day',
  'Night',
  'Dawn',
  'Dusk',
  'Tuesday',
  'Tuesdays',
  'Thursday',
  'Thursdays',
  'Saturday',
  'Saturdays'
]

export const normalizeRandomizerResults = (results, canonicalRoutes) => {
  if (!results || typeof results !== 'object') return results

  const routes = Array.isArray(results.route)
    ? results.route
    : Array.isArray(results.routes)
      ? results.routes
      : null

  if (!routes) return results

  const route = normalizeRandomizerRoutes(routes, canonicalRoutes)
  return {
    ...results,
    route,
    routes: route,
    tracker: results.tracker
      ? {
          ...results.tracker,
          route
        }
      : results.tracker,
    trackerData: results.trackerData
      ? {
          ...results.trackerData,
          route
        }
      : results.trackerData
  }
}

export const mergeRandomizerRouteData = (baseRoutes = [], results, canonicalRoutes = baseRoutes) => {
  if (!Array.isArray(baseRoutes)) return baseRoutes

  const normalizedResults = normalizeRandomizerResults(results, canonicalRoutes)
  const randomizerRoutes = Array.isArray(normalizedResults?.route)
    ? normalizedResults.route
    : Array.isArray(normalizedResults?.routes)
      ? normalizedResults.routes
      : null

  if (!randomizerRoutes) return baseRoutes

  const randomizerByName = new Map()
  const extraRoutes = []
  const used = new Set()

  for (const route of randomizerRoutes) {
    if (!route || route.type !== 'route' || !Array.isArray(route.encounters)) {
      continue
    }

    const key = routeKey(route.name)
    if (!key) continue

    const existing = randomizerByName.get(key)
    if (existing) {
      existing.encounters = unique([...(existing.encounters || []), ...route.encounters])
      existing.randomizerOriginalNames = unique([
        ...(existing.randomizerOriginalNames || []),
        ...(route.randomizerOriginalNames || [route.name])
      ])
      existing.randomizerTables = [
        ...(existing.randomizerTables || []),
        ...(route.randomizerTables || [])
      ]
    } else {
      randomizerByName.set(key, route)
    }
  }

  const merged = baseRoutes.map((route) => {
    if (!route || route.type !== 'route') return route

    const match = randomizerByName.get(routeKey(route.name))
    if (!match) return route

    used.add(routeKey(match.name))
    return {
      ...route,
      encounters: match.encounters || [],
      randomizerNormalized: true,
      randomizerOriginalNames: match.randomizerOriginalNames || [match.name],
      randomizerTables: match.randomizerTables || []
    }
  })

  for (const [key, route] of randomizerByName.entries()) {
    if (!used.has(key)) {
      extraRoutes.push(route)
    }
  }

  return [...merged, ...extraRoutes]
}

export const normalizeRandomizerRoutes = (routes = [], gameKey) => {
  if (!Array.isArray(routes)) return routes

  const canonical = canonicalRouteIndex(gameKey)
  const output = []
  const grouped = new Map()

  for (const route of routes) {
    if (!shouldNormalizeRoute(route)) {
      output.push(route)
      continue
    }

    const normalized = normalizeRandomizerLocationName(route.name, canonical)
    const key = routeKey(normalized.name)
    let entry = grouped.get(key)

    if (!entry) {
      entry = {
        ...route,
        name: normalized.name,
        encounters: [],
        randomizerNormalized: true,
        randomizerOriginalNames: [],
        randomizerTables: []
      }
      delete entry.rate
      grouped.set(key, entry)
      output.push(entry)
    }

    entry.randomizerOriginalNames = unique([
      ...entry.randomizerOriginalNames,
      route.name
    ])
    entry.randomizerTables.push({
      name: route.name,
      method: normalized.method,
      rate: route.rate ?? null,
      encounters: route.encounters || []
    })
    entry.encounters = unique([...(entry.encounters || []), ...(route.encounters || [])])
  }

  return output
}

export const normalizeRandomizerLocationName = (name, canonical = new Map()) => {
  const original = String(name || '').trim()
  if (!original) return { name: 'Encounter Area', method: null }
  if (isStandaloneEncounterGroup(original)) {
    return { name: titleCaseLocation(original), method: null }
  }

  let working = original
  let method = null

  const onMatch = working.match(/^(.+?)\s+on\s+(.+)$/i)
  if (onMatch) {
    method = cleanMethod(onMatch[1])
    working = onMatch[2].trim()
  }

  working = stripTableSuffix(working)
  working = stripNumberSuffix(working)

  let stripped = true
  while (stripped) {
    stripped = false
    const timeResult = stripKnownSuffix(working, TIME_SUFFIXES)
    if (timeResult.changed) {
      method = method || timeResult.suffix
      working = timeResult.value
      stripped = true
    }

    const methodResult = stripKnownSuffix(working, METHOD_SUFFIXES)
    if (methodResult.changed) {
      method = method || methodResult.suffix
      working = methodResult.value
      stripped = true
    }

    const parentheticalTime = working.match(/\s+\(([^)]*)\)$/)
    if (parentheticalTime && isMethodParenthetical(parentheticalTime[1])) {
      method = method || cleanMethod(parentheticalTime[1])
      working = working.slice(0, parentheticalTime.index).trim()
      stripped = true
    }
  }

  const candidates = unique([
    working,
    stripParenthetical(working),
    titleCaseLocation(working),
    titleCaseLocation(stripParenthetical(working))
  ]).filter(Boolean)

  for (const candidate of candidates) {
    const canonicalName = canonical.get(routeKey(candidate))
    if (canonicalName) return { name: canonicalName, method }
  }

  return {
    name: titleCaseLocation(working),
    method
  }
}

const shouldNormalizeRoute = (route = {}) =>
  route &&
  route.type === 'route' &&
  !route.randomizerNormalized &&
  Array.isArray(route.encounters) &&
  String(route.source || '').startsWith('upr-zx-wild')

const canonicalRouteIndex = (routes = []) => {
  const index = new Map()
  if (!Array.isArray(routes)) return index

  for (const route of routes) {
    if (route?.type !== 'route' || !route.name) continue
    const name = String(route.name).trim()
    addCanonicalName(index, name)
    addCanonicalName(index, stripParenthetical(name), name)
  }

  return index
}

const addCanonicalName = (index, name, canonicalName = name) => {
  const key = routeKey(name)
  if (key && !index.has(key)) index.set(key, canonicalName)
}

const stripTableSuffix = (value) =>
  String(value || '')
    .replace(/\s*,\s*Table\s+\d+(?:\s*\([^)]*\))?$/i, '')
    .trim()

const stripNumberSuffix = (value) =>
  String(value || '')
    .replace(/\s+#\d+$/i, '')
    .trim()

const stripKnownSuffix = (value, suffixes) => {
  const text = String(value || '').trim()
  for (const suffix of suffixes) {
    const pattern = new RegExp(`\\s+${escapeRegExp(suffix)}$`, 'i')
    if (pattern.test(text)) {
      const nextValue = text.replace(pattern, '').trim()
      if (!nextValue) continue
      return {
        changed: true,
        suffix: cleanMethod(suffix),
        value: nextValue
      }
    }
  }
  return { changed: false, suffix: null, value: text }
}

const isStandaloneEncounterGroup = (value = '') =>
  /^(old rod fishing|good rod fishing|super rod fishing|fishing group \d+|time-specific fishing \d+|headbutt trees set \d+|rod group|grass group|honey tree group \d+|bug catching contest(?:\s+\([^)]*\))?)$/i.test(
    String(value).trim()
  )

const isMethodParenthetical = (value = '') => {
  const key = routeKey(value)
  return (
    TIME_SUFFIXES.some((suffix) => routeKey(suffix) === key) ||
    /nationaldex/.test(key)
  )
}

const stripParenthetical = (value = '') =>
  String(value)
    .replace(/\s+\([^)]*\)$/g, '')
    .trim()

const cleanMethod = (value = '') =>
  String(value)
    .replace(/\s+/g, ' ')
    .trim() || null

const titleCaseLocation = (value = '') => {
  const text = String(value).trim()
  if (!text || text !== text.toUpperCase()) return text

  return text
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
    .replace(/\bMt\b/g, 'Mt.')
}

const routeKey = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bmt\./g, 'mt')
    .replace(/[^a-z0-9]+/g, '')

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

const escapeRegExp = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

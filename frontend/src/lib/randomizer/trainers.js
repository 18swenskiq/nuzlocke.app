export const mergeRandomizedLeague = (staticLeague, results, { game, starter } = {}) => {
  const directLeague = selectRandomizedLeague(results, game, starter)
  if (!isPlainObject(staticLeague)) return directLeague || staticLeague

  const candidates = extractTrainerPairs(results)
    .map(normalizeCandidate)
    .filter((candidate) => candidate.original && candidate.randomized)

  if (!candidates.length) {
    return staticLeague
  }

  const used = new Set()
  const matches = {}
  const merged = {}

  for (const [id, entry] of Object.entries(staticLeague)) {
    if (!isPlainObject(entry) || !Array.isArray(entry.pokemon)) {
      merged[id] = entry
      continue
    }

    const match = findBestMatch(id, entry, candidates, used)
    if (!match) {
      merged[id] = entry
      continue
    }

    used.add(match.key)
    matches[id] = {
      trainerId: match.id,
      index: match.index,
      tag: match.tag,
      score: match.score,
      reasons: match.reasons
    }
    merged[id] = mergeLeagueEntry(entry, match)
  }

  return {
    ...merged,
    __randomizer: {
      matchedCount: Object.keys(matches).length,
      candidateCount: candidates.length,
      matches,
      unmatchedCandidates: candidates
        .filter((candidate) => !used.has(candidate.key))
        .map((candidate) => ({
          id: candidate.id,
          index: candidate.index,
          tag: candidate.tag,
          name: candidate.name,
          group: candidate.group
        }))
    }
  }
}

export const selectRandomizedLeague = (results, game, starter) => {
  const league =
    results?.league ||
    results?.bosses ||
    results?.trainers?.league ||
    results?.tracker?.league ||
    results?.trackerData?.league

  if (!isPlainObject(league)) return null

  return (
    league[starter] ||
    league[`${game}@${starter}`] ||
    league[game]?.[starter] ||
    league[game] ||
    league
  )
}

const extractTrainerPairs = (results) => {
  const pairs =
    results?.trainers?.important ||
    results?.trainers?.pairs ||
    results?.trainerPairs ||
    results?.tracker?.trainers?.important ||
    results?.trackerData?.trainers?.important ||
    []

  if (Array.isArray(pairs)) return pairs
  if (isPlainObject(pairs)) return Object.values(pairs)
  return []
}

const normalizeCandidate = (pair) => {
  const randomized = pair?.randomized || pair?.after || pair?.trainer || pair
  const original = pair?.original || pair?.before || null
  const id = pair?.id || randomized?.id || `trainer-${pair?.index ?? randomized?.index ?? ''}`
  const index = pair?.index ?? randomized?.index ?? original?.index ?? null

  return {
    key: String(index ?? id),
    id,
    index,
    tag: pair?.tag || randomized?.tag || original?.tag || '',
    name: pair?.name || randomized?.name || original?.name || '',
    group: pair?.group || randomized?.group || original?.group || '',
    original,
    randomized,
    originalTeam: teamProfile(original?.pokemon),
    randomizedTeam: teamProfile(randomized?.pokemon),
    names: unique([
      pair?.name,
      randomized?.name,
      randomized?.displayName,
      original?.name,
      original?.displayName,
      pair?.tag,
      randomized?.tag,
      original?.tag
    ]).map(nameKey)
  }
}

const findBestMatch = (id, staticEntry, candidates, used) => {
  const target = {
    id,
    name: nameKey(staticEntry.name),
    group: groupFromId(id),
    team: teamProfile(staticEntry.pokemon)
  }

  let best = null
  for (const candidate of candidates) {
    if (used.has(candidate.key)) continue
    const score = scoreCandidate(target, candidate)
    if (score.total < 70) continue
    if (!best || score.total > best.score) {
      best = {
        ...candidate,
        score: score.total,
        reasons: score.reasons
      }
    }
  }
  return best
}

const scoreCandidate = (target, candidate) => {
  let total = 0
  const reasons = []

  const teamScore = scoreTeam(target.team, candidate.originalTeam)
  if (teamScore.score) {
    total += teamScore.score
    reasons.push(...teamScore.reasons)
  }

  const nameScore = scoreName(target.name, candidate.names)
  if (nameScore.score) {
    total += nameScore.score
    reasons.push(...nameScore.reasons)
  }

  if (target.group && target.group === candidate.group) {
    total += 8
    reasons.push('group')
  }

  return { total, reasons }
}

const scoreTeam = (target, candidate) => {
  if (!target.names.length || !candidate.names.length) {
    return { score: 0, reasons: [] }
  }

  if (target.withLevels === candidate.withLevels) {
    return { score: 130, reasons: ['team+levels'] }
  }

  if (target.namesKey === candidate.namesKey) {
    return { score: 105, reasons: ['team'] }
  }

  if (target.sortedNamesKey === candidate.sortedNamesKey) {
    return { score: 95, reasons: ['team-unordered'] }
  }

  const overlap = countOverlap(target.names, candidate.names)
  if (!overlap) return { score: 0, reasons: [] }

  const coverage = overlap / Math.max(target.names.length, candidate.names.length)
  if (coverage < 0.75) return { score: 0, reasons: [] }

  return {
    score: Math.round(coverage * 80),
    reasons: ['team-overlap']
  }
}

const scoreName = (targetName, candidateNames) => {
  if (!targetName) return { score: 0, reasons: [] }
  if (candidateNames.includes(targetName)) {
    return { score: 75, reasons: ['name'] }
  }

  if (
    candidateNames.some(
      (candidateName) =>
        candidateName &&
        (candidateName.includes(targetName) || targetName.includes(candidateName))
    )
  ) {
    return { score: 45, reasons: ['name-partial'] }
  }

  return { score: 0, reasons: [] }
}

const mergeLeagueEntry = (staticEntry, match) => {
  const randomized = match.randomized || {}
  return {
    ...staticEntry,
    randomizerTrainer: {
      id: match.id,
      index: match.index,
      tag: match.tag,
      group: match.group,
      original: match.original,
      score: match.score,
      reasons: match.reasons
    },
    pokemon: Array.isArray(randomized.pokemon)
      ? randomized.pokemon
      : staticEntry.pokemon
  }
}

const teamProfile = (pokemon = []) => {
  const members = Array.isArray(pokemon)
    ? pokemon.map((member) => ({
        name: pokemonName(member),
        level: pokemonLevel(member)
      })).filter((member) => member.name)
    : []

  const names = members.map((member) => member.name)
  const sortedNames = [...names].sort()
  return {
    members,
    names,
    namesKey: names.join('|'),
    sortedNamesKey: sortedNames.join('|'),
    withLevels: members.map((member) => `${member.name}@${member.level}`).join('|')
  }
}

const pokemonName = (pokemon = {}) =>
  key(pokemon.name || pokemon.alias || pokemon.id || pokemon.sprite || '')

const pokemonLevel = (pokemon = {}) => {
  const level = String(pokemon.level ?? '').match(/\d+/)?.[0]
  return level || ''
}

const countOverlap = (left, right) => {
  const counts = new Map()
  for (const value of right) {
    counts.set(value, (counts.get(value) || 0) + 1)
  }

  let total = 0
  for (const value of left) {
    const count = counts.get(value) || 0
    if (!count) continue
    total += 1
    counts.set(value, count - 1)
  }
  return total
}

const groupFromId = (id = '') => {
  const value = String(id)
  if (/^e\d+/i.test(value) || /^c(?:hamp|ampion)?/i.test(value)) return 'elite-four'
  if (/^r\d+/i.test(value)) return 'rival'
  if (/^g\d+/i.test(value) || /^t\d+/i.test(value)) return 'evil-team'
  if (/^\d+$/.test(value)) return 'gym-leader'
  return ''
}

const nameKey = (value = '') =>
  key(value)
    .replace(/^leader/, '')
    .replace(/^gymleader/, '')
    .replace(/^elitefour/, '')
    .replace(/^champion/, '')

const key = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')

const unique = (values = []) => {
  const seen = new Set()
  const result = []
  for (const value of values) {
    if (value == null || value === '') continue
    const normalized = String(value)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

const isPlainObject = (value) =>
  !!value && !Array.isArray(value) && typeof value === 'object'

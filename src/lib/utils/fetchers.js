import { browser } from '$app/environment'
import { getGen } from '$store'

import { DATA } from '$utils/rewrites'
import { normalise } from '$utils/string'

const safeJson = async (res, url) => {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`Invalid JSON from ${url} (status ${res.status}): ${text.slice(0, 200)}`)
  }
}

const data = {}
export const fetchData = async () => {
  if (!browser) return

  const gen = await getGen()
  const uri = `${DATA}/pokemon/${gen}.json`

  if (data[gen]) return data[gen] // Return the raw data if it exists

  if (!data[uri]) {
    console.time(`data:${gen}`)
    data[uri] = fetch(uri) // "Cache" the promise rather than make a new fetch each time
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch pokemon data for gen "${gen}": ${res.status} ${res.statusText}`)
        return safeJson(res, uri)
      })
      .then((data) => {
        console.timeLog(`data:${gen}`)
        let result = { idMap: {}, aliasMap: {}, nameMap: {} }
        for (const d of data) {
          result.idMap[d.num] = d
          result.aliasMap[normalise(d.alias)] = d
          result.nameMap[normalise(d.name.toLowerCase())] = d
        }
        console.timeEnd(`data:${gen}`)
        return result
      })
  }

  data[gen] = await data[uri]
  return data[gen]
}

const league = {}
export const fetchLeague = async (game, starter = 'fire') => {
  if (!browser) return

  const id = `${game}@${starter}`
  const uri = `${DATA}/league/${game}.${starter}.json`

  if (league[id]) return league[id]
  if (!league[uri]) league[uri] = fetch(uri).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch league data for "${game}" (starter: ${starter}): ${res.status} ${res.statusText}`)
    return safeJson(res, uri)
  })

  console.time(`league:${id}`)
  league[id] = await league[uri]
  console.timeEnd(`league:${id}`)
  return league[id]
}

const route = {}
export const fetchRoute = async (game) => {
  if (!browser) return

  const uri = `/api/route/${game}.json`
  if (route[game]) return route[game]
  if (!route[uri]) route[uri] = fetch(uri).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch route data for "${game}": ${res.status} ${res.statusText}`)
    return safeJson(res, uri)
  })

  console.time(`route:${game}`)
  route[game] = await route[uri]
  console.timeEnd(`route:${game}`)
  return route[game]
}

const trainers = {}
export const fetchTrainers = async (game) => {
  if (!browser) return

  const uri = `/api/${game}/trainers.json`
  if (trainers[game]) return trainers[game]
  if (!trainers[uri]) trainers[uri] = fetch(uri).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch trainer data for "${game}": ${res.status} ${res.statusText}`)
    return safeJson(res, uri)
  })

  console.time(`trainres:${game}`)
  trainers[game] = await trainers[uri]
  console.time(`trainres:${game}`)
  return trainers[game]
}

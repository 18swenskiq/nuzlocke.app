import { Expanded as Games } from '$lib/data/games.js'
import Routes from '$lib/data/routes.json'
import Patches from '$lib/data/patches.json'
import Pokemon from '../../routes/api/pokemon.json/_data.js'

import { normalise } from '$lib/utils/string'

/**
 * Generates a randomized nuzlocke encounter set for a given game.
 *
 * Client-side replacement for the former /api/route/generate/[gen].json endpoint
 */
export function generateRoute(gen) {
    if (!Routes[gen]) return null

    const game = Games[gen]
    const patch = Patches[game?.patchId] || Patches[gen]

    let seen = new Set()

    const PokemonMap = Pokemon
        .concat(Object.values(patch?.fakemon || {}))
        .reduce((acc, it) => ({
            ...acc,
            [normalise(it.alias)]: it
        }), {})

    return Object.values(Routes[gen])
        .filter((r) => r.type === 'route')
        .reduce((acc, it, id) => {
            const validEncounters = it.encounters?.filter((e) => {
                if (!e) return

                try {
                    const evoline = PokemonMap[normalise(e)].evoline
                    return !seen.has(evoline)
                } catch (err) {
                    console.log(`[${gen}] ${normalise(e)}`)
                }
            })

            if (!validEncounters || !validEncounters.length) return acc

            const encounter =
                validEncounters[Math.floor(Math.random() * validEncounters.length)]

            seen.add(PokemonMap[normalise(encounter)].evoline)
            return {
                ...acc,
                [it.name]: {
                    id,
                    pokemon: PokemonMap[normalise(encounter)].alias,
                    location: it.name,
                    hidden: true
                }
            }
        }, {})
}

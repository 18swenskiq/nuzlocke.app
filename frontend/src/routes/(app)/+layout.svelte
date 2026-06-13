<script>
  import { browser } from '$app/environment'
  import { setContext, afterUpdate } from 'svelte'

  import { page } from '$app/stores'
  import { createUser, readdata } from '$lib/store'

  import { RegionMap } from '$lib/data/games'
  import { GameHeading, NavHeading } from '$c/navs'

  import { fetchData, fetchLeague } from '$utils/fetchers'
  import { normalise } from '$utils/string'

  import Modal from 'svelte-simple-modal'
  import deferStyles from '$lib/utils/defer-styles'

  let path = $page.url.pathname

  const [, gameKey] = browser ? readdata() : []
  setContext('region', RegionMap[gameKey] ?? 'unknown')

  afterUpdate(() => {
    const [, id] = readdata()

    if (id === 'blazingem') deferStyles('/assets/pokemon-blazingem.css')
    if (id?.includes('radred')) deferStyles('/assets/pokemon-radicalred.css')
    if (browser) setTimeout(() => document.body.classList.add('lazy-pkm'), 0)
  })

  const readRandomizedLeague = (game, starter) => {
    if (!browser) return null

    const [gameData] = readdata()
    const results =
      gameData?.__randomizer?.results || gameData?.__randomizer?.extractedData
    const league =
      results?.league ||
      results?.bosses ||
      results?.trainers?.league ||
      results?.tracker?.league ||
      results?.trackerData?.league

    if (!league || Array.isArray(league) || typeof league !== 'object') {
      return null
    }

    return (
      league[starter] ||
      league[`${game}@${starter}`] ||
      league[game]?.[starter] ||
      league[game] ||
      league
    )
  }

  setContext('game', {
    getLeague: (...args) => {
      const randomizedLeague = readRandomizedLeague(...args)
      if (randomizedLeague) return Promise.resolve(randomizedLeague)

      return fetchLeague(...args).catch(err => {
        console.error('[getLeague]', err)
        return []
      })
    },
    getAllPkmn: () => fetchData().then((res) => Object.values(res.aliasMap)).catch(err => {
      console.error('[getAllPkmn]', err)
      return []
    }),
    getPkmn: (id) =>
      fetchData().then((p = {}) => {
        const nid = normalise(id)
        return p.idMap[nid] || p.aliasMap[nid] || p.nameMap[nid]
      }).catch(err => {
        console.error('[getPkmn]', id, err)
        return undefined
      }),
    getPkmns: (ids = []) =>
      fetchData().then((p = {}) => {
        let result = {}
        for (const id of ids) {
          const nid = normalise(id).trim()
          const res = p.idMap[nid] || p.aliasMap[nid] || p.nameMap[nid]

          if (!nid) continue
          if (!res) {
            console.error('Error reading ', nid)
            continue
          }

          result[res.alias] = res
        }
        return result
      }).catch(err => {
        console.error('[getPkmns]', err)
        return {}
      })
  })

  const onresize = () => (document.body.height = window.innerHeight)

  $: createUser()
</script>

<svelte:window on:resize={onresize} />
<svelte:head>
  <meta name="robots" content="follow, index" />
  <link
    rel="preload"
    as="image"
    href="/assets/pokemon-v6.png"
  />
</svelte:head>

<Modal
  closeButton={false}
  styleBg={{ background: 'rgba(0, 0, 0, 0.8)', zIndex: 9999 }}
  classBg="modal-positioning overflow-y-scroll"
  classWindowWrap="!m-4"
  classWindow="!bg-transparent"
  classContent="!p-0 !overflow-visible"
>
  {#if ['/game', '/box', '/graveyard'].includes(path)}
    <GameHeading />
  {:else}
    <NavHeading />
  {/if}
  <slot />
</Modal>

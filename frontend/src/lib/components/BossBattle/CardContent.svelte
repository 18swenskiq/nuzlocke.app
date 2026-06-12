<script>
  import { fade } from 'svelte/transition'

  import { Heading, Body, Team, Vs } from './'

  export let gym = [],
    team = [],
    box = []

  export let boss = {},
    summary = {}

  function sumStats(pokes) {
    return pokes.reduce((acc, it) => acc + it.total, 0)
  }
</script>

<section
  in:fade|local
  class="mt-6 pb-32 text-gray-800 shadow-lg dark:text-gray-50 md:-mt-12 {$$restProps.class ||
    ''}"
>
  <div class="relative w-full">
    <Heading atkStats={sumStats(team)} defStats={sumStats(gym)} {boss} />

    <div
      class="absolute top-6 z-20 flex h-20 w-full items-center justify-between md:top-9"
    >
      <div class="flex-1">
        <Team type="attack" {team} />
      </div>

      <Vs />

      <div class="flex-1">
        <Team type="defend" team={gym} />
      </div>
    </div>
  </div>

  <Body
    on:clear
    on:reset
    on:select
    recommendations={summary.recommendations}
    advice={summary.advice}
    name={boss.name}
    {box}
    {team}
  >
    <svelte:fragment slot="tabs">
      <slot name="tabs" />
    </svelte:fragment>

    <!-- TODO: Heading gradient builder from team members and types -->

    <slot name="actions" />
  </Body>
</section>

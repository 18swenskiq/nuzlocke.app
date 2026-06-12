export const UPRZX_PROJECT = {
  id: 'upr-zx',
  name: 'Universal Pokemon Randomizer ZX',
  repository: 'https://github.com/Ajarmar/universal-pokemon-randomizer-zx',
  license: 'GPL-3.0-or-later',
  version: '4.6.1',
  upstreamCommit: '7f00eb8'
}

export const randomizerDefaults = {
  seed: '',
  baseStats: 'unchanged',
  types: 'unchanged',
  abilities: 'unchanged',
  evolutions: 'unchanged',
  starters: 'random-basic',
  wildPokemon: 'area-1-to-1',
  staticPokemon: 'random',
  trainerPokemon: 'random',
  trainerLevels: 'unchanged',
  movesets: 'unchanged',
  tms: 'unchanged',
  fieldItems: 'unchanged'
}

export const randomizerOptionGroups = [
  {
    id: 'pokemon',
    name: 'Pokemon',
    options: [
      {
        id: 'baseStats',
        label: 'Base stats',
        choices: [
          ['unchanged', 'Unchanged'],
          ['shuffle', 'Shuffle'],
          ['random', 'Random'],
          ['random-total', 'Random BST']
        ]
      },
      {
        id: 'types',
        label: 'Types',
        choices: [
          ['unchanged', 'Unchanged'],
          ['random-follow-evolutions', 'Random, follow evolutions'],
          ['random-completely', 'Random completely']
        ]
      },
      {
        id: 'abilities',
        label: 'Abilities',
        choices: [
          ['unchanged', 'Unchanged'],
          ['random-follow-evolutions', 'Random, follow evolutions'],
          ['random-completely', 'Random completely']
        ]
      },
      {
        id: 'evolutions',
        label: 'Evolutions',
        choices: [
          ['unchanged', 'Unchanged'],
          ['random-same-stage', 'Random, same stage'],
          ['random-any', 'Random any Pokemon']
        ]
      }
    ]
  },
  {
    id: 'encounters',
    name: 'Encounters',
    options: [
      {
        id: 'starters',
        label: 'Starters',
        choices: [
          ['unchanged', 'Unchanged'],
          ['random-basic', 'Random basic Pokemon'],
          ['random-any', 'Random any Pokemon'],
          ['custom', 'Custom']
        ]
      },
      {
        id: 'wildPokemon',
        label: 'Wild Pokemon',
        choices: [
          ['unchanged', 'Unchanged'],
          ['area-1-to-1', 'Random, area mapped'],
          ['global-1-to-1', 'Random, global mapped'],
          ['completely-random', 'Completely random']
        ]
      },
      {
        id: 'staticPokemon',
        label: 'Static Pokemon',
        choices: [
          ['unchanged', 'Unchanged'],
          ['random-legendary-match', 'Random, match legends'],
          ['random', 'Random']
        ]
      }
    ]
  },
  {
    id: 'trainers',
    name: 'Trainers',
    options: [
      {
        id: 'trainerPokemon',
        label: 'Trainer Pokemon',
        choices: [
          ['unchanged', 'Unchanged'],
          ['type-themed', 'Type themed'],
          ['random', 'Random'],
          ['rival-carries-starter', 'Rival carries starter']
        ]
      },
      {
        id: 'trainerLevels',
        label: 'Trainer levels',
        choices: [
          ['unchanged', 'Unchanged'],
          ['unchanged-with-bst', 'Unchanged, scale by BST'],
          ['level-modifier', 'Level modifier']
        ]
      },
      {
        id: 'movesets',
        label: 'Movesets',
        choices: [
          ['unchanged', 'Unchanged'],
          ['random-preferring-type', 'Random, prefer same type'],
          ['random-completely', 'Random completely']
        ]
      }
    ]
  },
  {
    id: 'items',
    name: 'Items',
    options: [
      {
        id: 'tms',
        label: 'TMs/HMs',
        choices: [
          ['unchanged', 'Unchanged'],
          ['random', 'Random'],
          ['random-compatible', 'Random and compatible']
        ]
      },
      {
        id: 'fieldItems',
        label: 'Field items',
        choices: [
          ['unchanged', 'Unchanged'],
          ['shuffle', 'Shuffle'],
          ['random', 'Random']
        ]
      }
    ]
  }
]

export const randomizerSettingsDefault = (settings) =>
  `${settings.slice(0, 1)}0${settings.slice(2)}`

export const buildRandomizerManifest = ({
  capabilities,
  game,
  gameKey,
  options,
  outputMode = 'single-file',
  rom,
  runId,
  settingsString = null
}) => ({
  schemaVersion: 1,
  status: 'configured',
  runId,
  engine: {
    ...UPRZX_PROJECT,
    adapter: 'web-adapter-0.1.0'
  },
  game: {
    key: gameKey,
    title: game?.title,
    pid: game?.pid
  },
  settings: {
    string: settingsString,
    ui: options
  },
  options,
  rom,
  results: null,
  output: {
    mode: outputMode,
    archiveFormat: outputMode === 'layeredfs-archive' ? 'tar' : null,
    browserPath: capabilities?.browserPath,
    capabilities: capabilities
      ? {
          wasm: capabilities.wasm,
          opfs: capabilities.opfs,
          blobDownload: capabilities.blobDownload,
          fileSystemAccess: capabilities.fileSystemAccess,
          directDirectoryOutput: capabilities.directDirectoryOutput
        }
      : null
  },
  created: +new Date()
})

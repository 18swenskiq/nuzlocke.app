import Games from '$lib/data/games.json'

const ROM_CODE_TO_GAME = {
  'POKEMON RED': 'red',
  'POKEMON BLUE': 'blue',
  'POKEMON YELLOW': 'yel',
  PM_CRYSTAL: 'crys',
  'CTR-P-EKJA': 'x',
  'CTR-P-EK2A': 'y',
  'CTR-P-ECRA': 'or',
  'CTR-P-ECLA': 'as',
  'CTR-P-BNDA': 'sun',
  'CTR-P-BNEA': 'moon',
  'CTR-P-A2AA': 'usun',
  'CTR-P-A2BA': 'umoon'
}

const ROM_CODE_PREFIXES = [
  ['BPR', 'fr'],
  ['BPG', 'lg'],
  ['BPE', 'em'],
  ['AXV', 'ruby'],
  ['AXP', 'saph'],
  ['ADA', 'd'],
  ['APA', 'p'],
  ['CPU', 'pt'],
  ['IPK', 'hg'],
  ['IPG', 'ss'],
  ['IRB', 'bl'],
  ['IRA', 'wh'],
  ['IRE', 'bl2'],
  ['IRD', 'wh2']
]

const NAME_TO_GAME = {
  red: 'red',
  blue: 'blue',
  yellow: 'yel',
  gold: 'gold',
  silver: 'silv',
  crystal: 'crys',
  'fire red': 'fr',
  firered: 'fr',
  'leaf green': 'lg',
  leafgreen: 'lg',
  ruby: 'ruby',
  sapphire: 'saph',
  emerald: 'em',
  diamond: 'd',
  pearl: 'p',
  platinum: 'pt',
  'heart gold': 'hg',
  heartgold: 'hg',
  'soul silver': 'ss',
  soulsilver: 'ss',
  black: 'bl',
  white: 'wh',
  'black 2': 'bl2',
  black2: 'bl2',
  'white 2': 'wh2',
  white2: 'wh2',
  x: 'x',
  y: 'y',
  'omega ruby': 'or',
  omegaruby: 'or',
  'alpha sapphire': 'as',
  alphasapphire: 'as',
  sun: 'sun',
  moon: 'moon',
  'ultra sun': 'usun',
  ultrasun: 'usun',
  'ultra moon': 'umoon',
  ultramoon: 'umoon'
}

export const resolveTrackerGameFromRom = (romInfo = {}) => {
  const code = String(romInfo.romCode || romInfo.code || '').toUpperCase()
  const exact = ROM_CODE_TO_GAME[code]
  if (isSupportedGame(exact)) return exact

  const prefixed = ROM_CODE_PREFIXES.find(([prefix]) => code.startsWith(prefix))?.[1]
  if (isSupportedGame(prefixed)) return prefixed

  const normalizedName = normalizeRomName(romInfo.romName || romInfo.name)
  const named = NAME_TO_GAME[normalizedName]
  if (isSupportedGame(named)) return named

  const titleMatch = Object.entries(Games).find(([, game]) => {
    if (!game?.supported) return false
    return normalizeRomName(game.title) === normalizedName
  })?.[0]
  if (isSupportedGame(titleMatch)) return titleMatch

  return null
}

export const describeRomIdentity = (romInfo = {}) => {
  const name = romInfo.romName || romInfo.name || 'this ROM'
  const code = romInfo.romCode || romInfo.code
  return code ? `${name} (${code})` : name
}

const isSupportedGame = (gameKey) => !!gameKey && !!Games[gameKey]?.supported

const normalizeRomName = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/pokemon/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/version/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

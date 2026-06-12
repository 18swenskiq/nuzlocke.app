import { building, dev } from '$app/environment'
const rewrite = !building && !dev

// TODO: Remember to update `vercel.json` in root of project when
// modifying these sources

export const SPRITE = 'https://img.nuzlocke.app/sprites'
export const CUSTOM = 'https://img.nuzlocke.app/sprites'
export const IMG = ''

export const DATA = rewrite ? '/api' : '/api' // Load locally for development

export const UNOWN = 'https://img.nuzlocke.app/sprites/unown.png?v=1' // sprites still served from CDN

export const createImgUrl = (p, { ext = 'webp', shiny = false } = {}) => {
  if (!p) return UNOWN
  if (p.imgUrl) return `${CUSTOM}${p.imgUrl}.${ext}`

  const normalId = ('' + (p.imgId || p.sprite || ''))
    .replace('.png', '')
    .replace('.webp', '')

  if (!normalId) return UNOWN

  if (shiny) return `${SPRITE}/shiny/${normalId}.${ext}`
  return `${SPRITE}/base/${normalId}.${ext}`
}

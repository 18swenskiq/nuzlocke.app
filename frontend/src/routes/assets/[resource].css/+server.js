import Clean from 'clean-css'

import badges from './_badges.css?inline'
import blazingem from './_pokemon-blazingem.css?inline'
import radicalred from './_pokemon-radicalred.css?inline'
import pokemon from './_pokemon.css?inline'

const clean = new Clean({ level: 2 })
const resourceMap = {
  'pokemon-blazingem': blazingem,
  'pokemon-radicalred': radicalred,
  pokemon,
  badges
}

export async function GET({ params }) {
  const { resource } = params
  if (!resourceMap[resource]) return new Response(null, { status: 404 })

  return new Response(clean.minify(resourceMap[resource]).styles, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=31536000',
      'Content-Type': 'text/css'
    }
  })
}

/**
 * Pre-build script to generate static CSS files from server routes.
 * These CSS files are loaded at runtime by defer-styles.js via <link> tags.
 * Run before `vite build` to ensure they exist in static/ for the static adapter.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Clean from 'clean-css';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Resource CSS (pokemon sprites, badges) ──────────────────────────────
const resourceDir = join(ROOT, 'src/routes/assets/[resource].css');
const resourceMap = {
  pokemon: '_pokemon.css',
  'pokemon-blazingem': '_pokemon-blazingem.css',
  'pokemon-radicalred': '_pokemon-radicalred.css',
  badges: '_badges.css'
};

const cleanL2 = new Clean({ level: 2 });
const outDir = join(ROOT, 'static/assets');
mkdirSync(outDir, { recursive: true });

for (const [name, file] of Object.entries(resourceMap)) {
  const src = readFileSync(join(resourceDir, file), 'utf-8');
  const minified = cleanL2.minify(src).styles;
  const outPath = join(outDir, `${name}.css`);
  writeFileSync(outPath, minified);
  console.log(`  ✓ ${name}.css (${(minified.length / 1024).toFixed(1)} kB)`);
}

// ── Items CSS (per-game critical CSS) ───────────────────────────────────
const itemsCssPath = join(ROOT, 'thirdparty/pokemon-assets/assets/css/items.css');
const itemsSrc = readFileSync(itemsCssPath, 'utf-8');
const cleanL1 = new Clean();
const minifiedItems = cleanL1.minify(itemsSrc).styles;

const gamesJson = JSON.parse(readFileSync(join(ROOT, 'src/lib/data/games.json'), 'utf-8'));
const leagueJson = JSON.parse(readFileSync(join(ROOT, 'src/lib/data/league.json'), 'utf-8'));
const patchesJson = JSON.parse(readFileSync(join(ROOT, 'src/lib/data/patches.json'), 'utf-8'));

// Expand games the same way games.js does
const expanded = {};
for (const [key, game] of Object.entries(gamesJson)) {
  if (!game.difficulty) {
    expanded[key] = game;
    continue;
  }
  for (const d of game.difficulty) {
    const [name, idmod] = d.split(':');
    expanded[key + idmod] = {
      ...game,
      difficulty: name,
      pid: game.pid + idmod,
      title: game.title + ' ' + name
    };
  }
}

const toSet = (l) => [...new Set(l)].filter((i) => i).sort((a, b) => a.localeCompare(b));

const extract = (id, str) => {
  try {
    const re = new RegExp(`\\.pk(item|m)-${id}{.*?}`);
    const res = re.exec(str);
    return res[0];
  } catch (e) {
    return null;
  }
};

const itemsOutDir = join(outDir, 'items');
mkdirSync(itemsOutDir, { recursive: true });

let itemCount = 0;
for (const [gameId, gameData] of Object.entries(expanded)) {
  const patchData = patchesJson[gameData.patchId] || patchesJson[gameId];
  const league = leagueJson[gameData.lid] || leagueJson[gameData.pid];
  if (!league) continue;

  const all = Object.values(league).reduce((acc, it) => acc.concat(it.pokemon), []);
  const items = toSet(all.map((i) => patchData?.item?.[i.held]?.sprite || i.held));
  const criticalCss = items.reduce((acc, it) => acc + extract(it, minifiedItems), '');
  const output = criticalCss.replace(/null/g, '');

  if (output) {
    writeFileSync(join(itemsOutDir, `${gameId}.css`), output);
    itemCount++;
  }
}
console.log(`  ✓ ${itemCount} items/*.css files`);

// Also generate the full items.css (used by Particles)
writeFileSync(join(outDir, 'items.css'), minifiedItems);
console.log(`  ✓ items.css (${(minifiedItems.length / 1024).toFixed(1)} kB)`);

console.log('CSS generation complete.');

// Copies the prebuilt d3-celestial runtime assets from node_modules into
// /public/celestial so they can be served as static files and loaded via
// <script> tags in the browser.
//
// d3-celestial is an old, global-attaching script that expects d3 v3 and loads
// its star/constellation/Milky-Way GeoJSON over HTTP from `datapath`. Bundling it
// through the Next.js compiler is fragile, so we vendor the shipped build instead.
//
// Wired into `postinstall` and `prebuild`/`predev` (see package.json), so the
// assets are always present locally and on Vercel without being committed to git.
//
// License note: d3-celestial is BSD-3-Clause (Copyright (c) 2015, Olaf Frohn).
// Its bundled data (Hipparcos/Yale-derived catalogs) is public domain.

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'node_modules', 'd3-celestial');
const dest = join(root, 'public', 'celestial');

// Only the files the browser actually needs: the celestial build, its bundled
// d3 v3 libs, the stylesheet, and the data directory.
const FILES = [
  'celestial.min.js',
  'celestial.css',
  'lib/d3.min.js',
  'lib/d3.geo.projection.min.js',
];
const DIRS = ['data'];

async function main() {
  if (!existsSync(src)) {
    console.error(
      '[copy-celestial] node_modules/d3-celestial not found. Run `npm install` first.'
    );
    process.exit(1);
  }

  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  for (const rel of FILES) {
    const from = join(src, rel);
    const to = join(dest, rel);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }

  for (const rel of DIRS) {
    await cp(join(src, rel), join(dest, rel), { recursive: true });
  }

  await injectUkrainianNames();
  await registerUkrainianLang();

  console.log(`[copy-celestial] Copied d3-celestial assets -> ${dest}`);
}

// d3-celestial validates `constellations.namesType` against its built-in language
// table and silently resets anything unknown (e.g. our "uk") to English. That
// table lives in the minified build, so we register "uk" there. The marker
// `tr:"Turkish"}` ends each language table; appending to all is harmless (only the
// constellations table is used with namesType:"uk").
async function registerUkrainianLang() {
  const p = join(dest, 'celestial.min.js');
  const js = await readFile(p, 'utf8');
  const marker = 'tr:"Turkish"}';
  if (!js.includes(marker)) {
    console.warn('[copy-celestial] language marker not found — "uk" not registered');
    return;
  }
  const patched = js.split(marker).join('tr:"Turkish",uk:"Ukrainian"}');
  await writeFile(p, patched);
  console.log('[copy-celestial] Registered Ukrainian (uk) in celestial language table');
}

// d3-celestial's constellations.json ships ~20 languages but not Ukrainian. We add
// a `uk` field per constellation (from lib/sky/constellations-uk.json) so the app
// can render Ukrainian names via `constellations.namesType: 'uk'`. Runs on every
// copy, so it survives the regeneration of the gitignored public/celestial dir.
async function injectUkrainianNames() {
  const namesPath = join(root, 'lib', 'sky', 'constellations-uk.json');
  const dataPath = join(dest, 'data', 'constellations.json');
  const uk = JSON.parse(await readFile(namesPath, 'utf8'));
  const geo = JSON.parse(await readFile(dataPath, 'utf8'));

  let missing = 0;
  for (const feature of geo.features) {
    const name = feature.properties?.name;
    if (name && uk[name]) feature.properties.uk = uk[name];
    else missing++;
  }
  if (missing > 0) {
    console.warn(`[copy-celestial] ${missing} constellation(s) had no Ukrainian name`);
  }
  await writeFile(dataPath, JSON.stringify(geo));
  console.log('[copy-celestial] Injected Ukrainian constellation names (uk)');
}

main().catch((err) => {
  console.error('[copy-celestial] Failed:', err);
  process.exit(1);
});

// Generates the runtime data for the constellation-artwork overlay from the
// Stellarium skyculture sources the user dropped in:
//   assets-src/skyculture-<set>/index.json   (anchors, per Stellarium)
//   public/constellation-art/<set>/*.png     (the shipped illustrations)
//
// Outputs (committed, regenerated on predev/prebuild AFTER copy-celestial so the
// star catalog is present):
//   lib/sky/constellation-art.generated.json  { sets:[{id,label,items:[{key,file,size,anchors:[{x,y,hip}]}]}] }
//   lib/sky/art-anchor-stars.generated.json   { [hip]: [ra,dec] }  (only anchor stars)
//
// Only constellations whose PNG actually exists in the shipped set are included,
// so the runtime never requests an image that isn't there.

import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(root, 'assets-src');
const ART_DIR = join(root, 'public', 'constellation-art');
const STARS = join(root, 'public', 'celestial', 'data', 'stars.14.json');
const OUT_SETS = join(root, 'lib', 'sky', 'constellation-art.generated.json');
const OUT_STARS = join(root, 'lib', 'sky', 'art-anchor-stars.generated.json');

function label(setId) {
  return setId.charAt(0).toUpperCase() + setId.slice(1);
}

async function main() {
  if (!existsSync(SRC_DIR)) {
    // Nothing to build — write empty outputs so imports still resolve.
    await writeFile(OUT_SETS, JSON.stringify({ sets: [] }));
    await writeFile(OUT_STARS, JSON.stringify({}));
    console.log('[build-art] no assets-src/ — wrote empty art data');
    return;
  }

  const setDirs = readdirSync(SRC_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('skyculture-'))
    .map((d) => d.name.replace(/^skyculture-/, ''));

  const sets = [];
  const neededHips = new Set();

  for (const setId of setDirs) {
    const indexPath = join(SRC_DIR, `skyculture-${setId}`, 'index.json');
    const imgDir = join(ART_DIR, setId);
    if (!existsSync(indexPath) || !existsSync(imgDir)) {
      console.warn(`[build-art] skipping "${setId}" (missing index.json or images)`);
      continue;
    }
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    const items = [];
    for (const con of index.constellations ?? []) {
      if (!con.image?.file || !Array.isArray(con.image.anchors)) continue;
      const stem = basename(con.image.file).replace(/\.[a-z0-9]+$/i, '');
      // find the shipped image (any extension) for this stem
      const file = readdirSync(imgDir).find(
        (f) => f.replace(/\.[a-z0-9]+$/i, '') === stem
      );
      if (!file) continue; // user didn't ship this illustration
      const anchors = con.image.anchors
        .filter((a) => Array.isArray(a.pos) && a.hip != null)
        .map((a) => ({ x: a.pos[0], y: a.pos[1], hip: a.hip }));
      if (anchors.length < 3) continue;
      anchors.forEach((a) => neededHips.add(a.hip));
      items.push({ key: stem, file, size: con.image.size, anchors });
    }
    items.sort((a, b) => a.key.localeCompare(b.key));
    sets.push({ id: setId, label: label(setId), items });
    console.log(`[build-art] ${setId}: ${items.length} illustrations`);
  }

  // Resolve anchor HIPs → [ra, dec] from the (large) star catalog, once.
  const stars = JSON.parse(await readFile(STARS, 'utf8'));
  const radec = {};
  for (const f of stars.features) {
    if (neededHips.has(f.id)) radec[f.id] = f.geometry.coordinates;
  }
  const missing = [...neededHips].filter((h) => !(h in radec));
  if (missing.length) {
    console.warn(
      `[build-art] ${missing.length} anchor HIP(s) not in catalog:`,
      missing.slice(0, 10)
    );
  }

  await writeFile(OUT_SETS, JSON.stringify({ sets }));
  await writeFile(OUT_STARS, JSON.stringify(radec));
  console.log(
    `[build-art] wrote ${sets.length} set(s), ${Object.keys(radec).length} anchor stars`
  );
}

main().catch((err) => {
  console.error('[build-art] failed:', err);
  process.exit(1);
});

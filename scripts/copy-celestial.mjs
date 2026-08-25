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
import { cp, mkdir, rm } from 'node:fs/promises';
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

  console.log(`[copy-celestial] Copied d3-celestial assets -> ${dest}`);
}

main().catch((err) => {
  console.error('[copy-celestial] Failed:', err);
  process.exit(1);
});

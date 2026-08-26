# CLAUDE.md — vector-bot (Star Map Poster Mini App)

Memory for future sessions. Keep this accurate as the code evolves.

## What this is

A Telegram Mini App that generates a personalized **star-map poster** — the night
sky exactly as it looked at a chosen date + location (first date, birth, wedding).
User picks date + place → previews the sky → downloads a poster PNG. It is a free
viral lead-magnet for a Telegram channel about space/futurism/sci-fi.

**Current status: Milestone 1.5 complete** — M1 (scaffold + client star-map render +
poster + PNG export) plus **city search geocoding with correct timezone→UTC handling**.
Later milestones add the paid gate, attribution logging, and server-side HD export
(see "Milestone boundaries").

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript**. Single Next.js app.
- ESLint (`eslint-config-next`) + Prettier. Turbopack dev/build.
- Deploy target: **Vercel** (serverless/edge).

## Hard constraints (do not violate)

- **Client-side render only.** All star-map computation + drawing happen in the
  browser on `<canvas>`; the poster is exported with `canvas.toBlob()`. The server
  does nothing in the render path. No headless-browser rendering.
- **Vercel serverless/edge.** No long-running server, no persistent filesystem
  (only `/tmp` in functions). Future APIs = Next.js route handlers only — **no
  NestJS / separate backend.**
- **Licensing is load-bearing.** Only permissive deps (MIT / BSD / ISC / Apache-2.0
  / public-domain data). **No AGPL/GPL.** Before adding any astronomy/render dep,
  print its LICENSE and confirm it's permissive.
- **No secrets committed.** `.env*` is gitignored (except `.env.example`).

## Key dependencies + licenses (verified)

| Package        | Version | License          | Role                                                                                          |
| -------------- | ------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `d3-celestial` | 0.7.35  | **BSD-3-Clause** | sky map render; bundles d3 v3 + public-domain star/DSO/Milky-Way GeoJSON                      |
| `@twa-dev/sdk` | 8.0.2   | **MIT**          | Telegram Mini App bootstrap (theme, initDataUnsafe, start_param); vendors telegram-web-app.js |

`astronomy-engine` (MIT) is **not** installed — d3-celestial's own accuracy is
sufficient. Only add it if the render is visibly wrong (that's a stop-and-ask
fork). d3-celestial pulls d3 v3 (BSD); we do **not** add a separate d3 v7.

## d3-celestial integration (the load-bearing part)

d3-celestial is an old, global-attaching, DOM-manipulating script (expects d3 v3,
loads data over HTTP from `datapath`). We do **not** bundle it through the compiler.

- `scripts/copy-celestial.mjs` copies its prebuilt assets from `node_modules` into
  `public/celestial/` (celestial.min.js, lib/d3.min.js, lib/d3.geo.projection.min.js,
  data/). Wired into `postinstall` + `predev` + `prebuild`. `public/celestial/` is
  **gitignored** (regenerated on install/build, incl. on Vercel).
- `lib/sky/celestial-loader.ts` injects the three `<script>`s in order and resolves
  with `window.Celestial`. Browser-only, idempotent.
- Rendered off-screen: `#celestial-map` (container) **must** have a sibling
  `#celestial-form` div — d3-celestial builds hidden date/lat/lon inputs there and
  reads them back; without it, rendering throws. See `components/PosterCanvas.tsx`.
- Gotchas encoded in `lib/sky/renderStarMap.ts`:
  - `settimezone: false` makes `setPosition()` a no-op, so `skyview()` must be
    called with a `timezone` to take the `go()`/redraw path.
  - Detach the redraw callback with a **no-op**, never `null`: d3-celestial's
    `runCallback()` force-re-enables `hasCallback` after calling, so a `null`
    callback makes later redraws throw `callback is not a function`.

## API shape (UI never touches d3-celestial directly)

`lib/sky/`:

- `renderStarMap(container, { date, lat, lng, theme, size? }) => Promise<HTMLCanvasElement>`
  — takes a **container element** (d3-celestial owns its own canvas), returns that canvas.
- `composePoster(canvas, { starMapCanvas, title, subtitle, watermark, theme })` —
  draws the portrait 1080×1350 poster. Layout constants in `POSTER` (one place to restyle).
- `exportPng(canvas, filename) => Promise<void>` — `canvas.toBlob()` download.
- `celestial-config.ts` — the dark, clean d3-celestial config (airy projection,
  zenith-centered local sky). `types.ts` — `Theme`, `RenderOptions`, `PosterOptions`.

`lib/telegram/`:

- `initTelegram() => Promise<{ isTelegram, theme, startParam }>` — applies Telegram
  theme (or default dark in a plain browser), reads `start_param`. **No initData
  validation** (that's Milestone 2).
- `theme.ts` — Telegram themeParams → `Theme`, CSS-var application, `DEFAULT_THEME`.

`lib/geocode.ts` — `parseCoords(query)` parses a raw `"lat, lng"` pair for the
manual-entry fallback only (city search now goes through `/api/geocode`).

UI: `app/page.tsx` → `components/StarMapApp.tsx` (client orchestrator) →
`InputForm.tsx` (+ `CitySearch.tsx`) + `PosterCanvas.tsx`. `app/globals.css` holds
theme CSS vars.

## Geocoding + timezone (Milestone 1.5)

Users type a **city name** and pick from debounced suggestions; the resolved IANA
**timezone** is what makes local→UTC correct (the whole point — a wrong instant
rotates the sky). Manual `lat, lng` entry stays as a secondary fallback.

- **Providers** (server-side only, free, keyless): **Open-Meteo** geocoding is
  primary (returns name/admin/country/lat/lng **and** `timezone`). **Nominatim
  (OSM)** is the fallback, used only when Open-Meteo returns nothing — it needs an
  identifying `User-Agent` (`NOMINATIM_USER_AGENT` env) and is rate-limited to
  ~1 req/s (best-effort guard in the route). Nominatim results have `timezone: null`.
  We do **not** use any terraink code (that project is AGPL/trademarked).
- **`/api/geocode`** (`app/api/geocode/route.ts`, Node runtime): `GET ?q=&limit=`
  (limit clamp 1–10, default 6; `q` < 2 chars → empty). Normalizes both providers to
  `GeoResult { name, admin, country, lat, lng, timezone }` and returns
  `{ results, provider, attribution? }`. **In-memory cache** (Map, 24h TTL) —
  `// TODO(milestone-2: persistent cache)`. Never crashes → empty result on error.
  The browser never calls providers directly (headers/CORS/rate-limit).
- **Timezone → UTC** (`lib/time/localToUtc.ts`, no date library — uses `Intl` +
  tzdata): `zonedWallClockToUtc(...)` inverts the zone offset (with a DST-refinement
  pass); `resolveInstant(wall, tz)` returns the absolute instant — the chosen zone
  when known, else **treats the wall clock as UTC** (manual-coords fallback; the UI
  notes it). `InputForm` resolves the instant and passes it to `renderStarMap`, whose
  `opts.date` is now the **absolute UTC instant** (it sets d3-celestial's `timezone`
  to the browser offset to render at that instant unshifted — see renderStarMap).
- **Attribution**: a persistent footer credits Open-Meteo (courtesy) and
  "© OpenStreetMap contributors" (required when the Nominatim fallback is used).
- Verified: Prague → 50.088, 14.421, `Europe/Prague`; 21:30 local resolves to
  19:30Z and d3-celestial's zenith RA matches the computed sidereal time to 0.00°;
  Prague/Kyiv/NYC at the same wall clock give three different instants + skies.
  `// TODO`: reverse geocoding / "use my location" (GPS) in `CitySearch`.

## Milestone boundaries

**Done (M1):** scaffold, Telegram shell + theme, client star-map render, poster
compose, PNG export.

**Done (M1.5):** city search geocoding (`/api/geocode`, Open-Meteo + Nominatim),
debounced autocomplete, manual-coords fallback, timezone→UTC correctness, attribution.

**NOT built yet — Milestone 2 (marked `// TODO(milestone-2)` in code):**
subscription / channel-membership gate (`getChatMember`), `initData` HMAC
validation, `start_param` attribution logging, **persistent geocode cache** (DB, no
PlanetScale yet), watermark on/off toggle, HD export resolution, server-side
Satori/HD render, PDF, premium styles, payments. Also deferred: reverse geocoding /
GPS "use my location".

## Verify locally

```bash
npm run dev          # http://localhost:3000 (respects PORT if 3000 is taken)
npm run build        # must pass — Vercel readiness
npm run lint
npx tsc --noEmit
npm run format       # prettier --write
```

Real Telegram theming can't be verified outside Telegram; the plain-browser
fallback (default dark theme) is the local dev path.

## Stop-and-ask before

Pulling in any large/non-permissive dep; changing core architecture (server-side
render, adding a DB, swapping framework); or reaching for `astronomy-engine`
because d3-celestial quality looks insufficient.

# CLAUDE.md — vector-bot (Star Map Poster Mini App)

Memory for future sessions. Keep this accurate as the code evolves.

## What this is

A Telegram Mini App that generates a personalized **star-map poster** — the night
sky exactly as it looked at a chosen date + location (first date, birth, wedding).
User picks date + place → previews the sky → downloads a poster PNG. It is a free
viral lead-magnet for a Telegram channel about space/futurism/sci-fi.

**Current status: Milestone 1 complete** — scaffold + working client-side star-map
render + poster composition + PNG export. Later milestones add the paid gate,
attribution, and server-side HD export (see "Milestone boundaries").

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

| Package        | Version | License          | Role |
|----------------|---------|------------------|------|
| `d3-celestial` | 0.7.35  | **BSD-3-Clause** | sky map render; bundles d3 v3 + public-domain star/DSO/Milky-Way GeoJSON |
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

`lib/geocode.ts` — `geocode(query)` is a **stub** that only parses `"lat, lng"`.
Real provider is Milestone 2.

UI: `app/page.tsx` → `components/StarMapApp.tsx` (client orchestrator) →
`InputForm.tsx` + `PosterCanvas.tsx`. `app/globals.css` holds theme CSS vars.

## Milestone boundaries

**Done (M1):** scaffold, Telegram shell + theme, client star-map render, poster
compose, PNG export.

**NOT built yet — Milestone 2 (marked `// TODO(milestone-2)` in code):**
subscription / channel-membership gate (`getChatMember`), `initData` HMAC
validation, real geocoder, `start_param` attribution logging, DB (no PlanetScale),
watermark on/off toggle, HD export resolution, server-side Satori/HD render, PDF,
premium styles, payments.

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

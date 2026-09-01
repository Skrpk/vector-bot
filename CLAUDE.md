# CLAUDE.md — vector-bot (Star Map Poster Mini App)

Memory for future sessions. Keep this accurate as the code evolves.

## What this is

A Telegram Mini App that generates a personalized **star map** — the night sky
exactly as it looked at a chosen date + location (first date, birth, wedding).
User picks date + place → previews the sky → downloads a PNG in one of two formats
(tabs): a framed **Poster** or a full-bleed iPhone **Wallpaper**. It is a free viral
lead-magnet for a Telegram channel about space/futurism/sci-fi.

**Current status: Milestone 1.5 complete + dual output formats** — M1 (scaffold +
client star-map render + poster + PNG export), M1.5 (**city search geocoding with
correct timezone→UTC handling**), plus a **Poster / Wallpaper tabbed output**.
Later milestones add the paid gate, attribution logging, and server-side HD export
(see "Milestone boundaries").

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript**. Single Next.js app.
- ESLint (`eslint-config-next`) + Prettier. Turbopack dev/build.
- Deploy target: **Vercel** (serverless/edge).
- **Postgres + Drizzle ORM** (`drizzle-orm` Apache-2.0 / `postgres` Unlicense /
  `drizzle-kit` MIT) — users + download metadata. Neon on Vercel, Docker Postgres
  locally. See "Database". The render path is still client-only; the DB is just
  logging + the future APOD subscription.

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
  **gitignored** (regenerated on install/build, incl. on Vercel). The script also
  **injects Ukrainian constellation names**: it adds a `uk` field to every feature in
  `data/constellations.json` (from `lib/sky/constellations-uk.json`) and registers
  `uk:"Ukrainian"` in celestial.min.js's language table (d3-celestial otherwise resets
  an unknown `namesType` to English). So Ukrainian names survive the regen.
- `scripts/build-constellation-art.mjs` (runs after copy-celestial via `prepare-assets`)
  turns the Stellarium skyculture sources into runtime data — see "Constellation art".
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

- `renderStarMap(container, { date, lat, lng, theme, size?, background?, bgColor?,
milkyWay?, constellations?, constellationNames?, art? }) => Promise<HTMLCanvasElement>`
  — takes a **container element** (d3-celestial owns its own canvas), returns that canvas.
  `art:{set,opacity?}` overlays constellation illustrations (see "Constellation art").
  `background`: `'sky'` (opaque) | `'transparent'`; `bgColor` = fill hex (see `BG_COLORS`).
  The three sky toggles (all default true, names false) map to d3-celestial's `mw.show` /
  `constellations.lines` / `constellations.names` (`namesType:'uk'`, Ukrainian). A faint
  graticule is always drawn.
  **Completion is redraw-quiet-based, not first-redraw:** d3-celestial loads each layer
  (stars / Milky Way / lines / **names**) as a separate async fetch that each calls
  redraw(), so grabbing after the first redraw intermittently drops slow layers (names
  arrive last; cached re-renders reorder). Instead it waits for redraws to stay quiet
  (~320ms), applies the dated view via `skyview()`, waits for quiet again, then snapshots.
- `composePoster(canvas, { starMapCanvas, title, subtitle, watermark, theme, background,
textColor, mutedColor, scrim?, width, height })` — framed circular-sky poster at
  `width`×`height`. **`background` = the PAPER colour OUTSIDE the circle** (the sky's own
  colour is baked into the disc); `textColor`/`mutedColor` come from the paper (white paper
  → dark text). **`POSTER_SIZES`** (21×30 / 30×40 / 40×50 / 50×70 cm, ~150 DPI, long edge
  ≤4096; default 21×30). **`POSTER_PAPERS`** = Deep space / Black / **White** →
  `{bg,text,muted}`; `DEFAULT_POSTER_PAPER_ID='space'`; `posterPaperById(id)`. Size + paper
  are compose-time (recompose from snapshot, no re-render).
- `composeWallpaper(canvas, { starMapCanvas, title, place, date, watermark, background,
width, height })` — full-bleed phone wallpaper: same sky as the poster + **white text
  (title / place / date)** over a **near-opaque dark scrim that fades at the edges** (so
  text never mixes with names/art); the watermark gets its own small scrim. Sky covers the
  whole frame. **`WALLPAPER_SIZES`** = 9:16 / 9:20 / 9:19.5 / 9:21 (default 9:19.5). Feed
  it a `background:'sky'` render (~1600, for crispness).
- `exportPng(canvas, filename) => Promise<void>` — `canvas.toBlob()` download.
- `celestial-config.ts` — the dark, clean d3-celestial config (airy projection,
  zenith-centered local sky), parameterised by `background`, `bgColor` + the three sky
  toggles. Exports **`BG_COLORS`** (`space` #0b1020 / `black` #000000),
  `DEFAULT_BG_COLOR_ID`, `bgColorById`. `types.ts` — `Theme`, `RenderOptions`,
  `PosterOptions`, `PosterSize`, `WallpaperOptions`, `WallpaperSize`, `SkyBackground`,
  `SkyOptions`.
- `scrim.ts` — `drawTextScrim(...)`: an elliptical radial gradient (dark → transparent)
  drawn behind the text so it doesn't mix with constellation names.
- `constellation-art.ts` — the artwork overlay: `ART_SETS`, `loadArtSet`,
  `drawConstellationArt(canvas, mapProjection, {setId, opacity})`. Projects each
  illustration's 3 anchor stars via `Celestial.mapProjection` (scale =
  `canvas.width / (translate()[0]*2)`), solves the image→screen affine, and draws with
  `destination-over` so art sits behind the stars; clipped to the sky disc.
- `constellations-uk.json` — IAU Latin name → Ukrainian constellation name (89 entries),
  consumed by the copy script.
- `constellation-art.generated.json` / `art-anchor-stars.generated.json` — **generated**
  by `scripts/build-constellation-art.mjs` (committed; regenerated on prepare-assets).

`lib/telegram/`:

- `initTelegram() => Promise<{ isTelegram, theme, startParam, initData }>` — applies
  Telegram theme (or default dark in a plain browser), reads `start_param`, and returns
  the raw signed `initData` (empty outside Telegram; never trusted client-side — the
  server validates it).
- `theme.ts` — Telegram themeParams → `Theme`, CSS-var application, `DEFAULT_THEME`.
- `verifyInitData.ts` — **server-side** HMAC validation of `initData` (Node `crypto`):
  rebuilds the data-check-string, compares against `TELEGRAM_BOT_TOKEN`-derived hash
  (constant-time), enforces `auth_date` freshness, returns the parsed `user`. This is
  the Milestone-2 auth foundation, pulled forward for send-to-chat; reuse it for the
  channel gate / attribution.
- `sendPngToChat.ts` — **client** helper: `canvas.toBlob()` → multipart POST to
  `/api/send-to-chat` (with `initData`); maps the "open the bot first" and
  "not-subscribed" (→ `channelUrl`) errors to Ukrainian messages.
- `channelMembership.ts` — **server** `checkChannelMembership(botToken, userId)`: the
  channel-subscription gate. Calls Bot API `getChatMember(TELEGRAM_CHANNEL_ID, userId)`
  (bot must be an **admin** of the channel). Member = creator/administrator/member or
  restricted-with-`is_member`. `left`/`kicked`/`user not found` → not subscribed (returns
  a `channelUrl` from `TELEGRAM_CHANNEL_URL`, or derived from an `@username` channel id).
  Unset `TELEGRAM_CHANNEL_ID` → gate disabled. A `getChatMember` error ("chat not found"
  = bot not admin / wrong id) is **fail-open**: the route logs it and still sends.
- `bootstrap.ts` `openTelegramLink(url)` — opens the channel via the SDK inside Telegram
  (else `window.open`).

**Send-to-chat** (browser download is blocked inside Telegram's webview): in the Mini
App the download button becomes **"Надіслати {постер/шпалери} у чат"** (all UI is
**Ukrainian**). `StarMapApp` POSTs the active canvas PNG + `initData` to
**`/api/send-to-chat`** (`app/api/send-to-chat/route.ts`, Node runtime, multipart),
which: validates `initData` → **checks channel membership** → derives `chat_id` from
`user.id` → calls Bot API **`sendDocument`** (not `sendPhoto` — preserves the PNG). If
not subscribed it returns `403 {error:'not-subscribed', channelUrl}` and the UI shows a
**"Підписатися на канал"** prompt (opens the channel, then the user taps send again).
Needs `TELEGRAM_BOT_TOKEN`; the user must have started the bot. Outside Telegram the
button still downloads (`exportPng`); the render path stays 100% client-side (only the
finished bytes are relayed). `canvasToPngBlob` factored out of `exportPng.ts` and shared.

Location is **city-search only** (via `/api/geocode`); the old manual `lat,lng` entry
was removed, so a place always carries an IANA timezone.

UI: `app/page.tsx` → `components/StarMapApp.tsx` (client orchestrator) →
`InputForm.tsx` (+ `CitySearch.tsx`) + `SkyOptions.tsx` (+ `AboutArt.tsx` attribution
modal, Free Art License) + `PosterCanvas.tsx`. `app/globals.css` holds theme CSS vars.
Constellation art is listed first and defaults **on**; Milky Way defaults **off**. **Wallpaper is the
default tab** (left of Poster). `InputForm` has a customizable **Title** (shown on both
outputs). The **Background** control sets the sky colour _inside_ the circle (both
outputs); a poster-only **Paper** selector (Deep space / Black / White) sets the colour
_outside_ the circle and the text colour. On "Render", StarMapApp renders the sky **twice**
off-screen (poster + wallpaper, wallpaper larger), **snapshots each** into a detached
canvas, and composes both; `PosterCanvas` shows them behind **Poster / Wallpaper tabs**
(both canvases stay mounted, so switching tabs never re-renders). Each tab has a **size
selector** (recomposes from the cached snapshot — no re-render). `SkyOptions` holds the
**shared toggles** (Milky Way / Constellations / Constellation names / Constellation art

- an "Art style" set selector when >1 set) plus the **background colour** (Deep space /
  Black), all applied to _both_ outputs; changing any **re-renders** both skies (pixels
  change) from the last inputs (`lastPayloadRef`). When
  names are on, the compose step draws a fading dark **scrim** behind the text; the chosen
  `background`+`scrim` are stored in each output's meta so size-recompose stays consistent.
  Download exports the active tab with its size in the name
  (`star-map-<date>-<size>.png` / `star-wallpaper-<date>-<ratio>.png`).

## Constellation art (Stellarium-style overlay)

Optional illustrations warped onto the constellations, toggled in Sky options; works
on both outputs and supports **multiple switchable sets** (skycultures).

- **Sources** (committed): `assets-src/skyculture-<set>/index.json` (Stellarium format:
  each constellation's `image` has `size` + 3 `anchors` of `{pos:[x,y], hip}`) and the
  illustrations in `public/constellation-art/<set>/*.png` (served at
  `/constellation-art/<set>/<file>`). Currently one set: **modern** (85 images, ~2.2 MB).
- **Build** (`scripts/build-constellation-art.mjs`): emits `lib/sky/*.generated.json` —
  the per-set anchors (only for images actually shipped) and a `{hip:[ra,dec]}` map for
  the anchor stars (resolved from `stars.14.json`). Runs after copy-celestial.
- **Render**: `renderStarMap` with `art:{set}` renders the sky **transparent**, then
  composites on a temp canvas: **bg → art → stars**. The Stellarium PNGs are grey figures
  on **black**, so art is drawn with **additive blend** (`lighter`) over the background —
  black adds nothing (no dark panels on any bg), only the figure lightens the sky. Art is
  affine-warped per constellation and **not** disc-clipped (so edge figures aren't sliced);
  only constellations whose 3 anchors are all inside the disc are drawn. It's a 3-point
  **affine** placement (not Stellarium's mesh warp) — good, slightly approximate for
  large/edge constellations.
- **Add a set**: drop `assets-src/skyculture-<name>/index.json` +
  `public/constellation-art/<name>/*.png`, rerun `npm run build-art`. The UI "Art style"
  selector appears automatically once there's more than one set.

## Geocoding + timezone (Milestone 1.5)

Users type a **city name** and pick from debounced suggestions; the resolved IANA
**timezone** is what makes local→UTC correct (the whole point — a wrong instant
rotates the sky). City search is the only location input (manual coords removed).

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
  when known, else treats the wall clock as UTC (defensive fallback; unreachable now
  that a city — always with a tz — is required). `InputForm` resolves the instant and
  passes it to `renderStarMap`, whose
  `opts.date` is now the **absolute UTC instant** (it sets d3-celestial's `timezone`
  to the browser offset to render at that instant unshifted — see renderStarMap).
- **Attribution**: a persistent footer credits Open-Meteo (courtesy) and
  "© OpenStreetMap contributors" (required when the Nominatim fallback is used).
- Verified: Prague → 50.088, 14.421, `Europe/Prague`; 21:30 local resolves to
  19:30Z and d3-celestial's zenith RA matches the computed sidereal time to 0.00°;
  Prague/Kyiv/NYC at the same wall clock give three different instants + skies.
  `// TODO`: reverse geocoding / "use my location" (GPS) in `CitySearch`.

## Database (users + download metadata)

**Postgres + Drizzle**. Stores who used the app and what they generated — **never the
image**. Neon on Vercel (from the Vercel Postgres integration → injects
`DATABASE_URL`); local **Docker Postgres** via `docker-compose.yml`. Same wire protocol
both places, so `DATABASE_URL` is the only difference.

`lib/db/`:

- `schema.ts` — three tables. **`users`** (`id` = Telegram user id PK, username/first_name/
  language_code, **`apod_subscribed`** bool + `apod_subscribed_at`, **`blocked`** bool
  (set when a broadcast send fails; cleared on any interaction), timestamps).
  **`downloads`** (uuid PK, `user_id` FK, title, event_date, place_name/lat/lng/timezone,
  `output_kind`, `size_id`, `bg_color_id`, `sky_options` jsonb, created_at). **`apod_posts`**
  (`apod_date` PK, title/explanation/**explanation_uk**/media_type/url/hdurl/thumbnail_url/copyright,
  fetched_at, broadcast_at — the daily-APOD cache; see "NASA APOD daily broadcast").
- `index.ts` — **lazy** `getDb()` (postgres.js, `max:1`, cached on `globalThis`). Lazy so
  importing it never connects or throws at build time / on DB-less routes; only connects
  on first query. Throws if `DATABASE_URL` is unset.
- `queries.ts` — `upsertUser`, `insertDownload`, **`recordDownload(user, meta)`** (upsert +
  insert in one, coercing client meta defensively — the FK `userId` comes from validated
  initData, not the meta); APOD: `setApodSubscription`, `isApodSubscribed`,
  `getApodSubscriberIds`, `saveApodPost`, `getFreshApodPost`, `getApodPostByDate`,
  `claimApodBroadcast`.
- `downloadMeta.ts` — the `DownloadMeta` type (type-only; shared by the browser client and
  the server so the client never imports the DB).

**Logging path:** on a **successful** send, `StarMapApp` includes a `meta` JSON (title /
date / place / output kind / size / bg / sky options) in the send form; `/api/send-to-chat`
parses it and calls `recordDownload` — **best-effort, in a try/catch**, and skipped when
`DATABASE_URL` is unset, so a DB hiccup never fails a send the user already got. Only
Telegram sends are logged (the browser download is a dev-only fallback, unauthenticated).

**Migrations:** drizzle-kit. `npm run db:generate` (writes SQL to `drizzle/`, committed) →
`npm run db:migrate` (applies; needs `DATABASE_URL`). Also `db:push` (dev) / `db:studio`.

**Local Docker:** `docker compose up -d db` starts Postgres (`postgres://vector:vector@
localhost:5432/vector`); `docker compose up` also builds + runs the app (`Dockerfile`,
Next `output:'standalone'`). The app publishes `${APP_PORT:-3000}`, so set `APP_PORT` when a
local `npm run dev` already holds 3000. Telegram needs a public HTTPS URL, so to test
the Mini App run a tunnel (cloudflared/ngrok) to :3000 and point a **test bot**'s Mini App
URL at it (test bot token in `.env.local`). API routes/DB can be tested with curl without
Telegram.

## NASA APOD daily broadcast

Subscribers get NASA's **Astronomy Picture of the Day** in their chat, once a day.

- **`lib/nasa/apod.ts`** — `fetchApod(date?)` hits `api.nasa.gov/planetary/apod`
  (`NASA_API_KEY` or `DEMO_KEY`, `thumbs=true`), normalizes to `ApodData` (image has
  `hdurl`; video has `url` + maybe `thumbnail_url`; `copyright` optional). Returns null on
  any failure.
- **`lib/openai/translateApod.ts`** — `translateApodToUk(title, explanation)`: one OpenAI
  Chat Completions call (`OPENAI_API_KEY`, `OPENAI_MODEL` default `gpt-4o-mini`, plain
  `fetch`, no SDK) rewriting the English description into an engaging **Ukrainian** blurb
  (4–5 sentences, main facts only, light `<b>/<i>` formatting, ≤800 chars). Output is run
  through `sanitizeTelegramHtml` (escape-all, re-allow only `<b><i><u><s>`). Returns null on
  any failure → the sender falls back to English. Called **once/day** in the cron.
- **Cache**: `apod_posts` table (see Database), one row per APOD date, storing both
  `explanation` (English) and `explanation_uk` (the OpenAI rewrite). `saveApodPost` upserts;
  `getFreshApodPost(24h)` returns the latest still-fresh row.
- **`/api/cron/apod`** (GET, Node, `maxDuration:300`) — the daily job. Auth: if
  `CRON_SECRET` is set, requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends
  this); unset → open (local). **Noon-Kyiv gate:** Vercel Cron is UTC-only / no DST, so
  `vercel.json` schedules **both `0 9` and `0 10` UTC** and the handler runs only when the
  real `Europe/Kyiv` hour is 12 (so exactly one fires at noon Kyiv year-round, EET/EEST);
  `?force=1` bypasses the gate for manual testing. Then: fetch (+ Ukrainian translation) →
  `saveApodPost` → **`claimApodBroadcast(date)`** (atomic `UPDATE … WHERE broadcast_at IS
NULL RETURNING` — a second run returns `skipped:'already broadcast'`) → for every
  `getApodSubscriberIds()` (with a ~40ms gap) **re-check channel membership at send time**:
  a member gets the post; a subscriber who has since **left the channel** gets a Ukrainian
  "rejoin the channel" nudge instead (they stay subscribed, so posts resume when they
  rejoin — counted as `reminded`). A "bot blocked / chat not found" send error
  a "bot blocked / user deactivated / chat not found" send error marks the user
  **`blocked`** (`setBlocked`) — they stay subscribed but the broadcast skips them
  (`getApodSubscriberIds` filters `blocked=false`); the flag is **cleared on any
  interaction** (`upsertUser` sets `blocked=false`), so starting the bot again resumes
  posts. Response: `{sent, failed, blocked, reminded}`.
- **Send** (`lib/telegram/sendApod.ts` + `botApi.ts`) — delivers the **real media inline**
  so the user never follows a link: image → `sendPhoto`; **.gif** → `sendAnimation`; direct
  **video** (.mp4…) → `sendVideo` by URL when ≤20 MB, else **download + multipart upload**
  when ≤50 MB (buffered in memory, no disk, nothing to clean up); >50 MB or **YouTube/Vimeo**
  (not a downloadable file) → thumbnail photo + a watch link. **One post**: the title +
  description ride as the media's **caption** (`buildCaption`), which prefers the Ukrainian
  `explanation_uk` (already safe HTML — used as-is) and falls back to the escaped English
  `explanation`, word-boundary-truncated to Telegram's 1024-char caption limit (the
  text-only fallback uses the 4096 limit). A watch link is appended **only** when the media
  couldn't be embedded. The footer ends with the original APOD page link and a **VECTOR APP**
  link (`VECTOR_APP_HTML` in botApi — `t.me/vector_2049_bot`; the same link is the caption on
  poster/wallpaper sends). Every post also carries an inline **"Відписатися"** button
  (`UNSUB_MARKUP`, `callback_data:'apod_unsub_post'`) so a user can stop the daily photos
  without leaving the bot; the webhook flips it to a plain **"Підписатися"** (`apod_sub_post`).
  These **`_post`** callbacks re-subscribe **silently** — no immediate re-send, since the user
  already has that post — whereas `/start` & `/nasa`'s `apod_sub` sends today's photo on
  subscribe (see the webhook section: `SUBSCRIBE`/`UNSUBSCRIBE`/`POST_CTX` sets + `toggleButton`).
  **Broadcast reuse:** `callBot`/`callBotForm`
  surface the sent media's `file_id`; the cron passes a shared `MediaCache` so a big video
  is uploaded **once**, then re-sent to every other subscriber by `file_id`. The 20–50 MB
  upload path needs `maxDuration` headroom — **Vercel Pro** (300 s), not Hobby (60 s).
- **Subscription is a bot conversation, NOT in the Mini App.** The webhook
  (`app/api/telegram/webhook/route.ts`) handles three commands: **`/start`** (a preview album
  of `public/star-map.png` + `public/star-wallpaper.png` served from `TELEGRAM_WEBAPP_URL`,
  via `sendMediaGroup` best-effort, then a welcome describing /maps and /nasa + both
  buttons), **`/maps`** (a **web_app** button opening the Mini App at `TELEGRAM_WEBAPP_URL`
  — Telegram can't auto-launch a Mini App from a command, so it's a one-tap button), and
  **`/nasa`** (a **callback** button that subscribes/unsubscribes, its label reflecting the
  current state). Tapping the NASA button toggles the flag, answers with a toast, edits the
  button in place (preserving other buttons like maps on a /start message via the message's
  existing `reply_markup`), and on subscribe **sends today's cached photo immediately** if
  the broadcast already ran. **Subscribing is channel-gated** (same
  `checkChannelMembership` as the star generator): a non-member gets a "join the channel
  first" message with a link button + a retry subscribe button, and is **not** subscribed
  until they join; a gate error fails open. Commands + descriptions are set once via `setMyCommands` (see
  README). The webhook verifies Telegram's `X-Telegram-Bot-Api-Secret-Token` against
  `TELEGRAM_WEBHOOK_SECRET`; the user id comes from the (verified) update, so no `initData`.

## Milestone boundaries

**Done (M1):** scaffold, Telegram shell + theme, client star-map render, poster
compose, PNG export.

**Done (M1.5):** city search geocoding (`/api/geocode`, Open-Meteo + Nominatim),
debounced autocomplete (city-only), timezone→UTC correctness, attribution.

**Done (dual output + sizes + sky toggles):** Poster / Wallpaper tabs — framed poster
(4 print sizes: 21×30 / 30×40 / 40×50 / 50×70 cm) and a full-bleed phone wallpaper
(4 aspect ratios: 9:16 / 9:20 / 9:19.5 / 9:21). Size changes recompose instantly from a
cached snapshot. Three shared **Sky options** toggles (Milky Way, Constellations,
Constellation names in **Ukrainian**), a **background colour** switch (Deep space /
Black), and a **constellation-art overlay** (Stellarium-style, switchable sets) all apply
to both outputs and re-render on change; a fading text scrim keeps the city+date legible
when names are on.
`// TODO(milestone-2)`: true 300-DPI "HD" export behind the paid tier; art mesh-warp for
edge-perfect accuracy; WebP art to cut asset size.

**Done (from Milestone 2):** `initData` HMAC validation (`lib/telegram/verifyInitData.ts`);
**send-to-chat** relay (`/api/send-to-chat`, Bot API `sendDocument`); **channel-membership
gate** (`getChatMember` via `lib/telegram/channelMembership.ts`, `TELEGRAM_CHANNEL_ID` /
`TELEGRAM_CHANNEL_URL`) — see the lib/telegram section above. Needs `TELEGRAM_BOT_TOKEN`
set; the bot must be an admin of the gated channel. **Database** (Postgres + Drizzle):
users + per-download metadata, logged on each successful send. **NASA APOD daily
broadcast** (subscribe toggle → daily Vercel Cron caches + sends the photo; late joiners
get today's cached post immediately) — see "NASA APOD daily broadcast".

**NOT built yet — Milestone 2 (marked `// TODO(milestone-2)` in code):**
`start_param` attribution logging, **persistent geocode cache** (reuse the DB),
watermark on/off toggle, HD export resolution, server-side Satori/HD render, PDF,
premium styles, payments. Also deferred: reverse geocoding / GPS "use my location".
APOD polish: batch/queue the broadcast if the subscriber list grows large (currently a
single sequential loop inside one function invocation).

## Verify locally

```bash
npm run dev          # http://localhost:3000 (respects PORT if 3000 is taken)
npm run build        # must pass — Vercel readiness
npm run lint
npx tsc --noEmit
npm run format       # prettier --write

# Database (local Postgres in Docker)
docker compose up -d db   # start Postgres on :5432
npm run db:migrate        # apply schema (needs DATABASE_URL in env / .env.local)
npm run db:studio         # browse data (drizzle-kit studio)
docker compose up         # build + run the app container too (APP_PORT=3001 if 3000 is taken)
```

Real Telegram theming can't be verified outside Telegram; the plain-browser
fallback (default dark theme) is the local dev path. Testing the Mini App end-to-end
(send-to-chat, gate, logging) needs a **tunnel** (cloudflared/ngrok) to :3000 and a
**test bot** whose Mini App URL points at it — see README / the Database section.

## Stop-and-ask before

Pulling in any large/non-permissive dep; changing core architecture (server-side
render, swapping framework, changing the DB engine/ORM); or reaching for
`astronomy-engine` because d3-celestial quality looks insufficient.

# vector-bot — Star Map Poster Mini App

A Telegram Mini App that renders the night sky for a chosen date + place and lets the
user download a **poster** or phone **wallpaper** PNG. Free lead-magnet for a Telegram
channel. See [`CLAUDE.md`](./CLAUDE.md) for the full architecture.

## Quick start (plain browser)

```bash
npm install
npm run dev        # http://localhost:3000
```

The whole star-map render is client-side, so most of the app works in a plain browser
(default dark theme). Telegram-only features (theming, send-to-chat, the channel gate)
need a real Mini App context — see below.

## Environment

Copy `.env.example` → `.env.local` and fill in what you need:

| Variable                  | Needed for                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | send-to-chat, channel gate, webhook (server-side)                 |
| `TELEGRAM_WEBAPP_URL`     | the `/start` "Generate a Sky Map" button (Mini App HTTPS URL)     |
| `TELEGRAM_WEBHOOK_SECRET` | verifies webhook calls came from Telegram (set at setWebhook too) |
| `TELEGRAM_CHANNEL_ID`     | subscription gate — `@username` or `-100…` id (unset = gate off)  |
| `TELEGRAM_CHANNEL_URL`    | link shown to non-subscribers (optional for a public `@username`) |
| `DATABASE_URL`            | user + download logging + APOD (unset = those features skipped)   |
| `NASA_API_KEY`            | NASA APOD daily photo (optional; DEMO_KEY fallback)               |
| `CRON_SECRET`             | protects the daily APOD cron route (set on Vercel)                |
| `NOMINATIM_USER_AGENT`    | geocoding fallback (optional)                                     |

## Bot commands (webhook)

The bot lives in a webhook, not just the Mini App. Commands:

- **/start** — welcome message with both buttons.
- **/maps** — a one-tap button that opens the Mini App (Telegram can't auto-launch it).
- **/nasa** — a subscribe/unsubscribe button (label reflects your current state); toggling
  it also sends today's cached NASA photo immediately if the daily broadcast has run.

**1. Register the webhook** once the app is reachable over HTTPS (tunnel locally, Vercel
URL in prod). Set `TELEGRAM_WEBAPP_URL` to the same host and `TELEGRAM_WEBHOOK_SECRET` to
the same secret in your env:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<your-host>/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Check/clear with `getWebhookInfo` / `deleteWebhook`.

**2. Register the command descriptions** (shows them in Telegram's `/` menu):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setMyCommands" \
  -H 'content-type: application/json' \
  -d '{"commands":[{"command":"maps","description":"Згенерувати зоряну карту"},{"command":"nasa","description":"Щоденне фото NASA — підписка"},{"command":"start","description":"Почати роботу з ботом"}]}'
```

## Database (Postgres + Drizzle)

Stores users and per-download **metadata** (title, date, place, export config) — never
the image — plus the future NASA APOD subscription flag.

```bash
docker compose up -d db        # local Postgres on :5432 (user/pass/db = vector)
npm run db:migrate             # apply the schema (reads DATABASE_URL)
npm run db:studio              # browse the data
```

`DATABASE_URL` for local dev: `postgres://vector:vector@localhost:5432/vector`.
On **Vercel**, provision Postgres (Neon) from the dashboard — it injects the pooled
`DATABASE_URL` — then run `npm run db:migrate` against it once.

Schema changes: edit `lib/db/schema.ts` → `npm run db:generate` (writes SQL to
`drizzle/`, commit it) → `npm run db:migrate`.

## Testing the Mini App end-to-end (test bot)

Telegram loads a Mini App over **public HTTPS**, so localhost needs a tunnel:

1. Run the app: `npm run dev` (or `docker compose up` to run the app container + DB).
2. Tunnel to it: `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`).
3. In **@BotFather**, create a separate **test bot**, and set its Mini App / Menu Button
   URL to the tunnel's HTTPS URL. Put that bot's token in `.env.local` as
   `TELEGRAM_BOT_TOKEN`.
4. Open the Mini App from the test bot. For the channel gate, add the bot as an **admin**
   of a test channel and set `TELEGRAM_CHANNEL_ID`.

API routes and the DB can be exercised with `curl` without Telegram; only the signed
`initData` flow (send-to-chat) truly needs the Mini App.

## Checks

```bash
npm run build && npm run lint && npx tsc --noEmit
```

## Deploy

Vercel. `public/celestial/` and constellation-art assets are regenerated on install/build.
Set the env vars above in the Vercel project, provision Postgres, and run the migration.

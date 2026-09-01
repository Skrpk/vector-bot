import {
  bigint,
  boolean,
  date,
  doublePrecision,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Telegram Mini App users. `id` is the Telegram user id (from validated
// initData), so it's the natural primary key — no separate surrogate needed.
export const users = pgTable('users', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  username: text('username'),
  firstName: text('first_name'),
  languageCode: text('language_code'),
  // NASA "Astronomy Picture of the Day" subscription (future feature). The daily
  // cron will query `where apodSubscribed = true`.
  apodSubscribed: boolean('apod_subscribed').notNull().default(false),
  apodSubscribedAt: timestamp('apod_subscribed_at', { withTimezone: true }),
  // Set true when a broadcast send fails because the user blocked the bot / is
  // deactivated — the broadcast then skips them. Cleared on any interaction
  // (upsertUser), so starting the bot again automatically un-blocks them.
  blocked: boolean('blocked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per successful send-to-chat. Metadata only — never the image bytes.
export const downloads = pgTable('downloads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id),
  // What the user chose.
  title: text('title'),
  eventDate: date('event_date'), // the date the sky is rendered for
  placeName: text('place_name'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  timezone: text('timezone'),
  // Export config.
  outputKind: text('output_kind').notNull(), // 'poster' | 'wallpaper'
  sizeId: text('size_id'),
  bgColorId: text('bg_color_id'),
  // Remaining toggles/art-set/paper as a flexible blob (see SkyOptions + paper).
  skyOptions: jsonb('sky_options'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Cached NASA "Astronomy Picture of the Day", one row per APOD date. The daily
// cron fetches + upserts today's row, then broadcasts it; a user who subscribes
// after the broadcast is sent the still-fresh cached row immediately (no refetch,
// so we stay well within NASA's rate limit).
export const apodPosts = pgTable('apod_posts', {
  apodDate: date('apod_date').primaryKey(), // NASA APOD date (YYYY-MM-DD)
  title: text('title').notNull(),
  explanation: text('explanation').notNull(), // original English (from NASA)
  // Ukrainian rewrite from OpenAI (4–5 sentences, light Telegram HTML). Null when
  // translation wasn't available; the sender then falls back to the English text.
  explanationUk: text('explanation_uk'),
  mediaType: text('media_type').notNull(), // 'image' | 'video' | other
  url: text('url'), // image or video url
  hdurl: text('hdurl'), // hi-res image (image media only)
  thumbnailUrl: text('thumbnail_url'), // video thumbnail (when available)
  copyright: text('copyright'), // present when not public domain
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  // Set once the daily broadcast for this post has gone out; guards against a
  // double send if the cron fires twice.
  broadcastAt: timestamp('broadcast_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
export type ApodPost = typeof apodPosts.$inferSelect;
export type NewApodPost = typeof apodPosts.$inferInsert;

import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { getDb } from './index';
import {
  apodPosts,
  downloads,
  users,
  type ApodPost,
  type NewApodPost,
  type NewDownload,
} from './schema';
import type { DownloadMeta } from './downloadMeta';
import type { TelegramUser } from '@/lib/telegram/verifyInitData';

/** Insert the user (or refresh their profile fields) from validated initData. */
export async function upsertUser(user: TelegramUser): Promise<void> {
  await getDb()
    .insert(users)
    .values({
      id: user.id,
      username: user.username ?? null,
      firstName: user.first_name ?? null,
      languageCode: user.language_code ?? null,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        username: user.username ?? null,
        firstName: user.first_name ?? null,
        languageCode: user.language_code ?? null,
        updatedAt: sql`now()`,
      },
    });
}

/** Log one successful download/send. Metadata only — no image. */
export async function insertDownload(row: NewDownload): Promise<void> {
  await getDb().insert(downloads).values(row);
}

/**
 * Upsert the user and log one successful send, in one call. The `userId` comes
 * from validated initData (not the client meta), so the FK is always trustworthy.
 * Client-supplied meta is coerced defensively — it's logging data, not auth.
 */
export async function recordDownload(
  user: TelegramUser,
  meta: DownloadMeta
): Promise<void> {
  await upsertUser(user);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  await insertDownload({
    userId: user.id,
    title: str(meta.title),
    eventDate: str(meta.eventDate),
    placeName: str(meta.placeName),
    lat: num(meta.lat),
    lng: num(meta.lng),
    timezone: str(meta.timezone),
    outputKind: meta.outputKind === 'poster' ? 'poster' : 'wallpaper',
    sizeId: str(meta.sizeId),
    bgColorId: str(meta.bgColorId),
    skyOptions:
      meta.skyOptions && typeof meta.skyOptions === 'object' ? meta.skyOptions : null,
  });
}

/** Toggle the NASA APOD subscription. */
export async function setApodSubscription(
  userId: number,
  subscribed: boolean
): Promise<void> {
  await getDb()
    .update(users)
    .set({
      apodSubscribed: subscribed,
      apodSubscribedAt: subscribed ? sql`now()` : null,
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, userId));
}

/** Whether the user is currently subscribed to the APOD broadcast. */
export async function isApodSubscribed(userId: number): Promise<boolean> {
  const rows = await getDb()
    .select({ subscribed: users.apodSubscribed })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.subscribed ?? false;
}

/** Telegram ids of everyone subscribed to the APOD broadcast. */
export async function getApodSubscriberIds(): Promise<number[]> {
  const rows = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.apodSubscribed, true));
  return rows.map((r) => r.id);
}

/** Upsert today's cached APOD post (keyed by its NASA date). */
export async function saveApodPost(post: NewApodPost): Promise<void> {
  await getDb()
    .insert(apodPosts)
    .values(post)
    .onConflictDoUpdate({
      target: apodPosts.apodDate,
      set: {
        title: post.title,
        explanation: post.explanation,
        explanationUk: post.explanationUk ?? null,
        mediaType: post.mediaType,
        url: post.url ?? null,
        hdurl: post.hdurl ?? null,
        thumbnailUrl: post.thumbnailUrl ?? null,
        copyright: post.copyright ?? null,
        fetchedAt: sql`now()`,
      },
    });
}

/**
 * The most recent cached APOD post if it's still fresh (fetched within the last
 * `maxAgeHours`, default 24h) — used to send a just-subscribed user the current
 * post immediately without re-hitting NASA.
 */
export async function getFreshApodPost(maxAgeHours = 24): Promise<ApodPost | null> {
  const rows = await getDb()
    .select()
    .from(apodPosts)
    .where(gt(apodPosts.fetchedAt, sql`now() - make_interval(hours => ${maxAgeHours})`))
    .orderBy(desc(apodPosts.fetchedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Fetch a specific cached post by its APOD date. */
export async function getApodPostByDate(apodDate: string): Promise<ApodPost | null> {
  const rows = await getDb()
    .select()
    .from(apodPosts)
    .where(eq(apodPosts.apodDate, apodDate))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Mark a post broadcast, but only if it hasn't been already — returns true if
 * this call won the race (so the caller should send), false if a prior run
 * already broadcast it. Guards against a double send if the cron fires twice.
 */
export async function claimApodBroadcast(apodDate: string): Promise<boolean> {
  const rows = await getDb()
    .update(apodPosts)
    .set({ broadcastAt: sql`now()` })
    .where(and(eq(apodPosts.apodDate, apodDate), sql`${apodPosts.broadcastAt} is null`))
    .returning({ apodDate: apodPosts.apodDate });
  return rows.length > 0;
}

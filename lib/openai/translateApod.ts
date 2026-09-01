import { sanitizeTelegramHtml } from '@/lib/telegram/botApi';

// Rewrite NASA's APOD description into an engaging Ukrainian blurb via OpenAI.
// Called once per day (in the cron) and cached in the DB, so cost/latency are
// negligible. No SDK — a single fetch to the Chat Completions API.

const SYSTEM_PROMPT = `Ти — редактор україномовного Telegram-каналу про космос, науку та \
астрономію. Тобі дають назву й англійський опис "Астрономічного фото дня" (NASA APOD). \
Напиши стислий український варіант опису, який:
- має щонайбільше 4–5 речень;
- залишає лише головні, найцікавіші факти — жодної "води", закликів кудись перейти чи \
навігації по сайту;
- додає короткий контекст, щоб звичайний читач зрозумів, що зображено і чому це цікаво;
- читається легко й захопливо, природною українською;
- розбитий на короткі абзаци, РОЗДІЛЕНІ ПОРОЖНІМ РЯДКОМ (подвійний перенос рядка), \
щоб текст не був суцільною стіною й легко читався;
- використовує доречні емодзі, щоб оживити текст (наприклад 🌙, ✨, 🔭, ✈️) — по кілька \
на весь текст, без надмірності;
- для легкого форматування використовує ЛИШЕ підтримувані Telegram HTML-теги <b>жирний</b> \
та <i>курсив</i> (наприклад, виділи ключовий термін жирним). НЕ використовуй Markdown, інші \
HTML-теги чи посилання;
- ОБОВ'ЯЗКОВО вкладається у 800 символів (це жорсткий ліміт — текст іде в підпис Telegram).
Поверни ЛИШЕ український текст, без жодних пояснень.`;

/**
 * Translate/rewrite an APOD description into Ukrainian (Telegram-safe HTML).
 * Returns null on any failure so the caller falls back to the English original.
 */
export async function translateApodToUk(
  title: string,
  explanation: string
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Назва: ${title}\n\nОпис: ${explanation}` },
        ],
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    console.error(
      '[openai] translate failed:',
      res.status,
      await res.text().catch(() => '')
    );
    return null;
  }

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) return null;

  // Keep only allowed inline tags; escape everything else so the send can't break.
  return sanitizeTelegramHtml(text);
}

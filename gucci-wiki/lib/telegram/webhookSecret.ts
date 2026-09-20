import crypto from "node:crypto";

// Секрет для заголовка X-Telegram-Bot-Api-Secret-Token, которым Telegram
// подписывает вебхук-запросы (параметр secret_token в setWebhook). Выводится
// из самого токена бота — не требует отдельного хранения: тот же токен
// в /settings уже держится в БД, а этот секрет пересчитывается на лету.
export function webhookSecretFor(botToken: string): string {
  return crypto.createHash("sha256").update(botToken).digest("hex").slice(0, 32);
}

// Сравнение заголовка с ожидаемым секретом — тайминг-безопасное (тот же
// приём, что и в lib/auth/token.ts для подписи сессии), не голое `!==`:
// вебхук открыт всему интернету, посимвольное сравнение теоретически
// давало бы утечку через тайминг ответа.
export function verifyWebhookSecret(received: string | null, botToken: string): boolean {
  if (!received) return false;
  const expected = webhookSecretFor(botToken);
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

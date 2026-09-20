import type { ConnectionTestResult } from "@/lib/settings/s3";

// Проверка токена бота — напрямую HTTP к Bot API (без SDK, это простой
// fetch), как решено в плане. getMe ничего не меняет, только подтверждает
// токен и возвращает username бота.
export async function testTelegramBot(token: string): Promise<ConnectionTestResult & { botUsername?: string }> {
  if (!token) return { ok: false, error: "Введите токен бота." };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok || !body?.ok) {
      return { ok: false, error: body?.description ?? "Токен недействителен." };
    }

    return { ok: true, botUsername: body.result?.username };
  } catch {
    return { ok: false, error: "Не удалось связаться с Telegram." };
  }
}

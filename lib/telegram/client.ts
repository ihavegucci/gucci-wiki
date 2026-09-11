// Отправка сообщений через Telegram Bot API — прямой fetch, без SDK, тот же
// принцип, что и в lib/settings/telegram.ts (getMe). Тот файл — чужая зона
// (кусок 5), поэтому sendMessage живёт отдельно здесь, а не дописан туда.
export async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    return Boolean(res.ok && body?.ok);
  } catch {
    return false;
  }
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/settings/guard";
import { getSettings } from "@/lib/settings/settings";
import { currentOrigin } from "@/lib/telegram/origin";
import { webhookSecretFor } from "@/lib/telegram/webhookSecret";

// Регистрирует наш /api/telegram/webhook в Telegram (setWebhook) —
// разовое действие админа с кнопки в /admin/broadcast, после того как
// токен бота уже сохранён в /settings.
export async function POST() {
  const { response } = await requireAdmin();
  if (response) return response;

  const settings = await getSettings();
  const token = settings.telegramBotToken;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Сначала сохраните токен бота в настройках." }, { status: 400 });
  }

  const origin = await currentOrigin();
  if (!origin) {
    return NextResponse.json({ ok: false, error: "Не удалось определить адрес приложения." }, { status: 400 });
  }
  const webhookUrl = `${origin}/api/telegram/webhook`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecretFor(token) }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      return NextResponse.json({ ok: false, error: body?.description ?? "Не удалось зарегистрировать webhook." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, webhookUrl });
  } catch {
    return NextResponse.json({ ok: false, error: "Не удалось связаться с Telegram." }, { status: 502 });
  }
}

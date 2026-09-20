import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings/settings";
import { activateByToken } from "@/lib/telegram/activation";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { verifyWebhookSecret } from "@/lib/telegram/webhookSecret";

// Принимает апдейты от Telegram (регистрация — POST /api/telegram/webhook/
// register, кнопка "Подключить webhook" в /settings, блок Telegram-бот).
// Единственный сценарий, который нас интересует, — "/start <token>" от
// deep-link-кнопки активации в профиле пользователя.
export async function POST(request: Request) {
  const settings = await getSettings();
  const token = settings.telegramBotToken;
  // Бот не настроен — молча подтверждаем получение, Telegram и не должен
  // сюда стучаться без токена (вебхук просто не будет зарегистрирован).
  if (!token) return NextResponse.json({ ok: true });

  // Проверка, что запрос реально от Telegram — secret_token, который мы
  // сами выставили при регистрации вебхука (см. webhook/register).
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyWebhookSecret(secret, token)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await request.json().catch(() => null);
  const text: unknown = update?.message?.text;
  const chatId: unknown = update?.message?.chat?.id;
  const match = typeof text === "string" ? text.match(/^\/start(?:@\w+)?\s+(\S+)/) : null;

  // Telegram ждёт 200 в любом случае — иначе будет ретраить апдейт бесконечно.
  // Оборачиваем обработку целиком: неожиданная ошибка (например, гонка на
  // уникальном telegramChatId, если один и тот же чат пытается активировать
  // два токена) не должна превращаться в 500.
  try {
    if (match && (typeof chatId === "number" || typeof chatId === "string")) {
      const result = await activateByToken(match[1], String(chatId));
      // Отвечаем в чат в любом исходе, включая неуспешные: молчание бота
      // неотличимо от «бот сломался», и человек повторяет /start по кругу,
      // не понимая, что происходит.
      const reply =
        result.status === "ok"
          ? `Готово, ${result.user.name}! Теперь вы будете получать оповещения gucci-wiki здесь.`
          : result.status === "chat-taken"
            ? "Этот Telegram уже привязан к другому аккаунту в вики. Отвяжите его там или обратитесь к администратору."
            : "Ссылка активации уже использована или устарела. Откройте «Telegram-оповещения» в вики и получите новую.";
      await sendTelegramMessage(token, String(chatId), reply);
    }
  } catch (err) {
    console.error("telegram webhook: failed to process update", err);
  }

  return NextResponse.json({ ok: true });
}

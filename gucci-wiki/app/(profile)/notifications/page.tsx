import { redirect } from "next/navigation";
import { Send, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSettings } from "@/lib/settings/settings";
import { testTelegramBot } from "@/lib/settings/telegram";
import { ensureActivationToken } from "@/lib/telegram/activation";

// Личная страница активации Telegram-бота (R04/G09): персональная
// deep-link-кнопка t.me/<bot>?start=<token>, по которой вебхук
// (app/api/telegram/webhook) привязывает chat_id к этому пользователю.
export default async function NotificationsProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const full = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { telegramChatId: true, telegramActivatedAt: true },
  });
  const activated = Boolean(full.telegramChatId);

  const settings = await getSettings();
  const botToken = settings.telegramBotToken;

  let botUsername: string | undefined;
  if (botToken) {
    const test = await testTelegramBot(botToken);
    if (test.ok) botUsername = test.botUsername;
  }

  const activationToken = !activated ? await ensureActivationToken(user.id) : null;
  const deepLink = botUsername && activationToken ? `https://t.me/${botUsername}?start=${activationToken}` : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-6 md:px-8">
      <div className="flex items-center gap-2.5">
        <Send size={22} className="text-neutral-400" />
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Telegram-оповещения</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Подключите личный Telegram, чтобы получать рассылки от администратора и уведомления о новых статьях.
      </p>

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
        {activated ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 size={16} />
            Бот подключён
            {full.telegramActivatedAt ? ` — с ${full.telegramActivatedAt.toLocaleDateString("ru-RU")}` : ""}
          </div>
        ) : !botToken ? (
          <p className="text-sm text-neutral-500">Администратор ещё не подключил Telegram-бота в настройках.</p>
        ) : !deepLink ? (
          <p className="text-sm text-red-600">Не удалось связаться с ботом. Обратитесь к администратору.</p>
        ) : (
          <a
            href={deepLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
          >
            <Send size={15} />
            Подключить Telegram
          </a>
        )}
      </div>
    </div>
  );
}

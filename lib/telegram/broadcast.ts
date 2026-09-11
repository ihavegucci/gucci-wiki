import { prisma } from "@/lib/db/prisma";
import { getSettings } from "@/lib/settings/settings";
import { sendTelegramMessage } from "@/lib/telegram/client";

export type BroadcastResult = { sent: number; failed: number; skipped: "no-token" | null };

// Рассылка всем, кто активировал бота (у кого заполнен telegramChatId).
// Неактивировавшие просто не попадают в выборку — без ошибок для них.
// Упрощение с известным потолком: рассылка идёт последовательно (не
// параллельно) — при сегменте 5-50 человек (G03) это доли секунды, для
// большего масштаба стоило бы батчить.
export async function broadcastTelegramMessage(text: string): Promise<BroadcastResult> {
  const settings = await getSettings();
  const token = settings.telegramBotToken;
  if (!token) return { sent: 0, failed: 0, skipped: "no-token" };

  const recipients = await prisma.user.findMany({
    where: { telegramChatId: { not: null } },
    select: { telegramChatId: true },
  });

  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const ok = await sendTelegramMessage(token, r.telegramChatId as string, text);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed, skipped: null };
}

// Факт публикации новой статьи (G09) — не про свежесть, отдельное событие.
export async function notifyPagePublished(input: { title: string; spaceName: string; url: string }) {
  const text = `Новая статья: «${input.title}»\nПространство: ${input.spaceName}\n${input.url}`;
  return broadcastTelegramMessage(text);
}

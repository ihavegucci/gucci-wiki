// Внутриприкладные уведомления (G09/G02.2) — колокольчик в топбаре.
// Единственный источник записи сейчас — свежесть статей, но таблица и эти
// хелперы нарочно нейтральны по смыслу: следующий кусок, которому нужно
// показать что-то в колокольчике, просто зовёт createNotification с своим
// `type`/`message`/`link` — не нужно ничего менять здесь.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function createNotification(input: {
  userId: string;
  type: string;
  message: string;
  link?: string | null;
}) {
  return prisma.notification.create({
    data: { userId: input.userId, type: input.type, message: input.message, link: input.link ?? null },
  });
}


export async function createNotificationIfUnread(input: { userId: string; type: string; message: string; link: string }) {
  const lockKey = `${input.userId}|${input.link}|${input.type}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const existing = await tx.notification.findFirst({
      where: { userId: input.userId, link: input.link, type: input.type, read: false },
      select: { id: true },
    });
    if (existing) return null;
    return tx.notification.create({
      data: { userId: input.userId, type: input.type, message: input.message, link: input.link },
    });
  });
}

export type NotificationInput = { userId: string; type: string; message: string; link: string };

// Сколько уведомлений обрабатывается одной транзакцией. Не 1000: на каждое
// берётся свой advisory-lock, а они живут в общей таблице блокировок
// Postgres (max_locks_per_transaction) — тысяча локов в одной транзакции
// рискует получить "out of shared memory" на дефолтных настройках.
const NOTIFICATION_BATCH_SIZE = 50;

function dedupKey(input: { userId: string; link: string; type: string }): string {
  return `${input.userId}|${input.link}|${input.type}`;
}

// Пакетный вариант createNotificationIfUnread для фонового обхода всех
// статей (lib/freshness/service.ts): вместо транзакции на каждую статью —
// одна на полсотни. Дедуп сохранён ровно тот же: локи берутся на те же
// ключи (userId|link|type), поэтому пакет и одиночный вызов со страницы
// статьи по-прежнему взаимно исключают друг друга и дубликат не
// проскакивает. Ключи сортируются перед взятием — два пересекающихся пакета
// иначе могут взять их в разном порядке и встать в дедлок.
export async function createNotificationsIfUnread(inputs: NotificationInput[]): Promise<number> {
  let created = 0;

  for (let i = 0; i < inputs.length; i += NOTIFICATION_BATCH_SIZE) {
    const chunk = inputs.slice(i, i + NOTIFICATION_BATCH_SIZE);
    created += await prisma.$transaction(async (tx) => {
      const keys = chunk.map(dedupKey).sort();
      // Все локи одним запросом, а не циклом по одному: unnest сохраняет
      // порядок массива, поэтому сортировка выше продолжает работать.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(k))
        FROM unnest(ARRAY[${Prisma.join(keys)}]::text[]) AS k
      `;

      const existing = await tx.notification.findMany({
        where: {
          read: false,
          OR: chunk.map((input) => ({ userId: input.userId, link: input.link, type: input.type })),
        },
        select: { userId: true, link: true, type: true },
      });
      const seen = new Set(existing.map((row) => dedupKey({ ...row, link: row.link ?? "" })));

      const fresh = chunk.filter((input) => !seen.has(dedupKey(input)));
      if (fresh.length === 0) return 0;

      const result = await tx.notification.createMany({ data: fresh });
      return result.count;
    });
  }

  return created;
}

export async function listNotifications(userId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function markNotificationRead(id: string, userId: string) {
  return prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
}

// Свежесть статьи + маршрутизация напоминания (G02.1/G02.2): собирает
// данные из БД, зовёт чистую computeFreshness и, если статус не "fresh",
// заводит уведомление адресату — сначала автору, а если автор давно не
// заходил в приложение — эскалирует владельцу пространства.

import { prisma } from "@/lib/db/prisma";
import { computeFreshness, daysBetween, FRESHNESS_LABELS, type FreshnessResult } from "@/lib/freshness/compute";
import {
  createNotificationIfUnread,
  createNotificationsIfUnread,
  type NotificationInput,
} from "@/lib/freshness/notifications";

// Автор считается "ушедшим" из продукта, если не логинился дольше этого
// срока — тогда напоминание об устаревшей статье эскалируется владельцу
// пространства, а не уходит в пустоту (G02.2).
const AUTHOR_INACTIVITY_DAYS = 30;

export async function getPageFreshness(pageId: string): Promise<FreshnessResult | null> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      title: true,
      spaceId: true,
      reviewIntervalDays: true,
      lastReviewedAt: true,
      lastViewedAt: true,
      createdAt: true,
      authorId: true,
      author: { select: { id: true, lastActiveAt: true } },
      space: { select: { ownerId: true } },
    },
  });
  if (!page) return null;

  const siblingActivity = await prisma.page.aggregate({
    where: { spaceId: page.spaceId, id: { not: page.id } },
    _max: { updatedAt: true },
  });

  const result = computeFreshness({
    reviewIntervalDays: page.reviewIntervalDays,
    lastReviewedAt: page.lastReviewedAt,
    lastViewedAt: page.lastViewedAt,
    createdAt: page.createdAt,
    spaceLastEditedAt: siblingActivity._max.updatedAt,
  });

  if (result.status !== "fresh") {
    await notifyFreshness(page, result);
  }

  return result;
}

type NotifiablePage = {
  id: string;
  title: string;
  authorId: string | null;
  author: { id: string; lastActiveAt: Date } | null;
  space: { ownerId: string | null };
};

// Кому и что писать — чистая функция без обращений к БД, чтобы одиночный и
// пакетный пути гарантированно строили одинаковые уведомления (расхождение
// в тексте/типе сломало бы дедуп: он идёт по userId+link+type).
function buildFreshnessNotification(
  page: NotifiablePage,
  result: FreshnessResult,
  now: Date
): NotificationInput | null {
  const authorActive = page.author ? daysBetween(page.author.lastActiveAt, now) <= AUTHOR_INACTIVITY_DAYS : false;

  const targetUserId = page.authorId && authorActive ? page.authorId : page.space.ownerId;
  if (!targetUserId) return null; // нет ни активного автора, ни владельца пространства — напомнить некому

  const escalated = targetUserId !== page.authorId;
  const label = FRESHNESS_LABELS[result.status];

  return {
    userId: targetUserId,
    type: escalated ? "freshness_escalation" : "freshness_reminder",
    link: `/pages/${page.id}`,
    message: escalated
      ? `Автор статьи «${page.title}» давно не заходил, а её статус — ${label}. Как владелец пространства, стоит проверить.`
      : `Статью «${page.title}» пора пересмотреть: статус ${label}.`,
  };
}

async function notifyFreshness(page: NotifiablePage, result: FreshnessResult) {
  const notification = buildFreshnessNotification(page, result, new Date());
  if (!notification) return;
  await createNotificationIfUnread(notification);
}

// Пакетный пересчёт для фонового обхода (instrumentation-node.ts и
// app/api/freshness/recalculate). Точечный getPageFreshness выше остаётся
// для страницы статьи — там нужен результат по одной статье, а не обход.
//
// Раньше обход звал getPageFreshness в цикле: на каждую статью findUnique
// с двумя join'ами, отдельный aggregate по соседям (с одинаковым ответом
// для всех статей одного пространства) и по транзакции на уведомление —
// 3N запросов на N статей. Здесь запросов ровно два плюс по одному на
// полсотни уведомлений.
export async function recalculateAllFreshness(): Promise<{ checked: number; notified: number }> {
  const pages = await prisma.page.findMany({
    select: {
      id: true,
      title: true,
      spaceId: true,
      updatedAt: true,
      reviewIntervalDays: true,
      lastReviewedAt: true,
      lastViewedAt: true,
      createdAt: true,
      authorId: true,
      author: { select: { id: true, lastActiveAt: true } },
      space: { select: { ownerId: true } },
    },
  });

  // «Максимальный updatedAt среди ДРУГИХ статей пространства» нельзя взять
  // groupBy: тот считает максимум вместе с самой статьёй, и любая свежая
  // правка делала бы статью соседкой самой себе. Держим два наибольших
  // значения на пространство: для статьи с максимумом ответ — второй по
  // величине, для всех остальных — первый. При ничьей второй равен первому,
  // то есть сосед с тем же временем правки не теряется.
  const tops = new Map<string, { first: Date | null; second: Date | null }>();
  for (const page of pages) {
    const top = tops.get(page.spaceId) ?? { first: null, second: null };
    if (!top.first || page.updatedAt > top.first) {
      top.second = top.first;
      top.first = page.updatedAt;
    } else if (!top.second || page.updatedAt > top.second) {
      top.second = page.updatedAt;
    }
    tops.set(page.spaceId, top);
  }

  const now = new Date();
  const notifications: NotificationInput[] = [];

  for (const page of pages) {
    const top = tops.get(page.spaceId)!;
    const spaceLastEditedAt = top.first && page.updatedAt >= top.first ? top.second : top.first;

    const result = computeFreshness({
      reviewIntervalDays: page.reviewIntervalDays,
      lastReviewedAt: page.lastReviewedAt,
      lastViewedAt: page.lastViewedAt,
      createdAt: page.createdAt,
      spaceLastEditedAt,
      now,
    });

    if (result.status === "fresh") continue;
    const notification = buildFreshnessNotification(page, result, now);
    if (notification) notifications.push(notification);
  }

  const notified = await createNotificationsIfUnread(notifications);
  return { checked: pages.length, notified };
}

// Учёт просмотра статьи — сигнал посещаемости для автосигнала свежести
// (G02.1). Вызывается со страницы статьи при каждом открытии.

import { prisma } from "@/lib/db/prisma";

export async function recordPageView(pageId: string) {
  await prisma.page
    .update({
      where: { id: pageId },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
    // Статья могла быть удалена между чтением и записью — счётчик
    // просмотров не настолько важен, чтобы валить рендер страницы из-за
    // гонки.
    .catch(() => {});
}

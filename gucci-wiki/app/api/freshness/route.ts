import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPageFreshness } from "@/lib/freshness/service";
import { canEdit } from "@/lib/permissions";

// Настраиваемый TTL статьи (G02.1) и кнопка "проверено сейчас" —
// вызывается из FreshnessBadge.
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!canEdit(user)) {
    return NextResponse.json({ error: "Недостаточно прав для этого действия." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const pageId = typeof body?.pageId === "string" ? body.pageId : "";
  if (!pageId) return NextResponse.json({ error: "Не указана статья." }, { status: 400 });

  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { id: true, reviewIntervalDays: true } });
  if (!page) return NextResponse.json({ error: "Статья не найдена." }, { status: 404 });

  const data: { reviewIntervalDays?: number; lastReviewedAt?: Date } = {};
  if (typeof body.reviewIntervalDays === "number" && Number.isFinite(body.reviewIntervalDays) && body.reviewIntervalDays > 0) {
    data.reviewIntervalDays = Math.floor(body.reviewIntervalDays);
  }
  if (body.markReviewed === true) {
    data.lastReviewedAt = new Date();
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нечего сохранять." }, { status: 400 });
  }

  await prisma.page.update({ where: { id: pageId }, data });

  const result = await getPageFreshness(pageId);
  return NextResponse.json({
    status: result?.status ?? "fresh",
    daysSinceReview: result?.daysSinceReview ?? 0,
    reviewIntervalDays: data.reviewIntervalDays ?? page.reviewIntervalDays,
  });
}

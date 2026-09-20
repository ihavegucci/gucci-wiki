import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

// Содержимое одной версии статьи — только для предпросмотра в истории.
//
// Отдельный роут вместо передачи всех версий пропсами: страница истории
// показывает до 20 снимков, и раньше содержимое каждого уезжало в
// RSC-payload целиком. На статье в 80 КБ это около 1.6 МБ на открытие
// истории ради предпросмотра, которых одновременно открыт максимум один.
export async function GET(_request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Нужно войти." }, { status: 401 });
  }

  const { versionId } = await params;
  const version = await prisma.pageVersion.findUnique({
    where: { id: versionId },
    select: { content: true },
  });
  if (!version) {
    return NextResponse.json({ error: "Версия не найдена — возможно, её вытеснили более новые." }, { status: 404 });
  }

  return NextResponse.json({ content: version.content });
}

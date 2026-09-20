import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";

// Список уже загруженных картинок для модалки «Выбрать из файлов» (кусок 6,
// R08) — чтение, доступно любому залогиненному, без canEdit.

const PAGE_SIZE = 24;

// Курсор, а не offset: список отсортирован по свежести, и любая новая
// загрузка между страницами сдвигает нумерацию — с offset страница 2 начнёт
// повторять хвост страницы 1 и терять то, что уехало за границу. Курсор
// привязан к конкретной записи и такой сдвиг переживает.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  const cursor = new URL(request.url).searchParams.get("cursor");

  // Сортировка по createdAt дополнена id: у пачки файлов из одной загрузки
  // createdAt совпадает до миллисекунды, а курсору нужен строгий порядок,
  // иначе записи с одинаковым временем перескакивают между страницами.
  const rows = await prisma.fileItem
    .findMany({
      where: { mimeType: { startsWith: "image/" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: PAGE_SIZE + 1, // +1 — узнать про следующую страницу без отдельного count()
      select: { id: true, name: true, url: true },
    })
    .catch(() => null);

  // Запись из курсора могли удалить в соседней вкладке — Prisma отвечает на
  // это исключением, а не пустым результатом.
  if (!rows) {
    return NextResponse.json({ error: "Список изменился, откройте окно заново." }, { status: 400 });
  }

  const items = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({
    items,
    nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1].id : null,
  });
}

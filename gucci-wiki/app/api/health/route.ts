import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Healthcheck контейнера (docker-compose.yml/deploy/docker-compose.yml) и
// шага проверки после деплоя (.github/workflows/deploy.yml) — не полагаемся
// на /login: та страница может отвечать 200 даже при недоступной БД.
// Без авторизации: вызывается инфраструктурой, не пользователем, и не
// отдаёт ничего чувствительного.
//
// Проверка FTS отдельно от доступности БД (QA-прогон 4). Функция
// gucci_strip_html и триггер page_search_sync создаются только raw-SQL
// миграцией 20260905003348_page_fulltext_search: база, поднятая через
// `prisma db push` в обход миграций, выглядит полностью рабочей, но поиск в
// ней молча не находит ничего — searchVector никто не заполняет.
//
// Почему предупреждение, а не 503: этот эндпоинт — критерий живости
// контейнера. Ответь он 503, Docker пометил бы контейнер unhealthy навсегда
// (сама по себе отсутствующая миграция не появится), CI-шаг ожидания после
// деплоя упал бы по таймауту, и вика, у которой не работает только поиск,
// оказалась бы недоступна целиком. 503 остаётся ровно за тем, что
// healthcheck и должен ловить, — за неотвечающей БД.
export async function GET() {
  try {
    const [row] = await prisma.$queryRaw<{ hasFunction: boolean; hasTrigger: boolean }[]>`
      SELECT
        EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gucci_strip_html') AS "hasFunction",
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'page_search_sync' AND NOT tgisinternal
        ) AS "hasTrigger"
    `;

    const warnings: string[] = [];
    if (!row?.hasFunction) warnings.push("Отсутствует функция gucci_strip_html — поиск не работает.");
    if (!row?.hasTrigger) warnings.push("Отсутствует триггер page_search_sync — поиск не работает.");
    if (warnings.length > 0) {
      warnings.push("Похоже, схема применена в обход миграций: выполните `prisma migrate deploy`.");
      console.error("[health] полнотекстовый поиск не настроен:", warnings.join(" "));
      return NextResponse.json({ ok: true, warnings });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[health] проверка БД не прошла:", err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

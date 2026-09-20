import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { recalculateAllFreshness } from "@/lib/freshness/service";
import { getCurrentUser } from "@/lib/auth/current-user";

// Ручной/кроновый пересчёт свежести. Основной путь — фоновый таймер раз в
// 6 часов (instrumentation-node.ts); этот эндпоинт нужен, чтобы запустить
// пересчёт вне расписания.
//
// Как вызывать периодически (не входит в код), если фонового таймера мало:
//   0 6 * * * curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//       http://localhost:3000/api/freshness/recalculate
//
// Доступ (ужесточено в QA-прогоне 3). Раньше защита включалась только при
// заданной переменной CRON_SECRET, а её нет ни в одном compose-файле и ни
// в .env.example — то есть в проде эндпоинт был открыт кому угодно из
// интернета (matcher в proxy.ts исключает /api, лимит nginx покрывает
// только /api/auth/*). Один HTTP-запрос разворачивался в сотни запросов к
// Postgres со вставками уведомлений — усиление на два порядка, которым
// можно было положить вику. Плюс это был GET, изменяющий данные, то есть
// его запускал чужой браузер через <img src>. Теперь: только POST и только
// либо админская сессия, либо совпадающий X-Cron-Secret; при незаданном
// CRON_SECRET внешний вызов невозможен вовсе.
// Сравнение секрета за постоянное время — тем же приёмом, что и подпись
// сессии в lib/auth/token.ts: обычное === выходит на первом различающемся
// байте и по времени ответа позволяет подбирать секрет посимвольно.
function secretsMatch(received: string | null, expected: string | undefined): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const secretMatches = secretsMatch(request.headers.get("x-cron-secret"), secret);

  if (!secretMatches) {
    const user = await getCurrentUser();
    if (user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Доступ запрещён." }, { status: 403 });
    }
  }

  // Пакетный пересчёт вместо цикла по статьям (QA-прогон 4). Раньше здесь
  // на каждую статью уходило 2-3 запроса, причём агрегат по пространству
  // повторялся для каждой статьи этого же пространства — один HTTP-запрос
  // разворачивался в сотни запросов к Postgres. Теперь это один проход
  // выборкой и вычисление в памяти.
  const { checked, notified } = await recalculateAllFreshness();

  return NextResponse.json({ checked, notified });
}

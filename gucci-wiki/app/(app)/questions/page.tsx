import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, Check } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEdit } from "@/lib/permissions";
import { resolveQuestionAction } from "@/lib/questions/actions";

const PAGE_SIZE = 20;
// Потолок на число страниц — против `?open=99999999` в адресной строке:
// без него один запрос вытягивает всю таблицу вопросов целиком.
const MAX_PAGES = 50;

const QUESTION_FIELDS = {
  id: true,
  text: true,
  resolved: true,
  createdAt: true,
  author: { select: { name: true, email: true } },
} as const;

// «Показать ещё» наращивает размер выборки, а не листает страницами: обе
// секции живут на одном экране, и пользователь ждёт, что уже показанное
// останется на месте.
function pageFrom(raw: string | undefined): number {
  const page = Number(raw);
  return Number.isInteger(page) && page > 1 ? Math.min(page, MAX_PAGES) : 1;
}

// Вопросы с главной (кусок 4, R12) — видно только Editor+Admin, как
// /admin/users, /settings: редирект на / для остальных.
export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; resolved?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!canEdit(currentUser)) redirect("/");

  const params = await searchParams;
  const openPage = pageFrom(params.open);
  const resolvedPage = pageFrom(params.resolved);

  // Раньше выбирались все вопросы разом, а деление на решённые/нерешённые
  // делалось в JS уже после выборки — то есть база отдавала всю таблицу
  // ради двух списков по двадцать строк.
  const [open, openTotal, resolved, resolvedTotal] = await Promise.all([
    prisma.question.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: openPage * PAGE_SIZE,
      select: QUESTION_FIELDS,
    }),
    prisma.question.count({ where: { resolved: false } }),
    prisma.question.findMany({
      where: { resolved: true },
      orderBy: { createdAt: "desc" },
      take: resolvedPage * PAGE_SIZE,
      select: QUESTION_FIELDS,
    }),
    prisma.question.count({ where: { resolved: true } }),
  ]);

  function moreHref(section: "open" | "resolved") {
    const next = new URLSearchParams({
      open: String(section === "open" ? openPage + 1 : openPage),
      resolved: String(section === "resolved" ? resolvedPage + 1 : resolvedPage),
    });
    return `/questions?${next}`;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
      <div className="flex items-center gap-2.5">
        <MessageSquare size={22} className="text-neutral-400" />
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Вопросы</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Запросы, которые сотрудники отправили с главной страницы.
      </p>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">
          Новые {openTotal > 0 && <span className="text-neutral-400">({openTotal})</span>}
        </h2>
        {open.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">
            Нерешённых вопросов нет.
          </div>
        ) : (
          <ul className="space-y-2">
            {open.map((q) => (
              <li
                key={q.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm text-neutral-900">{q.text}</p>
                  <div className="mt-1.5 text-xs text-neutral-400">
                    {q.author ? `${q.author.name} (${q.author.email})` : "Удалённый пользователь"} · {q.createdAt.toLocaleString("ru-RU")}
                  </div>
                </div>
                <form action={resolveQuestionAction}>
                  <input type="hidden" name="questionId" value={q.id} />
                  <button
                    type="submit"
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                  >
                    <Check size={14} />
                    Отметить решённым
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {open.length < openTotal && openPage < MAX_PAGES && (
          <Link
            href={moreHref("open")}
            scroll={false}
            className="mt-2 block rounded-lg border border-neutral-200 py-2 text-center text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Показать ещё
          </Link>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">
          Решённые {resolvedTotal > 0 && <span className="text-neutral-400">({resolvedTotal})</span>}
        </h2>
        {resolved.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">
            Решённых вопросов пока нет.
          </div>
        ) : (
          <ul className="space-y-2">
            {resolved.map((q) => (
              <li
                key={q.id}
                className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 opacity-70"
              >
                <p className="text-sm text-neutral-700">{q.text}</p>
                <div className="mt-1.5 text-xs text-neutral-400">
                  {q.author ? `${q.author.name} (${q.author.email})` : "Удалённый пользователь"} · {q.createdAt.toLocaleString("ru-RU")}
                </div>
              </li>
            ))}
          </ul>
        )}
        {resolved.length < resolvedTotal && resolvedPage < MAX_PAGES && (
          <Link
            href={moreHref("resolved")}
            scroll={false}
            className="mt-2 block rounded-lg border border-neutral-200 py-2 text-center text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Показать ещё
          </Link>
        )}
      </section>
    </div>
  );
}

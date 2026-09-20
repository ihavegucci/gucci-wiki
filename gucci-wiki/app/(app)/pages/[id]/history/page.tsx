import Link from "next/link";
import { notFound } from "next/navigation";
import { Home, ChevronRight, History, RotateCcw } from "lucide-react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canEdit } from "@/lib/permissions";
import { restorePageVersionAction } from "@/lib/pages/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import VersionPreview from "@/components/editor/VersionPreview";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Плоский текст из HTML — для строчки-выдержки в списке. Тот же принцип,
// что у searchText: теги выкидываем, а не рендерим.
function excerpt(html: string, max = 160): string {
  const flat = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!flat) return "Пустая версия";
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

function sizeLabel(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1 ? "меньше 1 КБ" : `${kb.toFixed(1)} КБ`;
}

export default async function PageHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const page = await prisma.page.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      updatedAt: true,
      space: { select: { slug: true, name: true } },
      // content версий здесь НЕ выбирается: полный HTML каждой из 20 версий
      // уезжал бы в RSC-payload страницы (на статье в 80 КБ это ~1.6 МБ),
      // хотя предпросмотр открывают по одному и он подгружает версию сам —
      // /api/pages/versions/[versionId]. Для строчки списка хватает выдержки,
      // которую считает Postgres (см. excerpts ниже).
      versions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      },
    },
  });
  if (!page) notFound();

  // Выдержка и размер — из БД, обрезанные до чтения: тащить content целиком
  // ради 160 символов на строку смысла нет. octet_length считается по всему
  // значению, поэтому размер остаётся честным.
  const excerpts = page.versions.length
    ? await prisma.$queryRaw<{ id: string; preview: string; bytes: number }[]>`
        SELECT id, substring(content from 1 for 600) AS preview, octet_length(content) AS bytes
        FROM "PageVersion"
        WHERE id IN (${Prisma.join(page.versions.map((v) => v.id))})
      `
    : [];
  const excerptById = new Map(excerpts.map((e) => [e.id, e]));

  const user = await getCurrentUser();
  const userCanEdit = canEdit(user);

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-6 flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-neutral-400">
        <Link href="/" className="flex items-center gap-1.5 hover:text-neutral-600">
          <Home size={14} />
        </Link>
        <ChevronRight size={13} />
        <Link href={`/spaces/${page.space.slug}`} className="hover:text-neutral-600">
          {page.space.name}
        </Link>
        <ChevronRight size={13} />
        <Link href={`/pages/${page.id}`} className="truncate hover:text-neutral-600">
          {page.title}
        </Link>
        <ChevronRight size={13} />
        <span className="text-neutral-600">История</span>
      </div>

      <div className="flex items-center gap-2.5">
        <History size={22} className="text-neutral-400" />
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">История версий</h1>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        Снимок содержимого сохраняется каждый раз, когда статью перезаписывают. Хранятся последние 20 —
        более старые вытесняются автоматически.
      </p>

      {/* Текущая версия — первой строкой и визуально отделена: без неё
          непонятно, с чем сравнивать сохранённые снимки. */}
      <div className="mt-6 rounded-xl border border-neutral-900/10 bg-neutral-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-900">
              Сейчас в статье · {dateFormatter.format(page.updatedAt)}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{excerpt(page.content)}</p>
          </div>
          <Link
            href={`/pages/${page.id}`}
            className="shrink-0 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Открыть статью
          </Link>
        </div>
      </div>

      {page.versions.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-400">
          Сохранённых версий пока нет — они появятся, когда статью перезапишут.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {page.versions.map((version, index) => (
            <li
              key={version.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-900">
                    {dateFormatter.format(version.createdAt)}
                    {index === 0 && (
                      <span className="ml-2 rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-normal text-neutral-500">
                        предыдущая
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    Заменил: {version.author?.name ?? "неизвестно"} ·{" "}
                    {sizeLabel(excerptById.get(version.id)?.bytes ?? 0)}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-neutral-500">
                    {excerpt(excerptById.get(version.id)?.preview ?? "")}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <VersionPreview versionId={version.id} />
                  {userCanEdit && (
                    <form action={restorePageVersionAction}>
                      <input type="hidden" name="versionId" value={version.id} />
                      <ConfirmSubmitButton
                        confirmMessage={
                          `Восстановить версию от ${dateFormatter.format(version.createdAt)}? ` +
                          "Текущее содержимое статьи не пропадёт — оно тоже уйдёт в историю, и откат можно будет отменить."
                        }
                        className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
                      >
                        <RotateCcw size={15} />
                        Восстановить
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

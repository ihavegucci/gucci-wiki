import Link from "next/link";
import { notFound } from "next/navigation";
import { Home, ChevronRight, Plus, FileText, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSpaceIcon, getSpaceColorClasses } from "@/lib/spaces/icons";
import { createPageAction } from "@/lib/pages/actions";
import { deleteSpaceAction } from "@/lib/spaces/actions";
import { canEdit } from "@/lib/permissions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

export default async function SpaceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const space = await prisma.space.findUnique({
    where: { slug },
    include: {
      // Пустые заглушки («Новая статья» без сохранённого содержимого) не
      // показываем — черновик ≠ публикация (см. lib/pages/actions.ts,
      // тот же принцип, что уже применялся к Telegram-уведомлению).
      // Нашла слепая проверка (G3): раньше заглушки были видны всем и
      // засчитывались в счётчик статей пространства.
      // select, а не include (QA-прогон 3): в списке рисуются только
      // заголовок, автор и дата, а include тянул все поля Page — включая
      // content и его плоскую копию searchText. Пространство на 100 статей
      // по ~80 КБ означало ~16 МБ, прочитанных и сериализованных на каждый
      // рендер страницы ради списка заголовков.
      pages: {
        where: { published: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          author: { select: { name: true } },
        },
      },
    },
  });
  if (!space) notFound();

  const user = await getCurrentUser();
  const userCanEdit = canEdit(user);
  const Icon = getSpaceIcon(space.icon);

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-6 flex items-center gap-1.5 text-sm text-neutral-400">
        <Link href="/" className="flex items-center gap-1.5 hover:text-neutral-600">
          <Home size={14} />
        </Link>
        <ChevronRight size={13} />
        <span className="text-neutral-600">{space.name}</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${getSpaceColorClasses(space.color)}`}>
          {/* eslint-disable-next-line react-hooks/static-components -- Icon приходит из статической таблицы по ключу, ссылка стабильна */}
          <Icon size={22} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{space.name}</h1>
          {space.description && <p className="mt-1 text-neutral-500">{space.description}</p>}
        </div>
        {userCanEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <form action={createPageAction}>
              <input type="hidden" name="spaceSlug" value={space.slug} />
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
              >
                <Plus size={16} />
                Новая статья
              </button>
            </form>
            <form action={deleteSpaceAction}>
              <input type="hidden" name="spaceId" value={space.id} />
              <ConfirmSubmitButton
                confirmMessage={`Удалить пространство «${space.name}»? Все статьи внутри него тоже будут удалены безвозвратно.`}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={16} />
                Удалить пространство
              </ConfirmSubmitButton>
            </form>
          </div>
        )}
      </div>

      {space.pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-400">
          В этом пространстве пока нет статей.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {space.pages.map((page) => (
            <Link
              key={page.id}
              href={`/pages/${page.id}`}
              className="group flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-sm"
            >
              <FileText size={18} className="mt-0.5 shrink-0 text-neutral-300" />
              <div className="min-w-0">
                <div className="truncate font-medium text-neutral-900">{page.title}</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {page.author?.name ?? "Без автора"} · {dateFormatter.format(page.updatedAt)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
